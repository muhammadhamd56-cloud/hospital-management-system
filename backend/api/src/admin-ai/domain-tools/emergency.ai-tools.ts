import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { EmergencyCaseSummary } from '../../emergency/emergency.mapper';
import { EmergencyService } from '../../emergency/emergency.service';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { countBy } from './ai-tool-helpers';

const ACTIVE = ['new', 'acknowledged', 'team_assigned', 'responding', 'arrived'] as const;
const PRIORITIES = ['critical', 'high', 'normal'] as const;
const TYPES = [
  'medical',
  'accident_injury',
  'breathing_difficulty',
  'chest_related',
  'unconscious_person',
  'severe_bleeding',
  'other',
] as const;
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, normal: 2 };

const minutesBetween = (from: string, to: string | number) =>
  Math.round(((typeof to === 'number' ? to : new Date(to).getTime()) - new Date(from).getTime()) / 60_000);

const secondsToMinutes = (value: number | null) => (value === null ? null : Math.round(value / 6) / 10);

const incidentRow = z.object({
  id: z.string(),
  type: z.string(),
  priority: z.string(),
  status: z.string(),
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  assignedAt: z.string().nullable(),
  respondingAt: z.string().nullable(),
  arrivedAt: z.string().nullable(),
  minutesOpen: z.number(),
  minutesToAcknowledge: z.number().nullable(),
  teamAssigned: z.boolean(),
});

/**
 * Emergency: operational view over EmergencyService.listAll/analytics (the
 * Emergency Center's data). Strictly read-only and operational -- no patient
 * identity, contact, location, description or notes ever leave these tools.
 */
@Injectable()
export class EmergencyAiTools implements AiToolProvider {
  readonly domain = 'emergency' as const;

  constructor(private readonly emergency: EmergencyService) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'emergency.getActiveIncidents',
        domain: 'emergency',
        mode: 'read',
        permission: 'ai.read.emergency',
        description:
          'Currently active emergency cases (status new/acknowledged/team_assigned/responding/arrived), sorted by priority then oldest first. ' +
          'Optional filters: priority, type. Returns operational fields only (type, priority, status, timestamps, minutes open, minutes to acknowledge, whether a team is assigned) ' +
          'plus exact active counts by status and priority; at most `limit` rows. No patient identity or clinical details.',
        input: z.object({
          priority: z.enum(PRIORITIES).optional(),
          type: z.enum(TYPES).optional(),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        output: z.object({
          totalActive: z.number(),
          matching: z.number(),
          returned: z.number(),
          byStatus: z.record(z.string(), z.number()),
          byPriority: z.record(z.string(), z.number()),
          incidents: z.array(incidentRow),
        }),
        execute: async (args, ctx) => {
          const all = await this.emergency.listAll(ctx.user, {});
          const active = all.filter((c) => (ACTIVE as readonly string[]).includes(c.status));
          const matching = active
            .filter((c) => (!args.priority || c.priority === args.priority) && (!args.type || c.emergencyType === args.type))
            .sort(
              (a, b) =>
                (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
                a.createdAt.localeCompare(b.createdAt),
            );
          const now = Date.now();
          return {
            totalActive: active.length,
            matching: matching.length,
            returned: Math.min(matching.length, args.limit),
            byStatus: countBy(active, (c) => c.status),
            byPriority: countBy(active, (c) => c.priority),
            incidents: matching.slice(0, args.limit).map((c) => toIncidentRow(c, now)),
          };
        },
      }),
      defineTool({
        name: 'emergency.summarizeOperationalActivity',
        domain: 'emergency',
        mode: 'read',
        permission: 'ai.read.emergency',
        description:
          'Emergency operations over the LAST 30 DAYS (fixed window; the service offers no other period): total cases, counts by status/priority/type, ' +
          'average minutes to acknowledge, to assign (after acknowledge), to respond (after assign) and to resolve (from creation), and cases per day. ' +
          'Also the number of cases active right now (any age). Aggregates only.',
        input: z.object({}),
        output: z.object({
          windowDays: z.number(),
          totalCases: z.number(),
          activeNow: z.number(),
          byStatus: z.record(z.string(), z.number()),
          byPriority: z.record(z.string(), z.number()),
          byType: z.record(z.string(), z.number()),
          avgMinutesToAcknowledge: z.number().nullable(),
          avgMinutesToAssign: z.number().nullable(),
          avgMinutesToRespond: z.number().nullable(),
          avgMinutesToResolve: z.number().nullable(),
          volumeByDay: z.array(z.object({ date: z.string(), count: z.number() })),
        }),
        execute: async (_args, ctx) => {
          const [stats, all] = await Promise.all([
            this.emergency.analytics(ctx.user),
            this.emergency.listAll(ctx.user, {}),
          ]);
          const lower = (record: Record<string, number>) =>
            Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
          return {
            windowDays: 30,
            totalCases: stats.totalCases,
            activeNow: all.filter((c) => (ACTIVE as readonly string[]).includes(c.status)).length,
            byStatus: lower(stats.byStatus),
            byPriority: lower(stats.byPriority),
            byType: lower(stats.byType),
            avgMinutesToAcknowledge: secondsToMinutes(stats.avgAcknowledgeSeconds),
            avgMinutesToAssign: secondsToMinutes(stats.avgAssignSeconds),
            avgMinutesToRespond: secondsToMinutes(stats.avgResponseSeconds),
            avgMinutesToResolve: secondsToMinutes(stats.avgResolutionSeconds),
            volumeByDay: stats.volumeByDay,
          };
        },
      }),
    ];
  }
}

function toIncidentRow(c: EmergencyCaseSummary, now: number): z.infer<typeof incidentRow> {
  return {
    id: c.id,
    type: c.emergencyType,
    priority: c.priority,
    status: c.status,
    createdAt: c.createdAt,
    acknowledgedAt: c.acknowledgedAt,
    assignedAt: c.assignedAt,
    respondingAt: c.respondingAt,
    arrivedAt: c.arrivedAt,
    minutesOpen: minutesBetween(c.createdAt, now),
    minutesToAcknowledge: c.acknowledgedAt ? minutesBetween(c.createdAt, c.acknowledgedAt) : null,
    teamAssigned: Boolean(c.assignedDoctorName || c.assignedStaffName || c.assignedTeamName || c.assignedAt),
  };
}
