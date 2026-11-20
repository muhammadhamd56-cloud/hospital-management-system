import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMessageRole, AiRunStatus, Prisma, type AiConversation, type AiRun } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import type { AdminAiConfig } from '../admin-ai.config';
import { AiPolicyService, isApprovedAdmin } from '../control-plane/ai-policy.service';
import { AiMetricsService } from '../observability/ai-metrics.service';
import { AiStoreService, type MessageView } from '../persistence/ai-store.service';
import { ModelGatewayService } from '../providers/model-gateway.service';
import { AiProviderError, type AiChatMessage, type AiContentBlock } from '../providers/model-provider.interface';
import { PhiMasker, redactSecrets } from '../security/phi-masker';
import { ToolDispatcherService } from '../tools/tool-dispatcher.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import type { AiDomain, AiPermission } from '../tools/ai-tool.types';
import type { ProposalView } from '../workflows/ai-proposal.service';
import { buildMessages, HISTORY_TURNS } from './context-builder';
import { routeIntent } from './intent-router';
import { activePrompt } from './prompt-registry';

const MAX_REPLY_CHARS = 20_000;

export type CopilotEvent =
  | { type: 'run'; runId: string; conversationId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool'; phase: 'start'; id: string; name: string; domain: string }
  | { type: 'tool'; phase: 'end'; id: string; name: string; domain: string; status: string; durationMs: number }
  | { type: 'proposal'; proposal: ProposalView }
  | { type: 'done'; runId: string; status: string; message: MessageView | null; replayed?: boolean }
  | { type: 'error'; code: string; message: string };

export interface RunInput {
  message: string;
  activeModule: string | null;
  requestKey: string;
}

/** Everything checked before the response switches to a stream (so failures are normal HTTP errors). */
export type PreparedRun =
  | { kind: 'replay'; run: AiRun; message: MessageView | null }
  | {
      kind: 'new';
      user: AuthenticatedUser;
      conversation: AiConversation;
      input: RunInput;
      permissions: ReadonlySet<AiPermission>;
    };

/**
 * Central orchestrator: one bounded model/tool loop per admin message.
 * Owns the budgets (iterations, tool calls, tokens, wall clock, daily spend),
 * cancellation, idempotency, and the final-answer validation. Tools are
 * executed only through the dispatcher; the model's own claims are never
 * treated as outcomes.
 */
@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly config: AdminAiConfig;

  constructor(
    configService: ConfigService,
    private readonly store: AiStoreService,
    private readonly gateway: ModelGatewayService,
    private readonly registry: ToolRegistryService,
    private readonly dispatcher: ToolDispatcherService,
    private readonly policy: AiPolicyService,
    private readonly metrics: AiMetricsService,
  ) {
    this.config = configService.get<AdminAiConfig>('adminAi') as AdminAiConfig;
  }

  async prepare(user: AuthenticatedUser, conversationId: string, input: RunInput): Promise<PreparedRun> {
    if (!isApprovedAdmin(user)) throw new ForbiddenException('The AI Copilot is available to admins only.');

    const conversation = await this.store.getOwnedConversation(user.id, conversationId);

    const previous = await this.store.findRunByRequestKey(user.id, input.requestKey);
    if (previous) {
      if (previous.conversationId !== conversation.id) {
        throw new ConflictException('This request key was already used for another conversation.');
      }
      if (previous.status === AiRunStatus.RUNNING) {
        throw new ConflictException('This message is already being processed.');
      }
      const message = await this.store.assistantMessageForRun(previous.id);
      return { kind: 'replay', run: previous, message: message ? toMessageView(message) : null };
    }

    if (await this.store.hasActiveRun(conversation.id, this.config.requestTimeoutMs * 2)) {
      throw new ConflictException('Wait for the current answer to finish before sending another message.');
    }

    if (!this.gateway.isConfigured()) {
      throw new ServiceUnavailableException('The AI provider is not configured on this server.');
    }

    if (this.config.dailyTokenBudget > 0) {
      const used = await this.store.tokensUsedToday(user.id);
      if (used >= this.config.dailyTokenBudget) {
        throw new HttpException('Your daily AI usage limit has been reached. It resets at 00:00 UTC.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    return { kind: 'new', user, conversation, input, permissions: this.policy.resolvePermissions(user) };
  }

  /** Runs the loop and reports through `emit`. Never throws -- failures become an `error` event. */
  async execute(prepared: PreparedRun, emit: (event: CopilotEvent) => void, clientSignal: AbortSignal): Promise<void> {
    if (prepared.kind === 'replay') {
      emit({ type: 'done', runId: prepared.run.id, status: prepared.run.status.toLowerCase(), message: prepared.message, replayed: true });
      return;
    }

    const { user, conversation, input, permissions } = prepared;
    const prompt = activePrompt();
    const startedAt = Date.now();

    let run: AiRun;
    try {
      run = await this.store.createRun({
        conversationId: conversation.id,
        userId: user.id,
        requestKey: input.requestKey,
        provider: this.gateway.providerName,
        model: this.config.model,
        promptVersion: prompt.version,
        activeModule: input.activeModule,
      });
    } catch (error) {
      const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      emit({
        type: 'error',
        code: duplicate ? 'duplicate_request' : 'internal',
        message: duplicate ? 'This message is already being processed.' : 'Could not start the AI request.',
      });
      return;
    }
    emit({ type: 'run', runId: run.id, conversationId: conversation.id });

    const controller = new AbortController();
    const onClientAbort = () => controller.abort();
    clientSignal.addEventListener('abort', onClientAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.requestTimeoutMs);

    let inputTokens = 0;
    let outputTokens = 0;
    let toolCalls = 0;
    let status: AiRunStatus = AiRunStatus.SUCCEEDED;
    let errorCode: string | null = null;
    let servedModel = this.config.model;
    const replyParts: string[] = [];

    try {
      const history = await this.store.recentHistory(conversation.id, HISTORY_TURNS);
      await this.store.addMessage(conversation.id, AiMessageRole.USER, input.message, run.id);

      const intent = routeIntent(input.message, input.activeModule);
      const messages: AiChatMessage[] = buildMessages({
        history,
        message: input.message,
        activeModule: input.activeModule,
        intent,
        now: new Date(),
        phiMasked: !this.config.allowPhi,
        writesEnabled: this.config.enableWrites,
      });
      // Only the routed domains' tools are offered: on a CPU-only local model every tool schema
      // costs prompt-processing time (all ~40 tools is ~5.7k tokens, several minutes per answer).
      const tools = this.registry.specsFor(permissions, this.config.enableWrites, toolDomains(intent.domains));
      const phi = new PhiMasker(this.config.allowPhi);

      let finished = false;
      for (let iteration = 0; iteration < this.config.maxIterations && !finished; iteration += 1) {
        const response = await this.gateway.generate(
          { system: prompt.system, messages, tools, maxOutputTokens: this.config.maxOutputTokens },
          { signal: controller.signal, onTextDelta: (delta) => emit({ type: 'text', delta }) },
        );
        inputTokens += response.usage.inputTokens;
        outputTokens += response.usage.outputTokens;
        servedModel = response.model;
        if (response.text.trim()) replyParts.push(response.text.trim());

        if (response.stopReason === 'refusal') {
          replyParts.push("I can't help with that request.");
          finished = true;
          break;
        }
        if (response.toolCalls.length === 0) {
          if (response.stopReason === 'max_tokens') replyParts.push('_(The answer was cut short. Ask me to continue.)_');
          finished = true;
          break;
        }
        if (inputTokens + outputTokens > this.config.runTokenBudget || iteration === this.config.maxIterations - 1) {
          status = AiRunStatus.BUDGET_EXCEEDED;
          break;
        }

        messages.push({ role: 'assistant', content: response.text, providerContent: response.providerContent });

        const results: AiContentBlock[] = await Promise.all(
          response.toolCalls.map(async (call) => {
            if (toolCalls >= this.config.maxToolCalls) {
              return {
                type: 'tool_result' as const,
                toolCallId: call.id,
                content: 'Error: tool-call budget for this request is used up. Answer with the information you already have.',
                isError: true,
              };
            }
            toolCalls += 1;
            const display = this.registry.findByWireName(call.name);
            const name = display?.name ?? call.name;
            const domain = display?.domain ?? 'unknown';
            emit({ type: 'tool', phase: 'start', id: call.id, name, domain });
            const result = await this.dispatcher.dispatch(
              call,
              { user, runId: run.id, conversationId: conversation.id, phi, signal: controller.signal },
              permissions,
            );
            emit({ type: 'tool', phase: 'end', id: call.id, name, domain, status: result.status.toLowerCase(), durationMs: result.durationMs });
            if (result.proposal) emit({ type: 'proposal', proposal: result.proposal });
            return { type: 'tool_result' as const, toolCallId: call.id, content: result.content, isError: result.isError };
          }),
        );
        messages.push({ role: 'user', content: results });
      }

      if (!finished && status === AiRunStatus.SUCCEEDED) status = AiRunStatus.BUDGET_EXCEEDED;
      if (status === AiRunStatus.BUDGET_EXCEEDED) {
        errorCode = 'budget_exceeded';
        replyParts.push('_I stopped here because this request reached its processing limit. Try a narrower question._');
      }
    } catch (error) {
      const providerError = error instanceof AiProviderError ? error : null;
      if (controller.signal.aborted && !timedOut) {
        status = AiRunStatus.CANCELLED;
        errorCode = 'cancelled';
      } else {
        status = AiRunStatus.FAILED;
        errorCode = timedOut ? 'timeout' : (providerError?.code ?? 'internal');
        if (!providerError) this.logger.error(`AI run ${run.id} failed`, (error as Error)?.stack);
        emit({
          type: 'error',
          code: errorCode,
          message: timedOut
            ? 'The request took too long and was stopped.'
            : (providerError?.message ?? 'The AI request failed. Please try again.'),
        });
      }
    } finally {
      clearTimeout(timer);
      clientSignal.removeEventListener('abort', onClientAbort);
    }

    let saved: MessageView | null = null;
    const reply = validateReply(replyParts.join('\n\n'));
    if (status === AiRunStatus.SUCCEEDED || status === AiRunStatus.BUDGET_EXCEEDED) {
      const message = await this.store
        .addMessage(conversation.id, AiMessageRole.ASSISTANT, reply, run.id)
        .catch((error: unknown) => {
          this.logger.error(`Could not save AI reply for run ${run.id}`, (error as Error)?.stack);
          return null;
        });
      saved = message ? toMessageView(message) : null;
    }

    const latencyMs = Date.now() - startedAt;
    await this.store
      .finishRun(run.id, { status, inputTokens, outputTokens, toolCalls, latencyMs, errorCode, model: servedModel })
      .catch((error: unknown) => this.logger.error(`Could not finish AI run ${run.id}`, (error as Error)?.stack));
    this.metrics.recordRun({ runId: run.id, status, latencyMs, inputTokens, outputTokens, toolCalls, model: servedModel, errorCode });

    if (status !== AiRunStatus.FAILED) {
      emit({ type: 'done', runId: run.id, status: status.toLowerCase(), message: saved });
    }
  }
}

/** Final-answer checks: no secrets, bounded size, never empty. */
export function validateReply(text: string): string {
  const cleaned = redactSecrets(text).trim();
  if (!cleaned) return "Sorry, I couldn't produce an answer for that. Try rephrasing the question.";
  return cleaned.length > MAX_REPLY_CHARS ? `${cleaned.slice(0, MAX_REPLY_CHARS)}...` : cleaned;
}

function toMessageView(message: { id: string; role: AiMessageRole; content: string; runId: string | null; createdAt: Date }): MessageView {
  return {
    id: message.id,
    role: message.role === AiMessageRole.USER ? 'user' : 'assistant',
    content: message.content,
    runId: message.runId,
    createdAt: message.createdAt,
    feedback: null,
  };
}

/** Questions that name no area get the overview tools rather than the whole catalogue. */
const FALLBACK_TOOL_DOMAINS: readonly AiDomain[] = ['dashboard', 'reports'];

export function toolDomains(routed: readonly AiDomain[]): readonly AiDomain[] {
  return routed.length > 0 ? routed : FALLBACK_TOOL_DOMAINS;
}
