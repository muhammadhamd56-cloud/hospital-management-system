/**
 * Admin AI Copilot configuration. Every switch defaults to its safe value:
 * the feature is off, writes are off, PHI is masked, RAG is off. Read once at
 * boot through ConfigService (`adminAi`), never from the request.
 */
export interface AdminAiConfig {
  /** ADMIN_AI_ENABLED -- master switch; when false every /admin-ai route 404s. */
  enabled: boolean;
  /** AI_PROVIDER -- key of a registered provider adapter (only "ollama" today). */
  provider: string;
  /** AI_MODEL -- an Ollama model tag that supports tool calling, e.g. "qwen2.5:3b". */
  model: string;
  /** AI_BASE_URL -- the Ollama server, without a trailing slash. Undefined when the value is not an http(s) URL. */
  baseUrl: string | undefined;
  /**
   * AI_API_KEY -- optional. Sent as a Bearer token, for an Ollama server that
   * sits behind an authenticating proxy. A plain local Ollama needs none.
   */
  apiKey: string | undefined;
  /** AI_CONTEXT_TOKENS -- Ollama `num_ctx`. Its small default would truncate the system prompt and tool schemas. */
  contextTokens: number;
  /** AI_MAX_OUTPUT_TOKENS -- per model call. */
  maxOutputTokens: number;
  /** AI_REQUEST_TIMEOUT (ms) -- wall-clock limit for one whole run, all model and tool calls included. */
  requestTimeoutMs: number;
  /** AI_MAX_TOOL_CALLS -- tool executions allowed in one run. */
  maxToolCalls: number;
  /** Model round trips allowed in one run (tool calls arrive in batches). */
  maxIterations: number;
  /** AI_DAILY_BUDGET -- tokens (input + output) one admin may spend per UTC day. 0 = unlimited. */
  dailyTokenBudget: number;
  /** Tokens one run may spend before it is stopped. */
  runTokenBudget: number;
  /** AI_ALLOW_PHI -- when false, patient identifiers are pseudonymised before reaching the model. */
  allowPhi: boolean;
  /** AI_ENABLE_WRITES -- when false, proposal tools are not offered and approvals are refused. */
  enableWrites: boolean;
  /** AI_RAG_ENABLED -- reserved; knowledge retrieval is not implemented yet (see docs/ai/AI_PROGRESS.md). */
  ragEnabled: boolean;
  /** Minutes a proposal stays approvable. */
  proposalTtlMinutes: number;
  /** Provider-level retries for transient failures (429/5xx/connection). */
  maxRetries: number;
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return value.trim().toLowerCase() === 'true';
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Chosen from a 2026-11-20 benchmark on the target CPU-only laptop: correct tool
 * choice with correctly typed arguments, ~2.4 GB at an 8k context. See
 * docs/ai/AI_DEPLOYMENT.md (Choosing a model) before changing it.
 */
export const DEFAULT_AI_MODEL = 'qwen2.5:3b';
export const DEFAULT_AI_BASE_URL = 'http://localhost:11434';

function baseUrl(value: string | undefined): string | undefined {
  const raw = value?.trim() || DEFAULT_AI_BASE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return raw.replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

export function loadAdminAiConfig(env: Record<string, string | undefined>): AdminAiConfig {
  return {
    enabled: flag(env.ADMIN_AI_ENABLED ?? env.AI_ENABLED, false),
    provider: (env.AI_PROVIDER ?? 'ollama').trim().toLowerCase(),
    model: env.AI_MODEL?.trim() || DEFAULT_AI_MODEL,
    baseUrl: baseUrl(env.AI_BASE_URL),
    apiKey: env.AI_API_KEY?.trim() || undefined,
    contextTokens: int(env.AI_CONTEXT_TOKENS, 8_192, 2_048, 262_144),
    maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 4096, 256, 32_000),
    requestTimeoutMs: int(env.AI_REQUEST_TIMEOUT, 300_000, 5_000, 600_000),
    maxToolCalls: int(env.AI_MAX_TOOL_CALLS, 12, 1, 50),
    maxIterations: int(env.AI_MAX_ITERATIONS, 8, 1, 20),
    dailyTokenBudget: int(env.AI_DAILY_BUDGET, 500_000, 0, 1_000_000_000),
    runTokenBudget: int(env.AI_RUN_TOKEN_BUDGET, 150_000, 1_000, 10_000_000),
    allowPhi: flag(env.AI_ALLOW_PHI, false),
    enableWrites: flag(env.AI_ENABLE_WRITES, false),
    ragEnabled: flag(env.AI_RAG_ENABLED, false),
    proposalTtlMinutes: int(env.AI_PROPOSAL_TTL_MINUTES, 15, 1, 24 * 60),
    maxRetries: int(env.AI_MAX_RETRIES, 2, 0, 5),
  };
}
