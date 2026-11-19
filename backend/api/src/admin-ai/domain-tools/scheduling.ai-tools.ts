import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AvailabilityService } from '../../staff-scheduling/availability.service';
import { CreateShiftDto, SHIFT_STATUSES, SHIFT_TYPES } from '../../staff-scheduling/dto/create-shift.dto';
import type { ShiftResponse } from '../../staff-scheduling/shifts.mapper';
import { parseLocalMinutes, ShiftsService } from '../../staff-scheduling/shifts.service';
import { StaffService as RosterStaffService } from '../../staff-scheduling/staff.service';
import { defineAction, type AiActionHandler } from '../tools/ai-action.types';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { checkRange, eachDay, inRange, isoDate, validateDto } from './group-b.shared';

const id = z.string().min(1).max(64);
const shiftType = z.enum(SHIFT_TYPES as [string, ...string[]]);
const shiftStatus = z.enum(SHIFT_STATUSES as [string, ...string[]]);
const MAX_SHIFT_HOURS = 24;
/** Staff whose leave/availability is checked per detectConflicts call (two service calls each). */
const MAX_STAFF_CHECKED = 100;

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const shiftRow = z.object({
  id: z.string(),
  staffId: z.string(),
  staffName: z.string(),
  staffType: z.string(),
  department: z.string().nullable(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  shiftType: z.string(),
  status: z.string(),
});

function toShiftRow(shift: ShiftResponse): z.infer<typeof shiftRow> {
  return {
    id: shift.id,
    staffId: shift.staff.id,
    staffName: shift.staff.fullName,
    staffType: shift.staff.staffType,
    department: shift.department,
    date: shift.date.slice(0, 10),
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    status: shift.status,
  };
}

/**
 * Wall-clock ISO instant with an explicit offset, e.g. 2026-11-20T08:00:00+05:00.
 * The offset is what lets the server recover the admin's local date and start
 * time -- the same two values the Scheduling page sends alongside the instants.
 */
const zonedDateTime = z.iso.datetime({ offset: true, local: false });

const createShiftParams = z
  .object({
    staffId: id,
    startTime: zonedDateTime,
    endTime: zonedDateTime,
    shiftType,
    department: z.string().min(1).max(80).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

type CreateShiftParams = z.infer<typeof createShiftParams>;

/** Builds the exact CreateShiftDto the Scheduling page would send. */
function toCreateShiftPlain(params: CreateShiftParams): Record<string, unknown> {
  return {
    staffId: params.staffId,
    department: params.department,
    startTime: new Date(params.startTime).toISOString(),
    endTime: new Date(params.endTime).toISOString(),
    date: params.startTime.slice(0, 10),
    localStartTime: params.startTime.slice(11, 16),
    shiftType: params.shiftType,
    notes: params.notes,
  };
}

/**
 * Scheduling: shift listings, conflict and coverage analysis over
 * ShiftsService/AvailabilityService, plus a single-shift creation proposal
 * executed through ShiftsService.create (which re-runs every overlap, leave,
 * availability and active-staff check inside its own transaction). The
 * copilot never edits, cancels or deletes existing shifts.
 */
@Injectable()
export class SchedulingAiTools implements AiToolProvider {
  readonly domain = 'scheduling' as const;

  constructor(
    private readonly shifts: ShiftsService,
    private readonly availability: AvailabilityService,
    private readonly roster: RosterStaffService,
  ) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'scheduling.listShifts',
        domain: 'scheduling',
        mode: 'read',
        permission: 'ai.read.scheduling',
        description:
          'Shifts dated between `from` and `to` (inclusive, YYYY-MM-DD, max 366 days), optionally for one staff id, one department (exact name) and/or one status. Ordered by start time; at most `limit` rows (max 100) plus the exact total. Shift notes are not included.',
        input: z
          .object({
            from: isoDate,
            to: isoDate,
            staffId: id.optional(),
            department: z.string().min(1).max(80).optional(),
            status: shiftStatus.optional(),
            limit: z.number().int().min(1).max(100).default(50),
          })
          .superRefine((value, ctx) => checkRange(value.from, value.to, ctx)),
        output: z.object({ total: z.number(), returned: z.number(), shifts: z.array(shiftRow) }),
        execute: async (args) => {
          const shifts = (
            await this.shifts.findAll({
              dateFrom: args.from,
              dateTo: args.to,
              staffId: args.staffId,
              department: args.department,
              status: args.status as ShiftResponse['status'] | undefined,
            })
          ).filter((shift) => inRange(shift.date, args.from, args.to));
          const rows = shifts.slice(0, args.limit).map(toShiftRow);
          return { total: shifts.length, returned: rows.length, shifts: rows };
        },
      }),
      defineTool({
        name: 'scheduling.detectConflicts',
        domain: 'scheduling',
        mode: 'read',
        permission: 'ai.read.scheduling',
        description: `Check non-cancelled shifts between \`from\` and \`to\` (inclusive, max 366 days) for: overlapping shifts of the same staff member, shifts on a date the staff member has recorded leave, shifts on a weekday they are marked unavailable, and shifts assigned to inactive staff. Leave/availability is checked for at most ${MAX_STAFF_CHECKED} distinct staff (reported in staffNotChecked). Returns at most \`limit\` issues (max 100) plus exact totals per type.`,
        input: z
          .object({ from: isoDate, to: isoDate, limit: z.number().int().min(1).max(100).default(50) })
          .superRefine((value, ctx) => checkRange(value.from, value.to, ctx)),
        output: z.object({
          shiftsChecked: z.number(),
          staffChecked: z.number(),
          staffNotChecked: z.number(),
          totalIssues: z.number(),
          byType: z.object({
            overlap: z.number(),
            on_leave: z.number(),
            unavailable_day: z.number(),
            inactive_staff: z.number(),
          }),
          returned: z.number(),
          issues: z.array(
            z.object({
              type: z.enum(['overlap', 'on_leave', 'unavailable_day', 'inactive_staff']),
              staffId: z.string(),
              staffName: z.string(),
              date: z.string(),
              shiftIds: z.array(z.string()),
              detail: z.string(),
            }),
          ),
        }),
        execute: async (args) => {
          const shifts = (await this.shifts.findAll({ dateFrom: args.from, dateTo: args.to })).filter(
            (shift) => shift.status !== 'cancelled' && inRange(shift.date, args.from, args.to),
          );
          type Issue = {
            type: 'overlap' | 'on_leave' | 'unavailable_day' | 'inactive_staff';
            staffId: string;
            staffName: string;
            date: string;
            shiftIds: string[];
            detail: string;
          };
          const issues: Issue[] = [];
          const byStaff = new Map<string, ShiftResponse[]>();
          for (const shift of shifts) byStaff.set(shift.staff.id, [...(byStaff.get(shift.staff.id) ?? []), shift]);

          for (const [, own] of byStaff) {
            own.sort((a, b) => a.startTime.localeCompare(b.startTime));
            for (let i = 0; i < own.length; i += 1) {
              for (let j = i + 1; j < own.length && Date.parse(own[j].startTime) < Date.parse(own[i].endTime); j += 1) {
                issues.push({
                  type: 'overlap',
                  staffId: own[i].staff.id,
                  staffName: own[i].staff.fullName,
                  date: own[i].date.slice(0, 10),
                  shiftIds: [own[i].id, own[j].id],
                  detail: `${own[i].shiftType} shift (${own[i].startTime}-${own[i].endTime}) overlaps ${own[j].shiftType} shift (${own[j].startTime}-${own[j].endTime})`,
                });
              }
            }
            for (const shift of own.filter((candidate) => !candidate.staff.isActive)) {
              issues.push({
                type: 'inactive_staff',
                staffId: shift.staff.id,
                staffName: shift.staff.fullName,
                date: shift.date.slice(0, 10),
                shiftIds: [shift.id],
                detail: 'Shift is assigned to a staff member marked inactive',
              });
            }
          }

          const staffIds = [...byStaff.keys()];
          const checked = staffIds.slice(0, MAX_STAFF_CHECKED);
          const lookups = await Promise.all(
            checked.map(async (staffId) => {
              const [leave, availability] = await Promise.all([
                this.availability.listLeave(staffId),
                this.availability.findForStaff(staffId),
              ]);
              return { staffId, leave, availability };
            }),
          );
          for (const { staffId, leave, availability } of lookups) {
            const leaveDays = new Set(leave.map((entry) => entry.date.slice(0, 10)));
            const unavailable = new Set(availability.filter((day) => !day.isAvailable).map((day) => day.dayOfWeek));
            for (const shift of byStaff.get(staffId) ?? []) {
              const day = shift.date.slice(0, 10);
              const base = { staffId, staffName: shift.staff.fullName, date: day, shiftIds: [shift.id] };
              if (leaveDays.has(day)) issues.push({ ...base, type: 'on_leave', detail: 'Shift falls on a recorded leave day' });
              const weekday = DAY_NAMES[new Date(`${day}T00:00:00.000Z`).getUTCDay()];
              if (unavailable.has(weekday)) {
                issues.push({ ...base, type: 'unavailable_day', detail: `Staff member is marked unavailable on ${weekday}s` });
              }
            }
          }

          const count = (type: Issue['type']) => issues.filter((issue) => issue.type === type).length;
          const rows = issues.slice(0, args.limit);
          return {
            shiftsChecked: shifts.length,
            staffChecked: checked.length,
            staffNotChecked: staffIds.length - checked.length,
            totalIssues: issues.length,
            byType: {
              overlap: count('overlap'),
              on_leave: count('on_leave'),
              unavailable_day: count('unavailable_day'),
              inactive_staff: count('inactive_staff'),
            },
            returned: rows.length,
            issues: rows,
          };
        },
      }),
      defineTool({
        name: 'scheduling.findCoverageGaps',
        domain: 'scheduling',
        mode: 'read',
        permission: 'ai.read.scheduling',
        description:
          'For every day between `from` and `to` (inclusive, max 366 days) and each requested shift type (default morning/evening/night), count distinct staff on non-cancelled shifts (optionally one department, exact name) and report the day/shift-type slots with fewer than `minStaff`. Returns at most `limit` gaps (max 100, earliest first) plus the exact total.',
        input: z
          .object({
            from: isoDate,
            to: isoDate,
            minStaff: z.number().int().min(1).max(50).default(1),
            shiftTypes: z.array(shiftType).min(1).max(4).optional(),
            department: z.string().min(1).max(80).optional(),
            limit: z.number().int().min(1).max(100).default(50),
          })
          .superRefine((value, ctx) => checkRange(value.from, value.to, ctx)),
        output: z.object({
          slotsChecked: z.number(),
          totalGaps: z.number(),
          returned: z.number(),
          gaps: z.array(
            z.object({ date: z.string(), shiftType: z.string(), assigned: z.number(), required: z.number(), shortfall: z.number() }),
          ),
        }),
        execute: async (args) => {
          const types = [...new Set(args.shiftTypes ?? ['morning', 'evening', 'night'])];
          const shifts = (
            await this.shifts.findAll({ dateFrom: args.from, dateTo: args.to, department: args.department })
          ).filter((shift) => shift.status !== 'cancelled' && inRange(shift.date, args.from, args.to));
          const staffPerSlot = new Map<string, Set<string>>();
          for (const shift of shifts) {
            const key = `${shift.date.slice(0, 10)}|${shift.shiftType}`;
            staffPerSlot.set(key, (staffPerSlot.get(key) ?? new Set<string>()).add(shift.staff.id));
          }
          const days = eachDay(args.from, args.to);
          const gaps = days.flatMap((date) =>
            types.flatMap((type) => {
              const assigned = staffPerSlot.get(`${date}|${type}`)?.size ?? 0;
              return assigned < args.minStaff
                ? [{ date, shiftType: type, assigned, required: args.minStaff, shortfall: args.minStaff - assigned }]
                : [];
            }),
          );
          const rows = gaps.slice(0, args.limit);
          return { slotsChecked: days.length * types.length, totalGaps: gaps.length, returned: rows.length, gaps: rows };
        },
      }),
      defineTool({
        name: 'scheduling.proposeShiftPlan',
        domain: 'scheduling',
        mode: 'propose',
        permission: 'ai.propose.scheduling',
        description:
          "Prepare (not perform) creating ONE new shift for one staff member; call once per shift. Times are ISO 8601 with the admin's UTC offset (e.g. 2026-11-20T08:00:00+05:00) -- the local date and start time are read from them. The proposal is checked for overlaps, leave, availability and inactive staff and must be approved by the admin. Existing shifts are never changed or removed. Use staff ids from scheduling.listShifts or staff tools.",
        input: createShiftParams,
        output: z.unknown(),
        execute: async (args) => ({ actionType: 'scheduling.createShift', params: { ...args } }),
      }),
    ];
  }

  actions(): AiActionHandler[] {
    return [
      defineAction({
        type: 'scheduling.createShift',
        domain: 'scheduling',
        schema: createShiftParams,
        preview: async (params) => {
          const dto = await validateDto(CreateShiftDto, toCreateShiftPlain(params));
          const startTime = new Date(dto.startTime);
          const endTime = new Date(dto.endTime);
          const hours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
          if (hours <= 0) throw new BadRequestException('Shift end time must be after the start time');
          if (hours > MAX_SHIFT_HOURS) throw new BadRequestException(`A shift may not be longer than ${MAX_SHIFT_HOURS} hours`);
          if (startTime.getTime() < Date.now()) throw new BadRequestException('Shift start time is in the past');

          const staff = (await this.roster.findAll()).find((member) => member.id === dto.staffId);
          if (!staff) throw new BadRequestException('Staff member not found');
          if (!staff.isActive) throw new BadRequestException(`${staff.fullName} is not active and cannot be scheduled`);

          await this.shifts.assertNoSchedulingConflict({
            staffId: dto.staffId,
            startTime,
            endTime,
            date: new Date(`${dto.date}T00:00:00.000Z`),
            localStartMinutes: parseLocalMinutes(dto.localStartTime),
          });

          const department = dto.department ?? staff.department ?? 'no department';
          return `Create a ${dto.shiftType} shift for ${staff.fullName} (${staff.staffType}, ${department}) on ${dto.date}, ${params.startTime.slice(11, 16)}-${params.endTime.slice(11, 16)} local time (${hours.toFixed(1)} h).`;
        },
        execute: async (params, user) => {
          const dto = await validateDto(CreateShiftDto, toCreateShiftPlain(params));
          const shift = await this.shifts.create(dto, user.id);
          return { shiftId: shift.id, staffId: shift.staff.id, date: shift.date.slice(0, 10), status: shift.status };
        },
      }),
    ];
  }
}
