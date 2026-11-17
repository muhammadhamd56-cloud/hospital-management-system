import { HttpException, Injectable, Logger } from '@nestjs/common';
import { AiToolStatus, AuditAction } from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AiPolicyService } from '../control-plane/ai-policy.service';
import { AiStoreService } from '../persistence/ai-store.service';
import type { AiToolCall } from '../providers/model-provider.interface';
import { AiProposalService, type ProposalView } from '../workflows/ai-proposal.service';
import { fromWireName, type AiActionDraft, type AiPermission, type AiToolContext } from './ai-tool.types';
import { ToolRegistryService } from './tool-registry.service';

const DEFAULT_TOOL_TIMEOUT_MS = 15_000;
/** Tool output is truncated past this -- keeps one result from flooding the model's context. */
const MAX_RESULT_CHARS = 24_000;

export interface DispatchResult {
  toolName: string;
  domain: string;
  status: AiToolStatus;
  /** JSON (or an error sentence) sent back to the model as the tool result. */
  content: string;
  isError: boolean;
  durationMs: number;
  proposal?: ProposalView;
}

class ToolTimeoutError extends Error {}

/**
 * Executes one model tool request: resolve -> authorize -> validate input ->
 * run the domain service with a timeout -> project output through its
 * allowlist -> record + audit. Never throws; every failure becomes an error
 * tool result the model can explain, so one bad call can't crash the run.
 */
@Injectable()
export class ToolDispatcherService {
  private readonly logger = new Logger(ToolDispatcherService.name);

  constructor(
    private readonly registry: ToolRegistryService,
    private readonly policy: AiPolicyService,
    private readonly proposals: AiProposalService,
    private readonly store: AiStoreService,
    private readonly auditLog: AuditLogService,
  ) {}

  async dispatch(call: AiToolCall, ctx: AiToolContext, permissions: ReadonlySet<AiPermission>): Promise<DispatchResult> {
    const startedAt = Date.now();
    const tool = this.registry.findByWireName(call.name);
    const toolName = tool?.name ?? fromWireName(call.name).slice(0, 80);
    const domain = tool?.domain ?? 'unknown';
    const argKeys =
      call.input && typeof call.input === 'object' && !Array.isArray(call.input)
        ? Object.keys(call.input as Record<string, unknown>).slice(0, 20)
        : [];

    const finish = async (
      status: AiToolStatus,
      content: string,
      errorCode: string | null,
      proposal?: ProposalView,
    ): Promise<DispatchResult> => {
      const durationMs = Date.now() - startedAt;
      await this.store
        .recordToolInvocation({ runId: ctx.runId, toolName, domain, status, argKeys, durationMs, errorCode })
        .catch((error: unknown) => this.logger.warn(`Could not record tool invocation: ${(error as Error).message}`));
      return {
        toolName,
        domain,
        status,
        content,
        isError: status !== AiToolStatus.SUCCEEDED,
        durationMs,
        proposal,
      };
    };

    if (!tool) {
      return finish(AiToolStatus.INVALID, 'Error: unknown tool. Use only the tools you were given.', 'unknown_tool');
    }

    const decision = this.policy.checkTool(tool, permissions);
    if (!decision.allowed) {
      return finish(AiToolStatus.DENIED, `Error: ${decision.reason}`, 'denied');
    }

    const parsed = tool.input.safeParse(call.input ?? {});
    if (!parsed.success) {
      // Paths and messages only -- never echo the offending values.
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || '(input)'}: ${issue.message}`)
        .join('; ');
      return finish(AiToolStatus.INVALID, `Error: invalid arguments -- ${issues}`, 'invalid_arguments');
    }

    try {
      const raw = await this.withTimeout(
        (signal) => tool.execute(parsed.data, { ...ctx, signal }),
        tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
        ctx.signal,
      );

      if (tool.audit) {
        await this.auditLog.log({
          actorId: ctx.user.id,
          action: AuditAction.VIEW,
          entityType: 'AiRun',
          entityId: ctx.runId,
          metadata: { tool: tool.name, argKeys },
        });
      }

      if (tool.mode === 'propose') {
        const proposal = await this.proposals.create(ctx.user, raw as AiActionDraft, {
          conversationId: ctx.conversationId,
          runId: ctx.runId,
        });
        const content = JSON.stringify({
          proposalId: proposal.id,
          status: 'awaiting_admin_approval',
          summary: proposal.summary,
          expiresAt: proposal.expiresAt,
          note: 'Nothing has been changed. The admin must approve this proposal in the panel.',
        });
        return finish(AiToolStatus.SUCCEEDED, content, null, proposal);
      }

      const output = tool.output.safeParse(raw);
      if (!output.success) {
        this.logger.error(`AI tool ${tool.name} returned output outside its schema`);
        return finish(AiToolStatus.FAILED, 'Error: the tool returned unexpected data.', 'output_validation');
      }

      return finish(AiToolStatus.SUCCEEDED, truncate(JSON.stringify(output.data ?? null)), null);
    } catch (error) {
      if (error instanceof ToolTimeoutError) {
        return finish(AiToolStatus.FAILED, 'Error: the tool timed out.', 'timeout');
      }
      if (error instanceof HttpException && error.getStatus() < 500) {
        // Domain-service 4xx messages are already written for end users.
        return finish(AiToolStatus.FAILED, `Error: ${error.message}`, `http_${error.getStatus()}`);
      }
      if (error instanceof Error && error.name === 'ZodError') {
        return finish(AiToolStatus.INVALID, 'Error: the proposed action has invalid parameters.', 'invalid_action');
      }
      this.logger.error(`AI tool ${tool.name} failed`, (error as Error)?.stack);
      return finish(AiToolStatus.FAILED, 'Error: the tool failed. Tell the admin to try again later.', 'tool_error');
    }
  }

  private async withTimeout<T>(
    work: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    parent: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    parent.addEventListener('abort', onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ToolTimeoutError());
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      parent.removeEventListener('abort', onAbort);
    }
  }
}

function truncate(text: string): string {
  return text.length <= MAX_RESULT_CHARS ? text : `${text.slice(0, MAX_RESULT_CHARS)}... [truncated]`;
}
