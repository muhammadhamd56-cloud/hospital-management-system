import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AdminAiConfig } from '../../admin-ai.config';
import {
  AiProviderError,
  type AiChatMessage,
  type AiGenerateOptions,
  type AiModelProvider,
  type AiModelRequest,
  type AiModelResponse,
  type AiStopReason,
} from '../model-provider.interface';

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_CAPABLE_MODEL = /^claude-(opus-5(-5)?|fable-5(-[12])?|sonnet-5-5)$/;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Claude adapter on the official SDK. Streams so text reaches the admin as it
 * is written; the SDK's own bounded retries (AI_MAX_RETRIES) cover 429/5xx.
 */
@Injectable()
export class AnthropicModelProvider implements AiModelProvider {
  readonly name = 'anthropic';
  private readonly config: AdminAiConfig;
  private readonly client: Anthropic | null;

  constructor(configService: ConfigService) {
    this.config = configService.get<AdminAiConfig>('adminAi') as AdminAiConfig;
    this.client = this.config.apiKey
      ? new Anthropic({ apiKey: this.config.apiKey, maxRetries: this.config.maxRetries })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async generate(request: AiModelRequest, options: AiGenerateOptions): Promise<AiModelResponse> {
    if (!this.client) {
      throw new AiProviderError('not_configured', 'The AI provider is not configured.');
    }

    const model = this.config.model;
    const useFallbacks = FALLBACK_CAPABLE_MODEL.test(model);

    try {
      const stream = this.client.beta.messages.stream(
        {
          model,
          max_tokens: request.maxOutputTokens,
          // Stable prefix (tools + system) cached; the per-request context lives in messages.
          system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
          tools: request.tools.map(
            (tool): BetaTool => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.inputSchema as BetaTool['input_schema'],
            }),
          ),
          messages: request.messages.map(toAnthropicMessage),
          output_config: { effort: 'medium' },
          ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        },
        { signal: options.signal },
      );

      if (options.onTextDelta) {
        stream.on('text', (delta) => options.onTextDelta?.(delta));
      }

      const message = await stream.finalMessage();
      const content = message.content as BetaContentBlock[];

      return {
        text: content
          .filter((block): block is Extract<BetaContentBlock, { type: 'text' }> => block.type === 'text')
          .map((block) => block.text)
          .join(''),
        toolCalls: content
          .filter((block): block is Extract<BetaContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
          .map((block) => ({ id: block.id, name: block.name, input: block.input })),
        stopReason: toStopReason(message.stop_reason),
        usage: {
          inputTokens:
            (message.usage.input_tokens ?? 0) +
            (message.usage.cache_read_input_tokens ?? 0) +
            (message.usage.cache_creation_input_tokens ?? 0),
          outputTokens: message.usage.output_tokens ?? 0,
        },
        model: message.model,
        providerContent: content,
      };
    } catch (error) {
      throw normalizeError(error);
    }
  }
}

function toAnthropicMessage(message: AiChatMessage): BetaMessageParam {
  if (message.role === 'assistant' && message.providerContent) {
    return { role: 'assistant', content: message.providerContent as BetaContentBlockParam[] };
  }
  if (typeof message.content === 'string') {
    return { role: message.role, content: message.content };
  }
  return {
    role: message.role,
    content: message.content.map((block): BetaContentBlockParam =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : { type: 'tool_result', tool_use_id: block.toolCallId, content: block.content, is_error: block.isError },
    ),
  };
}

function toStopReason(reason: string | null): AiStopReason {
  switch (reason) {
    case 'end_turn':
    case 'tool_use':
    case 'max_tokens':
    case 'refusal':
      return reason;
    default:
      return 'other';
  }
}

export function normalizeError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Anthropic.APIUserAbortError) {
    return new AiProviderError('cancelled', 'The request was cancelled.');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiProviderError('timeout', 'The AI provider took too long to respond.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError('rate_limited', 'The AI provider is rate limiting requests. Try again shortly.');
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiProviderError('auth', 'The AI provider rejected the configured credentials.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiProviderError('bad_request', 'The AI provider rejected the request.');
  }
  if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
    return new AiProviderError('unavailable', 'The AI provider is unavailable right now.');
  }
  if (error instanceof Anthropic.APIError) {
    return new AiProviderError('unavailable', 'The AI provider returned an error.');
  }
  return new AiProviderError('unknown', 'The AI request failed.');
}
