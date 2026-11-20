import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminAiConfig } from '../../admin-ai.config';
import {
  AiProviderError,
  type AiChatMessage,
  type AiGenerateOptions,
  type AiModelProvider,
  type AiModelRequest,
  type AiModelResponse,
  type AiStopReason,
  type AiToolCall,
} from '../model-provider.interface';

/**
 * Wire types for Ollama's POST /api/chat (https://docs.ollama.com/api/chat).
 * Only the fields this adapter sends or reads are declared.
 */
interface OllamaToolCall {
  function: { name: string; arguments: unknown };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  /** Tool-result messages only: which tool produced the result. */
  tool_name?: string;
}

interface OllamaChatChunk {
  model?: string;
  message?: { content?: string; tool_calls?: OllamaToolCall[] };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/**
 * What this adapter stores as `providerContent` for an assistant turn. Ollama
 * tool calls carry no id, so the adapter makes one per call; `callIds[i]`
 * belongs to `message.tool_calls[i]`. Replaying the turn sends `message`
 * unchanged and uses the ids to name the tool behind each tool result.
 */
export interface OllamaAssistantTurn {
  message: OllamaMessage;
  callIds: string[];
}

const RETRY_BASE_DELAY_MS = 500;

/**
 * Local-model adapter for Ollama. Streams NDJSON so text reaches the admin as
 * it is generated. Retries (AI_MAX_RETRIES) cover a refused connection and
 * 429/5xx before any output has been read; a stream that fails midway is not
 * retried, because the admin has already seen part of the answer.
 */
@Injectable()
export class OllamaModelProvider implements AiModelProvider {
  readonly name = 'ollama';
  private readonly config: AdminAiConfig;
  private nextCallId = 0;

  constructor(configService: ConfigService) {
    this.config = configService.get<AdminAiConfig>('adminAi') as AdminAiConfig;
  }

  isConfigured(): boolean {
    return Boolean(this.config.baseUrl && this.config.model);
  }

  async generate(request: AiModelRequest, options: AiGenerateOptions): Promise<AiModelResponse> {
    if (!this.isConfigured()) {
      throw new AiProviderError('not_configured', 'The AI provider is not configured.');
    }

    const body = JSON.stringify({
      model: this.config.model,
      stream: true,
      messages: toOllamaMessages(request),
      tools: request.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
      })),
      options: { num_predict: request.maxOutputTokens, num_ctx: this.config.contextTokens },
    });

    try {
      const response = await this.send(body, options.signal);
      return await this.readStream(response, options);
    } catch (error) {
      throw normalizeError(error, options.signal);
    }
  }

  private async send(body: string, signal: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

    for (let attempt = 0; ; attempt += 1) {
      let response: Response | null = null;
      let failure: unknown = null;
      try {
        response = await fetch(`${this.config.baseUrl}/api/chat`, { method: 'POST', headers, body, signal });
      } catch (error) {
        failure = error;
      }

      if (response?.ok) return response;
      if (signal.aborted) throw failure ?? new AiProviderError('cancelled', 'The request was cancelled.');

      const retryable = response === null || response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= this.config.maxRetries) {
        if (response) {
          await response.body?.cancel().catch(() => undefined);
          throw httpError(response.status, this.config.model);
        }
        throw failure;
      }
      await response?.body?.cancel().catch(() => undefined);
      await delay(RETRY_BASE_DELAY_MS * 2 ** attempt, signal);
    }
  }

  private async readStream(response: Response, options: AiGenerateOptions): Promise<AiModelResponse> {
    if (!response.body) throw new AiProviderError('unavailable', 'The AI model server returned an empty response.');

    let text = '';
    const toolCalls: OllamaToolCall[] = [];
    let final: OllamaChatChunk | null = null;
    let model = this.config.model;

    const handle = (line: string) => {
      if (!line.trim()) return;
      let chunk: OllamaChatChunk;
      try {
        chunk = JSON.parse(line) as OllamaChatChunk;
      } catch {
        throw new AiProviderError('unavailable', 'The AI model server sent a malformed response.');
      }
      if (chunk.error) throw new AiProviderError('unavailable', 'The AI model server reported an error.');
      if (chunk.model) model = chunk.model;
      const delta = chunk.message?.content ?? '';
      if (delta) {
        text += delta;
        options.onTextDelta?.(delta);
      }
      if (chunk.message?.tool_calls?.length) toolCalls.push(...chunk.message.tool_calls);
      if (chunk.done) final = chunk;
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        handle(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    handle(buffer + decoder.decode());

    const finalChunk = final as OllamaChatChunk | null;
    if (!finalChunk) throw new AiProviderError('unavailable', 'The AI model server ended the response early.');

    const callIds = toolCalls.map(() => `ollama_call_${(this.nextCallId += 1)}`);
    const calls: AiToolCall[] = toolCalls.map((call, index) => ({
      id: callIds[index],
      name: call.function.name,
      input: call.function.arguments ?? {},
    }));
    const turn: OllamaAssistantTurn = {
      message: { role: 'assistant', content: text, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
      callIds,
    };

    return {
      text,
      toolCalls: calls,
      stopReason: toStopReason(finalChunk.done_reason, calls.length > 0),
      usage: { inputTokens: finalChunk.prompt_eval_count ?? 0, outputTokens: finalChunk.eval_count ?? 0 },
      model,
      providerContent: turn,
    };
  }
}

function isAssistantTurn(value: unknown): value is OllamaAssistantTurn {
  const turn = value as OllamaAssistantTurn | null;
  return Boolean(turn && typeof turn === 'object' && turn.message?.role === 'assistant' && Array.isArray(turn.callIds));
}

export function toOllamaMessages(request: AiModelRequest): OllamaMessage[] {
  const messages: OllamaMessage[] = [{ role: 'system', content: request.system }];
  const toolNames = new Map<string, string>();

  for (const message of request.messages) {
    messages.push(...toOllama(message, toolNames));
  }
  return messages;
}

function toOllama(message: AiChatMessage, toolNames: Map<string, string>): OllamaMessage[] {
  if (message.role === 'assistant' && isAssistantTurn(message.providerContent)) {
    const { message: replay, callIds } = message.providerContent;
    replay.tool_calls?.forEach((call, index) => {
      if (callIds[index]) toolNames.set(callIds[index], call.function.name);
    });
    return [replay];
  }
  if (typeof message.content === 'string') {
    return [{ role: message.role, content: message.content }];
  }

  // Tool results first (Ollama expects them right after the assistant turn that asked for them), then any text.
  const toolResults: OllamaMessage[] = [];
  const texts: string[] = [];
  for (const block of message.content) {
    if (block.type === 'tool_result') {
      const toolName = toolNames.get(block.toolCallId);
      toolResults.push({
        role: 'tool',
        content: block.isError && !block.content.startsWith('Error') ? `Error: ${block.content}` : block.content,
        ...(toolName ? { tool_name: toolName } : {}),
      });
    } else {
      texts.push(block.text);
    }
  }
  return texts.length ? [...toolResults, { role: message.role, content: texts.join('\n\n') }] : toolResults;
}

function toStopReason(reason: string | undefined, hasToolCalls: boolean): AiStopReason {
  if (hasToolCalls) return 'tool_use';
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    default:
      return 'other';
  }
}

function httpError(status: number, model: string): AiProviderError {
  if (status === 404) {
    return new AiProviderError('bad_request', `The AI model "${model}" is not available on the model server. Pull it with Ollama first.`);
  }
  if (status === 401 || status === 403) {
    return new AiProviderError('auth', 'The AI model server rejected the configured credentials.');
  }
  if (status === 429) {
    return new AiProviderError('rate_limited', 'The AI model server is busy. Try again shortly.');
  }
  if (status >= 400 && status < 500) {
    return new AiProviderError('bad_request', 'The AI model server rejected the request.');
  }
  return new AiProviderError('unavailable', 'The AI model server is unavailable right now.');
}

export function normalizeError(error: unknown, signal?: AbortSignal): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return new AiProviderError('cancelled', 'The request was cancelled.');
  }
  if (error instanceof TypeError) {
    // fetch() rejects with TypeError when the server can't be reached (refused, DNS, reset).
    return new AiProviderError('unavailable', "Can't reach the AI model server. Check that Ollama is running.");
  }
  return new AiProviderError('unknown', 'The AI request failed.');
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AiProviderError('cancelled', 'The request was cancelled.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
