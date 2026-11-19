import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AccountApprovalsService,
  type AccountRequestResponse,
} from '../../account-approvals/account-approvals.service';
import { ReviewAccountDto } from '../../account-approvals/dto/review-account.dto';
import { defineAction, type AiActionHandler } from '../tools/ai-action.types';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { validateDto } from './group-b.shared';

const id = z.string().min(1).max(64);
const DAY_MS = 24 * 60 * 60 * 1000;

const reviewParams = z
  .object({
    userId: id,
    decision: z.enum(['approve', 'reject']),
    note: z.string().max(500).optional(),
  })
  .strict();

/** What the approval process actually does -- kept in step with AccountApprovalsService. */
const REQUIREMENTS = [
  'Who needs approval: only doctor and staff accounts that sign themselves up. Admin-created staff accounts and patients never need review.',
  'When a request appears: only after the applicant has verified their email (OTP code, or a Google account). Unverified signups never reach the queue.',
  'Until approved: the applicant can use nothing beyond their own account (/users/me).',
  'What the request shows: name, email, role, and for doctor applicants the specialization and department they entered; plus request and review timestamps.',
  'Decisions: approve or reject. A rejection may carry a note of up to 500 characters that is shown to the applicant; the note is ignored on approval.',
  'Transitions: a pending request can be approved or rejected; a rejected request can later be approved; an approved account is never reopened here. The update only applies if the account is still in the expected state, so two admins cannot both act on it.',
  'After a decision: the change is audit-logged, the applicant gets an in-app notification and (best effort) an email.',
  'The queue lists at most 200 requests (newest first).',
];

/**
 * Approvals: the doctor/staff signup queue from AccountApprovalsService,
 * plus an approve/reject proposal executed through AccountApprovalsService.review
 * -- the same conditional update, audit log and notifications as the page.
 */
@Injectable()
export class ApprovalsAiTools implements AiToolProvider {
  readonly domain = 'approvals' as const;

  constructor(private readonly approvals: AccountApprovalsService) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'approvals.getPendingApplications',
        domain: 'approvals',
        mode: 'read',
        permission: 'ai.read.approvals',
        description:
          'Doctor/staff account requests waiting for review (email verified, status pending), newest first, optionally one role. Each row: id, name, email, role, specialization/department (doctors), requestedAt and days waiting. At most `limit` rows (max 100) plus the exact total (the service itself caps the queue at 200).',
        input: z.object({
          role: z.enum(['doctor', 'staff']).optional(),
          limit: z.number().int().min(1).max(100).default(50),
        }),
        output: z.object({
          total: z.number(),
          returned: z.number(),
          oldestWaitingDays: z.number().nullable(),
          applications: z.array(
            z.object({
              id: z.string(),
              fullName: z.string(),
              email: z.string(),
              role: z.string(),
              specialization: z.string().nullable(),
              department: z.string().nullable(),
              requestedAt: z.string(),
              waitingDays: z.number(),
            }),
          ),
        }),
        execute: async (args) => {
          const now = Date.now();
          const pending = (await this.approvals.list('pending')).filter((request) => !args.role || request.role === args.role);
          const rows = pending.slice(0, args.limit).map((request) => ({
            id: request.id,
            fullName: request.fullName,
            email: request.email,
            role: request.role,
            specialization: request.specialization,
            department: request.department,
            requestedAt: request.requestedAt,
            waitingDays: Math.floor((now - Date.parse(request.requestedAt)) / DAY_MS),
          }));
          const oldest = pending.reduce<number | null>((max, request) => {
            const days = Math.floor((now - Date.parse(request.requestedAt)) / DAY_MS);
            return max === null || days > max ? days : max;
          }, null);
          return { total: pending.length, returned: rows.length, oldestWaitingDays: oldest, applications: rows };
        },
      }),
      defineTool({
        name: 'approvals.findMissingInformation',
        domain: 'approvals',
        mode: 'read',
        permission: 'ai.read.approvals',
        description:
          'For pending (default) or rejected account requests, list which of the fields the request exposes are empty: name and email for everyone, specialization and department for doctor applicants (staff applicants do not provide those). At most `limit` incomplete requests (max 100) plus exact counts.',
        input: z.object({
          status: z.enum(['pending', 'rejected']).default('pending'),
          limit: z.number().int().min(1).max(100).default(50),
        }),
        output: z.object({
          checked: z.number(),
          complete: z.number(),
          incomplete: z.number(),
          returned: z.number(),
          applications: z.array(
            z.object({ id: z.string(), fullName: z.string(), role: z.string(), missing: z.array(z.string()) }),
          ),
        }),
        execute: async (args) => {
          const requests = await this.approvals.list(args.status);
          const withMissing = requests
            .map((request) => ({ request, missing: missingFields(request) }))
            .filter((entry) => entry.missing.length > 0);
          const rows = withMissing.slice(0, args.limit).map(({ request, missing }) => ({
            id: request.id,
            fullName: request.fullName || '(no name)',
            role: request.role,
            missing,
          }));
          return {
            checked: requests.length,
            complete: requests.length - withMissing.length,
            incomplete: withMissing.length,
            returned: rows.length,
            applications: rows,
          };
        },
      }),
      defineTool({
        name: 'approvals.explainRequirements',
        domain: 'approvals',
        mode: 'read',
        permission: 'ai.read.approvals',
        description:
          'Static description of the account approval process as implemented: who needs approval, when requests appear, what decisions are possible, state transitions and side effects. No data lookup.',
        input: z.object({}),
        output: z.object({ rules: z.array(z.string()) }),
        execute: async () => ({ rules: REQUIREMENTS }),
      }),
      defineTool({
        name: 'approvals.prepareDecision',
        domain: 'approvals',
        mode: 'propose',
        permission: 'ai.propose.approvals',
        description:
          'Prepare (not perform) approving or rejecting ONE pending account request. Creates a proposal the admin must approve in the panel. `note` (max 500 chars) is shown to the applicant on rejection and ignored on approval. Use ids from approvals.getPendingApplications.',
        input: reviewParams,
        output: z.unknown(),
        execute: async (args) => ({ actionType: 'approvals.review', params: { ...args } }),
      }),
    ];
  }

  actions(): AiActionHandler[] {
    return [
      defineAction({
        type: 'approvals.review',
        domain: 'approvals',
        schema: reviewParams,
        preview: async (params) => {
          await validateDto(ReviewAccountDto, { decision: params.decision, note: params.note });
          const request = (await this.approvals.list('pending')).find((candidate) => candidate.id === params.userId);
          if (!request) throw new BadRequestException('This account request is no longer pending');
          const who = `${request.fullName} (${request.role}, ${request.email})`;
          if (params.decision === 'approve') {
            return `Approve the account request of ${who}, granting full ${request.role} access.`;
          }
          const note = params.note?.trim();
          return `Reject the account request of ${who}${note ? ` with the note: "${note}"` : ' without a note'}.`;
        },
        execute: async (params, user) => {
          const dto = await validateDto(ReviewAccountDto, { decision: params.decision, note: params.note });
          const result = await this.approvals.review(user, params.userId, dto);
          return { userId: result.id, status: result.status };
        },
      }),
    ];
  }
}

function missingFields(request: AccountRequestResponse): string[] {
  const missing: string[] = [];
  if (!request.fullName.trim()) missing.push('name');
  if (!request.email.trim()) missing.push('email');
  if (request.role === 'doctor') {
    if (!request.specialization?.trim()) missing.push('specialization');
    if (!request.department?.trim()) missing.push('department');
  }
  return missing;
}
