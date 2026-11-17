import { Injectable, Logger } from '@nestjs/common';
import { AiFeedbackRating, AiProposalStatus, AiRunStatus, AiToolStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** USD per million tokens, for the cost estimate only (input, output). Unknown models report null. */
const PRICE_PER_MTOK: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-fable-5-2': [8, 40],
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICE_PER_MTOK[model];
  if (!price) return null;
  return Math.round(((inputTokens * price[0] + outputTokens * price[1]) / 1_000_000) * 10_000) / 10_000;
}

export interface RunMetric {
  runId: string;
  status: AiRunStatus;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  model: string;
  errorCode: string | null;
}

/**
 * Structured run logs (one JSON line per run, keyed by runId -- the trace id
 * that also ties together AiToolInvocation rows, proposals and AuditLog
 * entries) plus the admin usage view, computed from the AI tables.
 * No message text, arguments or patient data is ever logged here.
 */
@Injectable()
export class AiMetricsService {
  private readonly logger = new Logger('AdminAiMetrics');

  constructor(private readonly prisma: PrismaService) {}

  recordRun(metric: RunMetric): void {
    this.logger.log(
      JSON.stringify({
        event: 'ai_run',
        ...metric,
        estimatedCostUsd: estimateCostUsd(metric.model, metric.inputTokens, metric.outputTokens),
      }),
    );
  }

  async usage(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [runs, byStatus, byModel, tools, failedTools, proposals, feedback] = await Promise.all([
      this.prisma.aiRun.aggregate({
        where: { startedAt: { gte: since } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, toolCalls: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.aiRun.groupBy({ by: ['status'], where: { startedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.aiRun.groupBy({
        by: ['model'],
        where: { startedAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      this.prisma.aiToolInvocation.groupBy({
        by: ['toolName'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _avg: { durationMs: true },
        orderBy: { _count: { toolName: 'desc' } },
        take: 15,
      }),
      this.prisma.aiToolInvocation.count({
        where: { createdAt: { gte: since }, status: { not: AiToolStatus.SUCCEEDED } },
      }),
      this.prisma.aiActionProposal.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.aiFeedback.groupBy({ by: ['rating'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    ]);

    const cost = byModel.reduce<number | null>((total, row) => {
      const estimate = estimateCostUsd(row.model, row._sum.inputTokens ?? 0, row._sum.outputTokens ?? 0);
      return estimate === null || total === null ? null : total + estimate;
    }, 0);

    const countOf = <T extends string>(rows: Array<{ _count: { _all: number } } & Record<string, unknown>>, key: string, value: T) =>
      rows.find((row) => row[key] === value)?._count._all ?? 0;

    return {
      periodDays: days,
      requests: runs._count._all,
      averageLatencyMs: runs._avg.latencyMs === null ? null : Math.round(runs._avg.latencyMs),
      inputTokens: runs._sum.inputTokens ?? 0,
      outputTokens: runs._sum.outputTokens ?? 0,
      toolCalls: runs._sum.toolCalls ?? 0,
      failedToolCalls: failedTools,
      estimatedCostUsd: cost === null ? null : Math.round(cost * 100) / 100,
      runsByStatus: Object.fromEntries(byStatus.map((row) => [row.status.toLowerCase(), row._count._all])),
      providerErrors: countOf(byStatus, 'status', AiRunStatus.FAILED),
      topTools: tools.map((row) => ({
        name: row.toolName,
        calls: row._count._all,
        averageDurationMs: row._avg.durationMs === null ? null : Math.round(row._avg.durationMs),
      })),
      proposals: Object.fromEntries(proposals.map((row) => [row.status.toLowerCase(), row._count._all])),
      approvalsExecuted: countOf(proposals, 'status', AiProposalStatus.EXECUTED),
      feedback: {
        up: countOf(feedback, 'rating', AiFeedbackRating.UP),
        down: countOf(feedback, 'rating', AiFeedbackRating.DOWN),
      },
    };
  }
}
