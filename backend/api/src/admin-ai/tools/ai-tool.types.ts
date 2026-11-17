import type { z } from 'zod';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import type { PhiMasker } from '../security/phi-masker';
import type { AiActionHandler } from './ai-action.types';

/** The 15 Admin dashboard modules the copilot covers. Also the tool namespaces. */
export const AI_DOMAINS = [
  'dashboard',
  'emergency',
  'announcements',
  'patients',
  'doctors',
  'appointments',
  'beds',
  'laboratory',
  'billing',
  'reports',
  'staff',
  'approvals',
  'scheduling',
  'profile',
  'settings',
] as const;

export type AiDomain = (typeof AI_DOMAINS)[number];

export function isAiDomain(value: unknown): value is AiDomain {
  return typeof value === 'string' && (AI_DOMAINS as readonly string[]).includes(value);
}

/**
 * `read` tools run as soon as policy allows. `propose` tools never change
 * anything: they hand an action draft to the approval workflow, which only
 * executes after an admin explicitly approves that exact proposal.
 */
export type AiToolMode = 'read' | 'propose';

/** `ai.read.<domain>` or `ai.propose.<domain>` -- resolved per user by PermissionResolver. */
export type AiPermission = `ai.${AiToolMode}.${AiDomain}`;

export interface AiToolContext {
  user: AuthenticatedUser;
  runId: string;
  conversationId: string;
  /** Applies the AI_ALLOW_PHI policy to patient identifiers in tool output. */
  phi: PhiMasker;
  signal: AbortSignal;
}

/** What a `propose` tool returns -- validated and persisted by AiProposalService. */
export interface AiActionDraft {
  actionType: string;
  params: Record<string, unknown>;
}

export interface AiToolDefinition<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  /** `<domain>.<action>`, e.g. `beds.getOccupancy`. Sent to the model as `beds__getOccupancy`. */
  name: string;
  domain: AiDomain;
  /** What the tool does and when to use it -- this is what the model reads. */
  description: string;
  input: I;
  /**
   * Allowlist of what may leave the tool. Output is parsed through it, so a
   * field a service adds later is stripped instead of silently reaching the model.
   */
  output: O;
  mode: AiToolMode;
  permission: AiPermission;
  /** Per-call limit; the dispatcher aborts and reports a timeout past it. */
  timeoutMs?: number;
  /** Write an AuditLog VIEW entry for every call (record lookups). */
  audit?: boolean;
  execute(args: z.infer<I>, ctx: AiToolContext): Promise<z.infer<O>>;
}

/** Each domain contributes its tools (and any approvable actions) through one injectable provider. */
export interface AiToolProvider {
  readonly domain: AiDomain;
  tools(): AiToolDefinition[];
  actions?(): AiActionHandler[];
}

export const AI_TOOL_PROVIDERS = Symbol('AI_TOOL_PROVIDERS');

/** Typing helper so `execute` gets inferred argument/result types. */
export function defineTool<I extends z.ZodType, O extends z.ZodType>(tool: AiToolDefinition<I, O>): AiToolDefinition {
  return tool as unknown as AiToolDefinition;
}

export function toWireName(name: string): string {
  return name.replace('.', '__');
}

export function fromWireName(wire: string): string {
  return wire.replace('__', '.');
}
