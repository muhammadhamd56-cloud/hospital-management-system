import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { BillingService } from '../../billing/billing.service';
import { roundMoney } from '../../common/money.util';
import { ReportsService } from '../../reports/reports.service';
import { ShiftsService } from '../../staff-scheduling/shifts.service';
import { StaffService as RosterStaffService } from '../../staff-scheduling/staff.service';
import { TasksService } from '../../staff-scheduling/tasks.service';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { checkRange, inRange, isoDate } from './group-b.shared';

const MAX_ROWS = 100;

const REPORT_TYPES = [
  {
    type: 'financial',
    title: 'Financial report',
    supportsDateRange: true,
    description:
      'Invoices issued in the range (billed, paid, outstanding, by status), payments recorded in the range by method, and the 6-month billed-revenue trend. No patient identifiers.',
  },
  {
    type: 'appointments',
    title: 'Appointments report',
    supportsDateRange: false,
    description:
      'Appointment counts by department and by status. All-time only: the reports service exposes no date filter for appointments.',
  },
  {
    type: 'staffing',
    title: 'Staffing report',
    supportsDateRange: true,
    description:
      'Roster headcount by staff type and department, shifts in the range by department and shift type (with hours), and tasks due in the range by status.',
  },
] as const;

type ReportType = (typeof REPORT_TYPES)[number]['type'];
type Cell = string | number | null;

interface Section {
  title: string;
  columns: string[];
  rows: Cell[][];
  note?: string;
}

const cell = z.union([z.string(), z.number(), z.null()]);

function bounded(section: Section): Section {
  if (section.rows.length <= MAX_ROWS) return section;
  return {
    ...section,
    rows: section.rows.slice(0, MAX_ROWS),
    note: [section.note, `Showing the first ${MAX_ROWS} of ${section.rows.length} rows.`].filter(Boolean).join(' '),
  };
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return map;
}

/**
 * Reports: assembles a structured, export-ready report (titled sections of
 * columns + rows) from ReportsService and the billing / scheduling services.
 * Generated synchronously on request -- there is no report job queue, so
 * there is nothing to poll.
 */
@Injectable()
export class ReportsAiTools implements AiToolProvider {
  readonly domain = 'reports' as const;

  constructor(
    private readonly reports: ReportsService,
    private readonly billing: BillingService,
    private readonly shifts: ShiftsService,
    private readonly roster: RosterStaffService,
    private readonly tasks: TasksService,
  ) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'reports.listReportTypes',
        domain: 'reports',
        mode: 'read',
        permission: 'ai.read.reports',
        description: 'The report types reports.prepareReport can build, what each contains and whether it honours a date range.',
        input: z.object({}),
        output: z.object({
          reportTypes: z.array(
            z.object({ type: z.string(), title: z.string(), supportsDateRange: z.boolean(), description: z.string() }),
          ),
        }),
        execute: async () => ({ reportTypes: REPORT_TYPES.map((entry) => ({ ...entry })) }),
      }),
      defineTool({
        name: 'reports.prepareReport',
        domain: 'reports',
        mode: 'read',
        permission: 'ai.read.reports',
        description:
          'Build a report now (synchronous, nothing is stored) for `reportType` (see reports.listReportTypes) and an inclusive date range (YYYY-MM-DD, max 366 days; ignored by types that do not support it, as stated in `notes`). Returns titled sections of columns + rows ready for a table or CSV export; each section has at most 100 rows. Contains aggregates only -- no patient identifiers.',
        input: z
          .object({
            reportType: z.enum(REPORT_TYPES.map((entry) => entry.type) as [ReportType, ...ReportType[]]),
            from: isoDate,
            to: isoDate,
          })
          .superRefine((value, ctx) => checkRange(value.from, value.to, ctx)),
        output: z.object({
          reportType: z.string(),
          title: z.string(),
          generatedAt: z.string(),
          period: z.object({ from: z.string(), to: z.string(), applied: z.boolean() }),
          sections: z.array(
            z.object({
              title: z.string(),
              columns: z.array(z.string()),
              rows: z.array(z.array(cell)),
              note: z.string().optional(),
            }),
          ),
          notes: z.array(z.string()),
        }),
        execute: async (args, ctx) => {
          const meta = REPORT_TYPES.find((entry) => entry.type === args.reportType)!;
          const notes: string[] = [];
          let sections: Section[];
          if (args.reportType === 'financial') {
            sections = await this.financial(args.from, args.to, ctx.user);
            notes.push('Billed revenue counts non-cancelled invoices by issue date, the same definition as the Billing page.');
            notes.push('The revenue trend always covers the last 6 calendar months, independent of the chosen range.');
          } else if (args.reportType === 'appointments') {
            sections = await this.appointments();
            notes.push('Appointment figures are all-time: the chosen date range could not be applied.');
          } else {
            sections = await this.staffing(args.from, args.to);
            notes.push('Roster headcount is the current snapshot, not as of the chosen range.');
          }
          return {
            reportType: meta.type,
            title: `${meta.title}${meta.supportsDateRange ? ` ${args.from} to ${args.to}` : ''}`,
            generatedAt: new Date().toISOString(),
            period: { from: args.from, to: args.to, applied: meta.supportsDateRange },
            sections: sections.map(bounded),
            notes,
          };
        },
      }),
    ];
  }

  private async financial(from: string, to: string, user: AuthenticatedUser): Promise<Section[]> {
    const [invoices, trend] = await Promise.all([this.billing.findAll(user), this.reports.revenueTrend()]);
    const issued = invoices.filter((invoice) => inRange(invoice.issueDate, from, to));
    const billed = issued.filter((invoice) => invoice.status !== 'cancelled');
    const sum = (values: number[]) => roundMoney(values.reduce((total, value) => total + value, 0));
    const payments = invoices.flatMap((invoice) => invoice.payments).filter((payment) => inRange(payment.createdAt, from, to));

    const byStatus = new Map<string, { count: number; amount: number; remaining: number }>();
    for (const invoice of issued) {
      const entry = byStatus.get(invoice.status) ?? { count: 0, amount: 0, remaining: 0 };
      entry.count += 1;
      entry.amount += invoice.amount;
      entry.remaining += invoice.remaining;
      byStatus.set(invoice.status, entry);
    }
    const byMethod = new Map<string, { count: number; amount: number; refunded: number }>();
    for (const payment of payments) {
      const entry = byMethod.get(payment.method) ?? { count: 0, amount: 0, refunded: 0 };
      entry.count += 1;
      entry.amount += payment.amount;
      entry.refunded += payment.refundedAmount;
      byMethod.set(payment.method, entry);
    }

    return [
      {
        title: 'Summary',
        columns: ['Metric', 'Value'],
        rows: [
          ['Invoices issued (non-cancelled)', billed.length],
          ['Invoices cancelled', issued.length - billed.length],
          ['Billed revenue', sum(billed.map((invoice) => invoice.amount))],
          ['Paid on those invoices', sum(billed.map((invoice) => invoice.amountPaid))],
          ['Outstanding on those invoices', sum(billed.map((invoice) => invoice.remaining))],
          ['Payments recorded in period', payments.length],
          ['Payments amount (gross)', sum(payments.map((payment) => payment.amount))],
          ['Refunded of those payments', sum(payments.map((payment) => payment.refundedAmount))],
        ],
      },
      {
        title: 'Invoices by status',
        columns: ['Status', 'Invoices', 'Amount', 'Outstanding'],
        rows: [...byStatus].map(([status, entry]) => [status, entry.count, roundMoney(entry.amount), roundMoney(entry.remaining)]),
      },
      {
        title: 'Payments by method',
        columns: ['Method', 'Payments', 'Amount', 'Refunded'],
        rows: [...byMethod].map(([method, entry]) => [method, entry.count, roundMoney(entry.amount), roundMoney(entry.refunded)]),
        note: 'Refunds are attributed to the original payment; refund dates are not available.',
      },
      {
        title: 'Billed revenue trend (last 6 months)',
        columns: ['Month', 'Revenue'],
        rows: trend.map((entry) => [entry.month, entry.revenue]),
      },
    ];
  }

  private async appointments(): Promise<Section[]> {
    const [byDepartment, byStatus] = await Promise.all([
      this.reports.appointmentsByDepartment(),
      this.reports.appointmentsByStatus(),
    ]);
    return [
      {
        title: 'Appointments by department (all time)',
        columns: ['Department', 'Appointments'],
        rows: byDepartment.map((entry) => [entry.department, entry.count]),
      },
      {
        title: 'Appointments by status (all time)',
        columns: ['Status', 'Appointments'],
        rows: byStatus.map((entry) => [entry.status, entry.count]),
      },
    ];
  }

  private async staffing(from: string, to: string): Promise<Section[]> {
    const [roster, shifts, tasks] = await Promise.all([
      this.roster.findAll(),
      this.shifts.findAll({ dateFrom: from, dateTo: to }),
      this.tasks.findAll(),
    ]);
    const shiftsInRange = shifts.filter((shift) => shift.status !== 'cancelled' && inRange(shift.date, from, to));
    const tasksInRange = tasks.filter((task) => inRange(task.dueAt, from, to));

    const byType = new Map<string, { total: number; active: number }>();
    for (const member of roster) {
      const entry = byType.get(member.staffType) ?? { total: 0, active: 0 };
      entry.total += 1;
      if (member.isActive) entry.active += 1;
      byType.set(member.staffType, entry);
    }
    const shiftGroups = new Map<string, { department: string; shiftType: string; shifts: number; hours: number; staff: Set<string> }>();
    for (const shift of shiftsInRange) {
      const department = shift.department ?? shift.staff.department ?? 'Unassigned';
      const key = `${department}|${shift.shiftType}`;
      const entry = shiftGroups.get(key) ?? { department, shiftType: shift.shiftType, shifts: 0, hours: 0, staff: new Set<string>() };
      entry.shifts += 1;
      entry.hours += (Date.parse(shift.endTime) - Date.parse(shift.startTime)) / 3_600_000;
      entry.staff.add(shift.staff.id);
      shiftGroups.set(key, entry);
    }
    const cancelled = shifts.filter((shift) => shift.status === 'cancelled' && inRange(shift.date, from, to)).length;

    return [
      {
        title: 'Roster headcount by staff type',
        columns: ['Staff type', 'Total', 'Active'],
        rows: [...byType].map(([type, entry]) => [type, entry.total, entry.active]),
      },
      {
        title: 'Roster headcount by department',
        columns: ['Department', 'Staff'],
        rows: [...countBy(roster, (member) => member.department ?? 'Unassigned')].map(([name, count]) => [name, count]),
      },
      {
        title: 'Shifts by department and type',
        columns: ['Department', 'Shift type', 'Shifts', 'Hours', 'Distinct staff'],
        rows: [...shiftGroups.values()]
          .sort((a, b) => a.department.localeCompare(b.department) || a.shiftType.localeCompare(b.shiftType))
          .map((entry) => [entry.department, entry.shiftType, entry.shifts, Math.round(entry.hours * 10) / 10, entry.staff.size]),
        note: `${cancelled} cancelled shift(s) in the range are excluded.`,
      },
      {
        title: 'Tasks due in period by status',
        columns: ['Status', 'Tasks'],
        rows: [...countBy(tasksInRange, (task) => task.status)].map(([status, count]) => [status, count]),
      },
    ];
  }
}
