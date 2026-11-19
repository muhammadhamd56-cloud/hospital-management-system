/**
 * Provider-neutral model contract. The orchestrator only speaks these types;
 * each adapter (providers/adapters/*) translates them to one vendor SDK, so a
 * second provider is a new adapter, not an orchestrator rewrite.
 */

export interface AiToolCall {
  id: string;
  /** Wire name, e.g. `beds__getOccupancy`. */
  name: string;
  /** Unvalidated JSON from the model -- the dispatcher validates it. */
  input: unknown;
}

export type AiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean };

export interface AiChatMessage {
  role: 'user' | 'assistant';
  /** User turns and plain-text history. */
  content: string | AiContentBlock[];
  /**
   * The provider's own content for an assistant turn produced inside the
   * current run (tool calls, reasoning blocks). Replayed verbatim to the same
   * adapter so the provider sees an unedited history.
   */
  providerContent?: unknown;
}

export interface AiToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AiModelRequest {
  system: string;
  messages: AiChatMessage[];
  tools: AiToolSpec[];
  maxOutputTokens: number;
}

export type AiStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

export interface AiModelResponse {
  text: string;
  toolCalls: AiToolCall[];
  stopReason: AiStopReason;
  usage: { inputTokens: number; outputTokens: number };
  /** Model that actually served the request (may differ after a provider fallback). */
  model: string;
  providerContent: unknown;
}

export interface AiGenerateOptions {
  signal: AbortSignal;
  onTextDelta?: (delta: string) => void;
}

export interface AiModelProvider {
  /** Matches AI_PROVIDER. */
  readonly name: string;
  isConfigured(): boolean;
  generate(request: AiModelRequest, options: AiGenerateOptions): Promise<AiModelResponse>;
}

export const AI_MODEL_PROVIDERS = Symbol('AI_MODEL_PROVIDERS');

export type AiProviderErrorCode =
  | 'not_configured'
  | 'timeout'
  | 'rate_limited'
  | 'unavailable'
  | 'bad_request'
  | 'auth'
  | 'cancelled'
  | 'unknown';

/** Every adapter normalises its SDK's failures into this. Messages are safe to show an admin. */
export class AiProviderError extends Error {
  constructor(
    readonly code: AiProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
