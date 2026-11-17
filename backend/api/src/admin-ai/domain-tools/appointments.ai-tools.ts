import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppointmentsService } from '../../appointments/appointments.service';
import { DoctorsService } from '../../doctors/doctors.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { PhiMasker } from '../security/phi-masker';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import {
  addDays,
  countBy,
  DOCTOR_DIRECTORY_LIMIT,
  findOverlaps,
  inRange,
  isoDateInput,
  loadAppointmentRows,
  loadDoctorDurations,
  localDayKey,
  parseInstant,
  resolveRange,
  startOfLocalDay,
  type AppointmentRow,
  type Overlap,
} from './ai-tool-helpers';

const STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:MM');

export const appointmentRow = z.object({
  id: z.string(),
  scheduledAt: z.string(),
  status: z.string(),
  mode: z.string(),
  doctorId: z.string(),
  doctorName: z.string(),
  specialization: z.string(),
  department: z.string(),
  patientId: z.string(),
  patient: z.string(),
  reason: z.string().optional(),
});

export const conflictRow = z.object({
  kind: z.enum(['doctor', 'patient']),
  doctorName: z.string().optional(),
  patient: z.string().optional(),
  overlapMinutes: z.number(),
  first: z.object({ id: z.string(), doctorName: z.string(), scheduledAt: z.string(), endsAt: z.string() }),
  second: z.object({ id: z.string(), doctorName: z.string(), scheduledAt: z.string(), endsAt: z.string() }),
});

export function toAppointmentRow(row: AppointmentRow, phi: PhiMasker): z.infer<typeof appointmentRow> {
  return {
    id: row.id,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status,
    mode: row.mode,
    doctorId: row.doctorId,
    doctorName: row.doctorName,
    specialization: row.specialization,
    department: row.department,
    patientId: row.patientId,
    patient: phi.patientName(row.patientId, row.patientName),
    reason: phi.clinicalText(row.reason),
  };
}

export function toConflictRow(overlap: Overlap, phi: PhiMasker): z.infer<typeof conflictRow> {
  const side = (row: Overlap['first']) => ({
    id: row.id,
    doctorName: row.doctorName,
    scheduledAt: row.scheduledAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  });
  return {
    kind: overlap.kind,
    ...(overlap.kind === 'doctor'
      ? { doctorName: overlap.first.doctorName }
      : { patient: phi.patientName(overlap.first.patientId, overlap.first.patientName) }),
    overlapMinutes: overlap.overlapMinutes,
    first: side(overlap.first),
    second: side(overlap.second),
  };
}

/**
 * Appointments: search, trends, conflicts and free-slot computation over
 * AppointmentsService.findAllForAdmin (the Appointments page's data). Read-only.
 * GAP: no service can reschedule an appointment (only a patient-side cancel
 * exists), so no reschedule proposal is offered.
 */
@Injectable()
export class AppointmentsAiTools implements AiToolProvider {
  readonly domain = 'appointments' as const;

  constructor(
    private readonly appointments: AppointmentsService,
    private readonly doctors: DoctorsService,
    private readonly prisma: PrismaService,
  ) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'appointments.searchAppointments',
        domain: 'appointments',
        mode: 'read',
        permission: 'ai.read.appointments',
        description:
          'Search appointments. Filters (all optional, AND-ed): status, doctor (doctor id, or case-insensitive substring of doctor name), department (substring), ' +
          'from/to (ISO date or datetime on scheduledAt; date-only `to` includes that whole day; max 366 days). Sorted by scheduledAt (`order`). ' +
          'Returns at most `limit` rows plus the exact matching count. Patient display name is a pseudonym and the visit reason is omitted when PHI sharing is off. ' +
          'Rescheduling is NOT supported by the system.',
        input: z.object({
          status: z.enum(STATUSES).optional(),
          doctor: z.string().trim().min(1).max(100).optional(),
          department: z.string().trim().min(1).max(80).optional(),
          from: isoDateInput.optional(),
          to: isoDateInput.optional(),
          order: z.enum(['asc', 'desc']).default('asc'),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        output: z.object({ matching: z.number(), returned: z.number(), appointments: z.array(appointmentRow) }),
        execute: async (args, ctx) => {
          const range =
            args.from || args.to
              ? resolveRange(args.from, args.to, { from: startOfLocalDay(new Date()), to: addDays(startOfLocalDay(new Date()), 30) })
              : null;
          const rows = await loadAppointmentRows(this.appointments, this.prisma, ctx.user);
          const doctor = args.doctor?.toLowerCase();
          const department = args.department?.toLowerCase();
          const matching = rows
            .filter((row) => !args.status || row.status === args.status)
            .filter((row) => !doctor || row.doctorId === args.doctor || row.doctorName.toLowerCase().includes(doctor))
            .filter((row) => !department || row.department.toLowerCase().includes(department))
            .filter((row) => !range || inRange(row.scheduledAt, range))
            .sort((a, b) => (a.scheduledAt.getTime() - b.scheduledAt.getTime()) * (args.order === 'asc' ? 1 : -1));
          const out = matching.slice(0, args.limit).map((row) => toAppointmentRow(row, ctx.phi));
          return { matching: matching.length, returned: out.length, appointments: out };
        },
      }),
      defineTool({
        name: 'appointments.getAppointmentTrends',
        domain: 'appointments',
        mode: 'read',
        permission: 'ai.read.appointments',
        description:
          'Appointment volume for a scheduledAt date range (default: last 30 days up to today; max 366 days): total, counts by status, mode and department, ' +
          'and a per-day series (local days, only days with appointments) with per-status counts. Optional department filter (substring). Aggregates only.',
        input: z.object({
          from: isoDateInput.optional(),
          to: isoDateInput.optional(),
          department: z.string().trim().min(1).max(80).optional(),
        }),
        output: z.object({
          from: z.string(),
          to: z.string(),
          total: z.number(),
          byStatus: z.record(z.string(), z.number()),
          byMode: z.record(z.string(), z.number()),
          byDepartment: z.array(z.object({ department: z.string(), count: z.number() })),
          byDay: z.array(
            z.object({ date: z.string(), total: z.number(), scheduled: z.number(), completed: z.number(), cancelled: z.number() }),
          ),
        }),
        execute: async (args, ctx) => {
          const tomorrow = addDays(startOfLocalDay(new Date()), 1);
          const range = resolveRange(args.from, args.to, { from: addDays(tomorrow, -30), to: tomorrow });
          const department = args.department?.toLowerCase();
          const list = (await this.appointments.findAllForAdmin(ctx.user)).filter(
            (a) =>
              inRange(new Date(a.scheduledAt), range) && (!department || a.department.toLowerCase().includes(department)),
          );
          const days = new Map<string, typeof list>();
          for (const a of list) {
            const key = localDayKey(new Date(a.scheduledAt));
            days.set(key, [...(days.get(key) ?? []), a]);
          }
          const byDepartment = countBy(list, (a) => a.department);
          return {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            total: list.length,
            byStatus: countBy(list, (a) => a.status),
            byMode: countBy(list, (a) => a.mode),
            byDepartment: Object.entries(byDepartment)
              .map(([name, count]) => ({ department: name, count }))
              .sort((a, b) => b.count - a.count),
            byDay: [...days.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, items]) => ({
                date,
                total: items.length,
                scheduled: items.filter((a) => a.status === 'scheduled').length,
                completed: items.filter((a) => a.status === 'completed').length,
                cancelled: items.filter((a) => a.status === 'cancelled').length,
              })),
          };
        },
      }),
      defineTool({
        name: 'appointments.findConflicts',
        domain: 'appointments',
        mode: 'read',
        permission: 'ai.read.appointments',
        description:
          'Overlapping SCHEDULED appointments in a date range (default: now to 30 days ahead; max 366 days): same doctor double-booked, and/or same patient in two overlapping visits. ' +
          "Each appointment lasts its doctor's current appointmentDurationMinutes (the rule the booking check uses). Returns at most `limit` conflict pairs plus the exact total.",
        input: z.object({
          from: isoDateInput.optional(),
          to: isoDateInput.optional(),
          kind: z.enum(['doctor', 'patient', 'both']).default('both'),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        output: z.object({ total: z.number(), returned: z.number(), conflicts: z.array(conflictRow) }),
        execute: async (args, ctx) => {
          const now = new Date();
          const range = resolveRange(args.from, args.to, { from: now, to: addDays(now, 30) });
          const [rows, durations] = await Promise.all([
            loadAppointmentRows(this.appointments, this.prisma, ctx.user),
            loadDoctorDurations(this.doctors, ctx.user),
          ]);
          const kinds: Array<'doctor' | 'patient'> = args.kind === 'both' ? ['doctor', 'patient'] : [args.kind];
          // Keep rows that started before the window but may still run into it.
          const lookback = new Date(range.from.getTime() - 240 * 60_000);
          const overlaps = findOverlaps(
            rows.filter((row) => row.scheduledAt >= lookback && row.scheduledAt < range.to),
            durations,
            kinds,
          ).filter((o) => Math.min(o.first.endsAt.getTime(), o.second.endsAt.getTime()) > range.from.getTime());
          const out = overlaps.slice(0, args.limit).map((o) => toConflictRow(o, ctx.phi));
          return { total: overlaps.length, returned: out.length, conflicts: out };
        },
      }),
      defineTool({
        name: 'appointments.findAvailableSlots',
        domain: 'appointments',
        mode: 'read',
        permission: 'ai.read.appointments',
        description:
          "Computes free start times for one doctor on one date. LIMITATION: the system stores no doctor working hours, so the window is the `dayStart`-`dayEnd` you pass (default 09:00-17:00, server local time) -- state that assumption to the admin. " +
          "Slots are back-to-back blocks of the doctor's appointmentDurationMinutes that do not overlap the doctor's scheduled appointments and are in the future. " +
          'Also returns whether the doctor is currently accepting bookings and online sessions. Booking itself is not offered.',
        input: z.object({
          doctorId: z.string().min(1).max(64),
          date: z.iso.date(),
          dayStart: HHMM.default('09:00'),
          dayEnd: HHMM.default('17:00'),
          limit: z.number().int().min(1).max(100).default(30),
        }),
        output: z.object({
          doctorId: z.string(),
          doctorName: z.string(),
          isAvailable: z.boolean(),
          acceptsOnline: z.boolean(),
          durationMinutes: z.number(),
          window: z.object({ start: z.string(), end: z.string() }),
          bookedInWindow: z.number(),
          totalFree: z.number(),
          returned: z.number(),
          slots: z.array(z.object({ start: z.string(), end: z.string() })),
        }),
        execute: async (args, ctx) => {
          const directory = await this.doctors.listDoctors({ limit: DOCTOR_DIRECTORY_LIMIT }, ctx.user);
          const doctor = directory.find((d) => d.id === args.doctorId);
          if (!doctor) throw new BadRequestException('Doctor not found');
          const day = parseInstant(args.date);
          const at = (hhmm: string) => {
            const [h, m] = hhmm.split(':').map(Number);
            return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
          };
          const windowStart = at(args.dayStart);
          const windowEnd = at(args.dayEnd);
          if (windowEnd <= windowStart) throw new BadRequestException('dayEnd must be after dayStart');
          const durationMs = Math.max(doctor.appointmentDurationMinutes, 1) * 60_000;

          const rows = await loadAppointmentRows(this.appointments, this.prisma, ctx.user);
          const busy = rows
            .filter((row) => row.doctorId === doctor.id && row.status === 'scheduled')
            .map((row) => ({ start: row.scheduledAt.getTime(), end: row.scheduledAt.getTime() + durationMs }))
            .filter((b) => b.end > windowStart.getTime() && b.start < windowEnd.getTime());

          const now = Date.now();
          const free: Array<{ start: string; end: string }> = [];
          for (let t = windowStart.getTime(); t + durationMs <= windowEnd.getTime(); t += durationMs) {
            const end = t + durationMs;
            if (t <= now) continue;
            if (busy.some((b) => b.start < end && t < b.end)) continue;
            free.push({ start: new Date(t).toISOString(), end: new Date(end).toISOString() });
          }
          const slots = free.slice(0, args.limit);
          return {
            doctorId: doctor.id,
            doctorName: doctor.fullName,
            isAvailable: doctor.isAvailable,
            acceptsOnline: doctor.acceptsOnline,
            durationMinutes: doctor.appointmentDurationMinutes,
            window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
            bookedInWindow: busy.length,
            totalFree: free.length,
            returned: slots.length,
            slots,
          };
        },
      }),
    ];
  }
}
