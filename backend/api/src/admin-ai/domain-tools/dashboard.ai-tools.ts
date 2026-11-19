import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppointmentsService } from '../../appointments/appointments.service';
import { BedsService } from '../../beds/beds.service';
import { BillingService } from '../../billing/billing.service';
import { lastCalendarMonths } from '../../common/date-range.util';
import { EmergencyService } from '../../emergency/emergency.service';
import { LaboratoryService } from '../../laboratory/laboratory.service';
import { PatientsService } from '../../patients/patients.service';
import { ReportsService } from '../../reports/reports.service';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { addDays, countBy, inRange, isoDateInput, resolveRange, startOfLocalDay, type DateRange } from './ai-tool-helpers';

const ACTIVE_EMERGENCY = ['new', 'acknowledged', 'team_assigned', 'responding', 'arrived'];
const REVENUE_MONTHS_AVAILABLE = 24;
const METRICS = ['appointments', 'newPatients', 'labTestsRequested', 'labTestsCompleted', 'emergencyCases', 'revenue'] as const;
type Metric = (typeof METRICS)[number];

const statusCounts = z.object({ total: z.number(), scheduled: z.number(), completed: z.number(), cancelled: z.number() });
const period = z.object({ from: isoDateInput, to: isoDateInput });
const comparison = z.object({
  metric: z.string(),
  periodA: z.number().nullable(),
  periodB: z.number().nullable(),
  change: z.number().nullable(),
  changePct: z.number().nullable(),
  note: z.string().optional(),
});

function startOfWeek(date: Date): Date {
  const day = startOfLocalDay(date);
  return addDays(day, -((day.getDay() + 6) % 7)); // Monday
}

function tallyStatus(items: ReadonlyArray<{ status: string }>): z.infer<typeof statusCounts> {
  return {
    total: items.length,
    scheduled: items.filter((i) => i.status === 'scheduled').length,
    completed: items.filter((i) => i.status === 'completed').length,
    cancelled: items.filter((i) => i.status === 'cancelled').length,
  };
}

/**
 * Dashboard: hospital-wide KPIs composed from the existing services (the same
 * numbers the Admin dashboard cards use) plus period-over-period comparison of
 * the metrics those services can actually produce for arbitrary ranges.
 */
@Injectable()
export class DashboardAiTools implements AiToolProvider {
  readonly domain = 'dashboard' as const;

  constructor(
    private readonly billing: BillingService,
    private readonly reports: ReportsService,
    private readonly beds: BedsService,
    private readonly emergency: EmergencyService,
    private readonly appointments: AppointmentsService,
    private readonly patients: PatientsService,
    private readonly laboratory: LaboratoryService,
  ) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'dashboard.getOverview',
        domain: 'dashboard',
        mode: 'read',
        permission: 'ai.read.dashboard',
        description:
          'Hospital-wide snapshot: billed revenue this calendar month, all-time billing totals (billed/paid/pending/overdue, invoice count) and a monthly revenue trend (last `revenueMonths` calendar months, labelled by short month name, oldest first); ' +
          'appointments today and this week (Mon-Sun, server local time) by status, all-time appointments by status and top departments; total patients and new this month; ' +
          'current bed occupancy; active emergency cases now plus 30-day case count; open lab tests. Aggregates only.',
        input: z.object({ revenueMonths: z.number().int().min(1).max(REVENUE_MONTHS_AVAILABLE).default(6) }),
        output: z.object({
          generatedAt: z.string(),
          revenue: z.object({
            thisMonth: z.number(),
            allTime: z.object({
              totalRevenue: z.number(),
              paidAmount: z.number(),
              pendingAmount: z.number(),
              overdueAmount: z.number(),
              totalInvoices: z.number(),
            }),
            monthlyTrend: z.array(z.object({ month: z.string(), revenue: z.number() })),
          }),
          appointments: z.object({
            today: statusCounts,
            thisWeek: statusCounts,
            allTimeByStatus: z.array(z.object({ status: z.string(), count: z.number() })),
            topDepartments: z.array(z.object({ department: z.string(), count: z.number() })),
          }),
          patients: z.object({ total: z.number(), registeredThisMonth: z.number() }),
          beds: z.object({
            total: z.number(),
            available: z.number(),
            occupied: z.number(),
            maintenance: z.number(),
            occupancyRate: z.number(),
          }),
          emergency: z.object({ activeNow: z.number(), casesLast30Days: z.number(), avgMinutesToAcknowledge: z.number().nullable() }),
          laboratory: z.object({ pending: z.number(), inProgress: z.number() }),
        }),
        execute: async (args, ctx) => {
          const [overview, thisMonth, trend, byStatus, byDepartment, beds, emergencyStats, cases, appointments, patients, labs] =
            await Promise.all([
              this.billing.overview(ctx.user),
              this.billing.revenueThisMonth(),
              this.billing.monthlyRevenueTrend(args.revenueMonths),
              this.reports.appointmentsByStatus(),
              this.reports.appointmentsByDepartment(),
              this.beds.findAll(ctx.user),
              this.emergency.analytics(ctx.user),
              this.emergency.listAll(ctx.user, {}),
              this.appointments.findAllForAdmin(ctx.user),
              this.patients.findAll(ctx.user),
              this.laboratory.findAll(ctx.user),
            ]);
          const now = new Date();
          const today = { from: startOfLocalDay(now), to: addDays(startOfLocalDay(now), 1) };
          const week = { from: startOfWeek(now), to: addDays(startOfWeek(now), 7) };
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const within = (range: DateRange) => appointments.filter((a) => inRange(new Date(a.scheduledAt), range));
          const occupied = beds.beds.filter((b) => b.status === 'occupied').length;
          const maintenance = beds.beds.filter((b) => b.status === 'maintenance').length;
          const usable = beds.beds.length - maintenance;
          return {
            generatedAt: now.toISOString(),
            revenue: {
              thisMonth: thisMonth.amount,
              allTime: overview,
              monthlyTrend: trend,
            },
            appointments: {
              today: tallyStatus(within(today)),
              thisWeek: tallyStatus(within(week)),
              allTimeByStatus: byStatus,
              topDepartments: byDepartment.slice(0, 10),
            },
            patients: {
              total: patients.length,
              registeredThisMonth: patients.filter((p) => new Date(p.joinedAt) >= monthStart).length,
            },
            beds: {
              total: beds.beds.length,
              available: beds.beds.filter((b) => b.status === 'available').length,
              occupied,
              maintenance,
              occupancyRate: usable > 0 ? Math.round((occupied / usable) * 1000) / 10 : 0,
            },
            emergency: {
              activeNow: cases.filter((c) => ACTIVE_EMERGENCY.includes(c.status)).length,
              casesLast30Days: emergencyStats.totalCases,
              avgMinutesToAcknowledge:
                emergencyStats.avgAcknowledgeSeconds === null ? null : Math.round(emergencyStats.avgAcknowledgeSeconds / 6) / 10,
            },
            laboratory: {
              pending: labs.filter((t) => t.status === 'pending').length,
              inProgress: labs.filter((t) => t.status === 'in-progress').length,
            },
          };
        },
      }),
      defineTool({
        name: 'dashboard.compareMetrics',
        domain: 'dashboard',
        mode: 'read',
        permission: 'ai.read.dashboard',
        description:
          'Compare two date periods (each `from`/`to` ISO date or datetime; date-only `to` includes that day; max 366 days each). Comparable for ANY range: ' +
          'appointments (by scheduledAt, with status breakdown), newPatients (registrations), labTestsRequested, labTestsCompleted, emergencyCases (by creation time). ' +
          `Revenue (billed, by invoice creation) is only comparable when BOTH periods are whole calendar months within the last ${REVENUE_MONTHS_AVAILABLE} months (e.g. from 2026-09-01 to 2026-09-30); otherwise it is null with a note. ` +
          'NOT comparable: bed occupancy (no history is stored), emergency response times outside the fixed last-30-days window, paid/overdue amounts by period. ' +
          'Returns each metric for A and B with absolute and % change (B relative to A).',
        input: z.object({
          periodA: period,
          periodB: period,
          metrics: z.array(z.enum(METRICS)).min(1).max(METRICS.length).optional(),
        }),
        output: z.object({
          periodA: z.object({ from: z.string(), to: z.string() }),
          periodB: z.object({ from: z.string(), to: z.string() }),
          comparisons: z.array(comparison),
          appointmentStatus: z
            .object({ periodA: z.record(z.string(), z.number()), periodB: z.record(z.string(), z.number()) })
            .optional(),
        }),
        execute: async (args, ctx) => {
          const placeholder = { from: new Date(0), to: new Date(1) };
          const a = resolveRange(args.periodA.from, args.periodA.to, placeholder);
          const b = resolveRange(args.periodB.from, args.periodB.to, placeholder);
          const wanted = new Set<Metric>(args.metrics ?? METRICS);
          const needs = (...metrics: Metric[]) => metrics.some((m) => wanted.has(m));

          const [appointments, patients, labs, cases, trend] = await Promise.all([
            needs('appointments') ? this.appointments.findAllForAdmin(ctx.user) : Promise.resolve([]),
            needs('newPatients') ? this.patients.findAll(ctx.user) : Promise.resolve([]),
            needs('labTestsRequested', 'labTestsCompleted') ? this.laboratory.findAll(ctx.user) : Promise.resolve([]),
            needs('emergencyCases') ? this.emergency.listAll(ctx.user, {}) : Promise.resolve([]),
            needs('revenue') ? this.billing.monthlyRevenueTrend(REVENUE_MONTHS_AVAILABLE) : Promise.resolve([]),
          ]);
          const months = needs('revenue') ? lastCalendarMonths(REVENUE_MONTHS_AVAILABLE) : [];
          const revenueFor = (range: DateRange): number | null => {
            const first = months.findIndex((m) => m.start.getTime() === range.from.getTime());
            const last = months.findIndex((m) => m.end.getTime() === range.to.getTime());
            if (first < 0 || last < first) return null;
            return Math.round(trend.slice(first, last + 1).reduce((sum, m) => sum + m.revenue, 0) * 100) / 100;
          };

          const counters: Record<Metric, (range: DateRange) => number | null> = {
            appointments: (r) => appointments.filter((x) => inRange(new Date(x.scheduledAt), r)).length,
            newPatients: (r) => patients.filter((x) => inRange(new Date(x.joinedAt), r)).length,
            labTestsRequested: (r) => labs.filter((x) => inRange(new Date(x.requestedAt), r)).length,
            labTestsCompleted: (r) => labs.filter((x) => x.completedAt && inRange(new Date(x.completedAt), r)).length,
            emergencyCases: (r) => cases.filter((x) => inRange(new Date(x.createdAt), r)).length,
            revenue: revenueFor,
          };

          const comparisons = METRICS.filter((m) => wanted.has(m)).map((metric) => {
            const valueA = counters[metric](a);
            const valueB = counters[metric](b);
            const comparable = valueA !== null && valueB !== null;
            return {
              metric,
              periodA: valueA,
              periodB: valueB,
              change: comparable ? Math.round((valueB - valueA) * 100) / 100 : null,
              changePct: comparable && valueA !== 0 ? Math.round(((valueB - valueA) / valueA) * 1000) / 10 : null,
              ...(metric === 'revenue' && !comparable
                ? { note: `Revenue needs both periods to be whole calendar months within the last ${REVENUE_MONTHS_AVAILABLE} months.` }
                : {}),
            };
          });

          return {
            periodA: { from: a.from.toISOString(), to: a.to.toISOString() },
            periodB: { from: b.from.toISOString(), to: b.to.toISOString() },
            comparisons,
            ...(wanted.has('appointments')
              ? {
                  appointmentStatus: {
                    periodA: countBy(appointments.filter((x) => inRange(new Date(x.scheduledAt), a)), (x) => x.status),
                    periodB: countBy(appointments.filter((x) => inRange(new Date(x.scheduledAt), b)), (x) => x.status),
                  },
                }
              : {}),
          };
        },
      }),
    ];
  }
}
