import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApprovalStatus, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import type { AdminAiConfig } from '../admin-ai.config';
import { AI_DOMAINS, type AiPermission, type AiToolDefinition } from '../tools/ai-tool.types';

export type PolicyDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Permission resolver + policy engine. Permissions come only from the
 * verified session (JwtStrategy re-reads role/approval on every request) and
 * server config -- never from the prompt, the request body, or the dashboard
 * module the UI says it is on.
 *
 * The HMS has a single ADMIN role (no sub-admin scopes), so every approved
 * admin resolves to the same read set; field-level protection for patient
 * data is the AI_ALLOW_PHI masking applied inside the tools.
 */
@Injectable()
export class AiPolicyService {
  private readonly config: AdminAiConfig;

  constructor(configService: ConfigService) {
    this.config = configService.get<AdminAiConfig>('adminAi') as AdminAiConfig;
  }

  resolvePermissions(user: AuthenticatedUser): ReadonlySet<AiPermission> {
    if (!isApprovedAdmin(user)) return new Set();

    const permissions = new Set<AiPermission>();
    for (const domain of AI_DOMAINS) {
      permissions.add(`ai.read.${domain}`);
      if (this.config.enableWrites) permissions.add(`ai.propose.${domain}`);
    }
    return permissions;
  }

  checkTool(tool: AiToolDefinition, permissions: ReadonlySet<AiPermission>): PolicyDecision {
    if (tool.mode === 'propose' && !this.config.enableWrites) {
      return { allowed: false, reason: 'AI write proposals are disabled on this deployment.' };
    }
    if (!permissions.has(tool.permission)) {
      return { allowed: false, reason: 'You do not have permission to use this tool.' };
    }
    return { allowed: true };
  }

  canExecuteProposals(user: AuthenticatedUser): PolicyDecision {
    if (!this.config.enableWrites) {
      return { allowed: false, reason: 'AI write actions are disabled on this deployment.' };
    }
    if (!isApprovedAdmin(user)) {
      return { allowed: false, reason: 'Only admins can approve AI actions.' };
    }
    return { allowed: true };
  }
}

export function isApprovedAdmin(user: AuthenticatedUser): boolean {
  return user.role === Role.ADMIN && (user.approvalStatus ?? ApprovalStatus.APPROVED) === ApprovalStatus.APPROVED;
}
