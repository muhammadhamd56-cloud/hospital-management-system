import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ShiftsService } from '../../staff-scheduling/shifts.service';
import type { StaffResponse } from '../../staff-scheduling/staff.mapper';
import { StaffService as RosterStaffService } from '../../staff-scheduling/staff.service';
import { TasksService } from '../../staff-scheduling/tasks.service';
import { StaffService as StaffAccountsService } from '../../staff/staff.service';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { checkRange, inRange, isoDate } from './group-b.shared';

const workloadRow = z.object({
  staffId: z.string(),
  name: z.string(),
  staffType: z.string(),
  department: z.string().nullable(),
  isActive: z.boolean(),
  shifts: z.number(),
  shiftHours: z.number(),
  cancelledShifts: z.number(),
  tasksDue: z.number(),
  tasksOpen: z.number(),
  tasksOverdue: z.number(),
  tasksCompleted: z.number(),
});

const countRow = z.object({ name: z.string(), total: z.number(), active: z.number() });

function tally<T>(items: T[], key: (item: T) => string, isActive: (item: T) => boolean) {
  const map = new Map<string, { total: number; active: number }>();
  for (const item of items) {
    const entry = map.get(key(item)) ?? { total: 0, active: 0 };
    entry.total += 1;
    if (isActive(item)) entry.active += 1;
    map.set(key(item), entry);
  }
  return [...map].map(([name, counts]) => ({ name, ...counts })).sort((a, b) => b.total - a.total);
}

/**
 * Staff: headcount and workload over the two existing staff views -- login
 * accounts (staff/StaffService: DOCTOR/STAFF users) and the scheduling
 * roster (staff-scheduling/StaffService: type, department, active flag) --
 * plus shifts and tasks from ShiftsService/TasksService. Read-only.
 */
@Injectable()
export class StaffAiTools implements AiToolProvider {
  readonly domain = 'staff' as const;

  constructor(
    private readonly accounts: StaffAccountsService,
    private readonly roster: RosterStaffService,
    private readonly shifts: ShiftsService,
    private readonly tasks: TasksService,
  ) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'staff.getStaffOverview',
        domain: 'staff',
        mode: 'read',
        permission: 'ai.read.staff',
        description:
          'Headcount snapshot. `accounts`: doctor/staff login accounts by role. `roster`: scheduling-roster members (total, active/inactive, linked to a login account) broken down by staff type and by department (roster members without a department are counted under "Unassigned"). Counts only -- no names.',
        input: z.object({}),
        output: z.object({
          accounts: z.object({ total: z.number(), byRole: z.array(z.object({ role: z.string(), count: z.number() })) }),
          roster: z.object({
            total: z.number(),
            active: z.number(),
            inactive: z.number(),
            linkedToAccount: z.number(),
            byType: z.array(countRow),
            byDepartment: z.array(countRow),
          }),
        }),
        execute: async () => {
          const [accounts, roster] = await Promise.all([this.accounts.findAll(), this.roster.findAll()]);
          const roles = new Map<string, number>();
          for (const account of accounts) roles.set(account.role, (roles.get(account.role) ?? 0) + 1);
          const active = roster.filter((member) => member.isActive).length;
          return {
            accounts: { total: accounts.length, byRole: [...roles].map(([role, count]) => ({ role, count })) },
            roster: {
              total: roster.length,
              active,
              inactive: roster.length - active,
              linkedToAccount: roster.filter((member) => member.userId).length,
              byType: tally(roster, (member) => member.staffType, (member) => member.isActive),
              byDepartment: tally(roster, (member) => member.department ?? 'Unassigned', (member) => member.isActive),
            },
          };
        },
      }),
      defineTool({
        name: 'staff.getWorkloadSummary',
        domain: 'staff',
        mode: 'read',
        permission: 'ai.read.staff',
        description:
          'Per-staff-member workload between `from` and `to` (inclusive, YYYY-MM-DD, max 366 days), optionally for one department (exact name): non-cancelled shifts and their scheduled hours, cancelled shifts, and tasks due in the range (open / overdue / completed). Only staff with at least one shift or task appear. Sorted by scheduled hours, at most `limit` rows (max 100) plus exact totals.',
        input: z
          .object({
            from: isoDate,
            to: isoDate,
            department: z.string().min(1).max(80).optional(),
            limit: z.number().int().min(1).max(100).default(30),
          })
          .superRefine((value, ctx) => checkRange(value.from, value.to, ctx)),
        output: z.object({
          from: z.string(),
          to: z.string(),
          staffWithWork: z.number(),
          returned: z.number(),
          totalShifts: z.number(),
          totalShiftHours: z.number(),
          totalTasks: z.number(),
          staff: z.array(workloadRow),
        }),
        execute: async (args) => {
          const [shifts, tasks] = await Promise.all([
            this.shifts.findAll({ dateFrom: args.from, dateTo: args.to, department: args.department }),
            this.tasks.findAll({ department: args.department }),
          ]);
          type Row = z.infer<typeof workloadRow>;
          const rows = new Map<string, Row>();
          const rowFor = (member: StaffResponse) => {
            let row = rows.get(member.id);
            if (!row) {
              row = {
                staffId: member.id,
                name: member.fullName,
                staffType: member.staffType,
                department: member.department,
                isActive: member.isActive,
                shifts: 0,
                shiftHours: 0,
                cancelledShifts: 0,
                tasksDue: 0,
                tasksOpen: 0,
                tasksOverdue: 0,
                tasksCompleted: 0,
              };
              rows.set(member.id, row);
            }
            return row;
          };
          for (const shift of shifts) {
            if (!inRange(shift.date, args.from, args.to)) continue;
            const row = rowFor(shift.staff);
            if (shift.status === 'cancelled') {
              row.cancelledShifts += 1;
              continue;
            }
            row.shifts += 1;
            row.shiftHours += (Date.parse(shift.endTime) - Date.parse(shift.startTime)) / 3_600_000;
          }
          let totalTasks = 0;
          for (const task of tasks) {
            if (!inRange(task.dueAt, args.from, args.to)) continue;
            totalTasks += 1;
            const row = rowFor(task.assignedTo);
            row.tasksDue += 1;
            if (task.status === 'completed') row.tasksCompleted += 1;
            else row.tasksOpen += 1;
            if (task.status === 'overdue') row.tasksOverdue += 1;
          }
          const all = [...rows.values()]
            .map((row) => ({ ...row, shiftHours: Math.round(row.shiftHours * 10) / 10 }))
            .sort((a, b) => b.shiftHours - a.shiftHours || b.tasksDue - a.tasksDue);
          const returned = all.slice(0, args.limit);
          return {
            from: args.from,
            to: args.to,
            staffWithWork: all.length,
            returned: returned.length,
            totalShifts: all.reduce((sum, row) => sum + row.shifts, 0),
            totalShiftHours: Math.round(all.reduce((sum, row) => sum + row.shiftHours, 0) * 10) / 10,
            totalTasks,
            staff: returned,
          };
        },
      }),
      defineTool({
        name: 'staff.listDepartments',
        domain: 'staff',
        mode: 'read',
        permission: 'ai.read.staff',
        description:
          'Departments that have at least one scheduling-roster member, with total/active roster headcount and how many are doctors. Departments with no roster members are not listed (there is no separate department directory).',
        input: z.object({}),
        output: z.object({
          total: z.number(),
          departments: z.array(z.object({ name: z.string(), total: z.number(), active: z.number(), doctors: z.number() })),
          unassignedStaff: z.number(),
        }),
        execute: async () => {
          const roster = await this.roster.findAll();
          const withDepartment = roster.filter((member) => member.department);
          const departments = tally(withDepartment, (member) => member.department as string, (member) => member.isActive)
            .map((entry) => ({
              ...entry,
              doctors: withDepartment.filter((m) => m.department === entry.name && m.staffType === 'doctor').length,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          return { total: departments.length, departments, unassignedStaff: roster.length - withDepartment.length };
        },
      }),
    ];
  }
}

