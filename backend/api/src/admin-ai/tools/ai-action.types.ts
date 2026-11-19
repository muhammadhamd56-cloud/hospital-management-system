import type { z } from 'zod';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import type { AiDomain } from './ai-tool.types';

/**
 * A state-changing operation the copilot may propose. It runs only through
 * AiProposalService after an admin approves the stored proposal, and always
 * by calling the existing domain service -- so the service's own validation,
 * transactions and conflict checks apply exactly as for a click in the UI.
 */
export interface AiActionHandler<S extends z.ZodType = z.ZodType> {
  /** e.g. `announcements.publish` */
  type: string;
  domain: AiDomain;
  schema: S;
  /**
   * Business-rule pre-check plus the human-readable preview the admin
   * approves. Runs when the proposal is created AND again right before
   * execution; throw a 4xx HttpException to refuse.
   */
  preview(params: z.infer<S>, user: AuthenticatedUser): Promise<string>;
  /** Calls the domain service. Returns a small confirmation (ids, statuses) -- no PHI. */
  execute(params: z.infer<S>, user: AuthenticatedUser): Promise<Record<string, unknown>>;
}

export function defineAction<S extends z.ZodType>(handler: AiActionHandler<S>): AiActionHandler {
  return handler as unknown as AiActionHandler;
}
