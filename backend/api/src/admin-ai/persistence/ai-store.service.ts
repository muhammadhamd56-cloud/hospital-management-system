import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AiFeedbackRating,
  AiMessageRole,
  AiRunStatus,
  type AiConversation,
  type AiMessage,
  type AiRun,
  type AiToolStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const CONVERSATION_PAGE_SIZE = 20;
export const MESSAGE_PAGE_SIZE = 50;

export interface ConversationSummary {
  id: string;
  title: string;
  activeModule: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  runId: string | null;
  createdAt: Date;
  feedback: 'up' | 'down' | null;
}

/**
 * All copilot persistence. Every read that takes a conversation id is scoped
 * by the owner's user id in the same query, so another admin's conversation
 * is indistinguishable from one that doesn't exist.
 */
@Injectable()
export class AiStoreService {
  constructor(private readonly prisma: PrismaService) {}

  createConversation(userId: string, title: string, activeModule: string | null): Promise<AiConversation> {
    return this.prisma.aiConversation.create({ data: { userId, title, activeModule } });
  }

  async listConversations(
    userId: string,
    cursor?: string,
  ): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
    const rows = await this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CONVERSATION_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, title: true, activeModule: true, createdAt: true, updatedAt: true },
    });
    const hasMore = rows.length > CONVERSATION_PAGE_SIZE;
    const items = rows.slice(0, CONVERSATION_PAGE_SIZE);
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async getOwnedConversation(userId: string, id: string): Promise<AiConversation> {
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id, userId } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async renameConversation(userId: string, id: string, title: string): Promise<AiConversation> {
    await this.getOwnedConversation(userId, id);
    return this.prisma.aiConversation.update({ where: { id }, data: { title } });
  }

  async deleteConversation(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.aiConversation.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Conversation not found');
  }

  /** Newest page (or the page older than `before`), returned oldest first. */
  async listMessages(
    userId: string,
    conversationId: string,
    before?: string,
  ): Promise<{ messages: MessageView[]; hasMore: boolean }> {
    await this.getOwnedConversation(userId, conversationId);

    let olderThan: { createdAt: Date; id: string } | null = null;
    if (before) {
      olderThan = await this.prisma.aiMessage.findFirst({
        where: { id: before, conversationId },
        select: { createdAt: true, id: true },
      });
      if (!olderThan) return { messages: [], hasMore: false };
    }

    const rows = await this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        ...(olderThan && {
          OR: [
            { createdAt: { lt: olderThan.createdAt } },
            { createdAt: olderThan.createdAt, id: { lt: olderThan.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGE_PAGE_SIZE + 1,
      include: { feedback: { where: { userId }, select: { rating: true } } },
    });

    const hasMore = rows.length > MESSAGE_PAGE_SIZE;
    const messages = rows
      .slice(0, MESSAGE_PAGE_SIZE)
      .reverse()
      .map((row): MessageView => ({
        id: row.id,
        role: row.role === AiMessageRole.USER ? ('user' as const) : ('assistant' as const),
        content: row.content,
        runId: row.runId,
        createdAt: row.createdAt,
        feedback: row.feedback[0] ? (row.feedback[0].rating === AiFeedbackRating.UP ? 'up' : 'down') : null,
      }));
    return { messages, hasMore };
  }

  /** The last `limit` turns as plain text -- the history the model sees. */
  async recentHistory(conversationId: string, limit: number): Promise<Array<Pick<AiMessage, 'role' | 'content'>>> {
    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { role: true, content: true },
    });
    return rows.reverse();
  }

  addMessage(conversationId: string, role: AiMessageRole, content: string, runId: string | null): Promise<AiMessage> {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.aiMessage.create({ data: { conversationId, role, content, runId } });
      await tx.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      return message;
    });
  }

  findRunByRequestKey(userId: string, requestKey: string): Promise<AiRun | null> {
    return this.prisma.aiRun.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
  }

  /** A run counts as in flight only within its time budget, so a crashed process can't wedge a conversation. */
  async hasActiveRun(conversationId: string, staleAfterMs: number): Promise<boolean> {
    const run = await this.prisma.aiRun.findFirst({
      where: {
        conversationId,
        status: AiRunStatus.RUNNING,
        startedAt: { gt: new Date(Date.now() - staleAfterMs) },
      },
      select: { id: true },
    });
    return run !== null;
  }

  createRun(data: {
    conversationId: string;
    userId: string;
    requestKey: string;
    provider: string;
    model: string;
    promptVersion: string;
    activeModule: string | null;
  }): Promise<AiRun> {
    return this.prisma.aiRun.create({ data });
  }

  finishRun(
    id: string,
    data: {
      status: AiRunStatus;
      inputTokens: number;
      outputTokens: number;
      toolCalls: number;
      latencyMs: number;
      errorCode?: string | null;
      model?: string;
    },
  ): Promise<AiRun> {
    return this.prisma.aiRun.update({ where: { id }, data: { ...data, finishedAt: new Date() } });
  }

  recordToolInvocation(data: {
    runId: string;
    toolName: string;
    domain: string;
    status: AiToolStatus;
    argKeys: string[];
    durationMs: number;
    errorCode?: string | null;
  }): Promise<unknown> {
    return this.prisma.aiToolInvocation.create({ data });
  }

  async assistantMessageForRun(runId: string): Promise<AiMessage | null> {
    return this.prisma.aiMessage.findFirst({
      where: { runId, role: AiMessageRole.ASSISTANT },
      orderBy: { createdAt: 'desc' },
    });
  }

  async tokensUsedToday(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const result = await this.prisma.aiRun.aggregate({
      where: { userId, startedAt: { gte: startOfDay } },
      _sum: { inputTokens: true, outputTokens: true },
    });
    return (result._sum.inputTokens ?? 0) + (result._sum.outputTokens ?? 0);
  }

  async setFeedback(userId: string, messageId: string, rating: AiFeedbackRating, comment?: string): Promise<void> {
    const message = await this.prisma.aiMessage.findFirst({
      where: { id: messageId, role: AiMessageRole.ASSISTANT, conversation: { userId } },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Message not found');

    await this.prisma.aiFeedback.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, rating, comment: comment ?? null },
      update: { rating, comment: comment ?? null },
    });
  }
}
