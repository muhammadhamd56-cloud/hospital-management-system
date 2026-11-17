import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LaboratoryService } from '../../laboratory/laboratory.service';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { countBy, round1 } from './ai-tool-helpers';

const CATEGORIES = ['Hematology', 'Biochemistry', 'Microbiology', 'Radiology', 'Pathology'] as const;
const HOUR_MS = 3_600_000;
const hoursSince = (iso: string, now: number) => round1((now - new Date(iso).getTime()) / HOUR_MS);

/**
 * Laboratory: queue/throughput view over LaboratoryService.findAll (the Lab
 * page's data and admin scoping). Operational only: test results
 * (resultSummary) are never returned or interpreted.
 */
@Injectable()
export class LaboratoryAiTools implements AiToolProvider {
  readonly domain = 'laboratory' as const;

  constructor(private readonly laboratory: LaboratoryService) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'laboratory.getOperationalStatus',
        domain: 'laboratory',
        mode: 'read',
        permission: 'ai.read.laboratory',
        description:
          'Lab workload snapshot over all lab tests: counts by status (pending/in-progress/completed) and by category with per-status breakdown, ' +
          'age in hours of the oldest pending and oldest in-progress test, open tests with no technician assigned, tests completed in the last 7 days, ' +
          'and average requested-to-completed turnaround (hours) for tests completed in the last 30 days. Aggregates only; never results.',
        input: z.object({}),
        output: z.object({
          total: z.number(),
          byStatus: z.record(z.string(), z.number()),
          byCategory: z.array(
            z.object({ category: z.string(), total: z.number(), pending: z.number(), inProgress: z.number(), completed: z.number() }),
          ),
          oldestPendingAgeHours: z.number().nullable(),
          oldestInProgressAgeHours: z.number().nullable(),
          openUnassigned: z.number(),
          completedLast7Days: z.number(),
          avgTurnaroundHoursLast30Days: z.number().nullable(),
        }),
        execute: async (_args, ctx) => {
          const tests = await this.laboratory.findAll(ctx.user);
          const now = Date.now();
          const oldestAge = (status: string) => {
            const times = tests.filter((t) => t.status === status).map((t) => new Date(t.requestedAt).getTime());
            return times.length ? round1((now - Math.min(...times)) / HOUR_MS) : null;
          };
          const completedSince = (days: number) =>
            tests.filter((t) => t.completedAt && now - new Date(t.completedAt).getTime() <= days * 24 * HOUR_MS);
          const recent = completedSince(30);
          const turnaround = recent.map((t) => new Date(t.completedAt as string).getTime() - new Date(t.requestedAt).getTime());
          const categories = [...new Set(tests.map((t) => t.category))].sort();
          return {
            total: tests.length,
            byStatus: countBy(tests, (t) => t.status),
            byCategory: categories.map((category) => {
              const inCategory = tests.filter((t) => t.category === category);
              return {
                category,
                total: inCategory.length,
                pending: inCategory.filter((t) => t.status === 'pending').length,
                inProgress: inCategory.filter((t) => t.status === 'in-progress').length,
                completed: inCategory.filter((t) => t.status === 'completed').length,
              };
            }),
            oldestPendingAgeHours: oldestAge('pending'),
            oldestInProgressAgeHours: oldestAge('in-progress'),
            openUnassigned: tests.filter((t) => t.status !== 'completed' && !t.assignedToId).length,
            completedLast7Days: completedSince(7).length,
            avgTurnaroundHoursLast30Days: turnaround.length
              ? round1(turnaround.reduce((sum, ms) => sum + ms, 0) / turnaround.length / HOUR_MS)
              : null,
          };
        },
      }),
      defineTool({
        name: 'laboratory.getPendingTests',
        domain: 'laboratory',
        mode: 'read',
        permission: 'ai.read.laboratory',
        description:
          'Open lab tests (pending and/or in-progress), oldest first: test name, category, status, requested time, age in hours, requesting doctor, department, assigned technician, patient id + display name. ' +
          'Filters: status, category, minimum age in hours. At most `limit` rows plus the exact matching count. Never includes results. ' +
          'Patient display name is a pseudonym when PHI sharing is off.',
        input: z.object({
          status: z.enum(['pending', 'in-progress', 'any-open']).default('any-open'),
          category: z.enum(CATEGORIES).optional(),
          minAgeHours: z.number().min(0).max(24 * 366).optional(),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        output: z.object({
          matching: z.number(),
          returned: z.number(),
          tests: z.array(
            z.object({
              id: z.string(),
              testName: z.string(),
              category: z.string(),
              status: z.string(),
              requestedAt: z.string(),
              ageHours: z.number(),
              doctorName: z.string(),
              department: z.string(),
              assignedToName: z.string().nullable(),
              patientId: z.string(),
              patient: z.string(),
            }),
          ),
        }),
        execute: async (args, ctx) => {
          const tests = await this.laboratory.findAll(ctx.user);
          const now = Date.now();
          const matching = tests
            .filter((t) => (args.status === 'any-open' ? t.status !== 'completed' : t.status === args.status))
            .filter((t) => !args.category || t.category === args.category)
            .filter((t) => args.minAgeHours === undefined || hoursSince(t.requestedAt, now) >= args.minAgeHours)
            .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
          const rows = matching.slice(0, args.limit).map((t) => ({
            id: t.id,
            testName: t.testName,
            category: t.category,
            status: t.status,
            requestedAt: t.requestedAt,
            ageHours: hoursSince(t.requestedAt, now),
            doctorName: t.doctorName,
            department: t.department,
            assignedToName: t.assignedToName,
            patientId: t.patientId,
            patient: ctx.phi.patientName(t.patientId, t.patientName),
          }));
          return { matching: matching.length, returned: rows.length, tests: rows };
        },
      }),
    ];
  }
}
