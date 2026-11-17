import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { AppointmentsService } from '../../appointments/appointments.service';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import type { DoctorsService } from '../../doctors/doctors.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Shared, read-only helpers for the group-A domain tool providers (dates,
 * appointment joins, overlap detection). No business rules live here.
 */

export const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-11-17` (a whole local day) or a full ISO timestamp with offset. */
export const isoDateInput = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);

export interface DateRange {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

/** Date-only strings are local days; `endOfDay` makes them the exclusive end of that day. */
export function parseInstant(value: string, endOfDay = false): Date {
  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day + (endOfDay ? 1 : 0));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid date: ${value}`);
  return date;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Resolves optional `from`/`to` inputs into a half-open range. A missing side
 * defaults to `defaults`; a range that is inverted or longer than
 * MAX_RANGE_DAYS is refused (400) so the model gets a clear message.
 */
export function resolveRange(from: string | undefined, to: string | undefined, defaults: DateRange): DateRange {
  const range = {
    from: from ? parseInstant(from) : defaults.from,
    to: to ? parseInstant(to, true) : defaults.to,
  };
  if (from && !to && range.to <= range.from) range.to = new Date(range.from.getTime() + (defaults.to.getTime() - defaults.from.getTime()));
  if (to && !from && range.from >= range.to) range.from = new Date(range.to.getTime() - (defaults.to.getTime() - defaults.from.getTime()));
  if (range.to <= range.from) throw new BadRequestException('`to` must be after `from`');
  if (range.to.getTime() - range.from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new BadRequestException(`Date range is limited to ${MAX_RANGE_DAYS} days`);
  }
  return range;
}

export function inRange(date: Date, range: DateRange): boolean {
  return date >= range.from && date < range.to;
}

/** Local calendar day, `YYYY-MM-DD`. */
export function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** An admin appointment row joined with the ids the admin response omits. */
export interface AppointmentRow {
  id: string;
  patientId: string;
  doctorId: string;
  patientName: string;
  doctorName: string;
  specialization: string;
  department: string;
  scheduledAt: Date;
  mode: 'online' | 'in-person';
  status: 'scheduled' | 'completed' | 'cancelled';
  reason: string;
}

/**
 * AppointmentsService.findAllForAdmin (same scoping as the Appointments page)
 * joined with patientId/doctorId, which AdminAppointmentResponse does not
 * expose. GAP: that join is a narrow read-only Prisma select of
 * {id, patientId, doctorId} -- needed for stable patient pseudonyms and for
 * grouping by doctor without relying on display names. Rows are restricted
 * to ids the service returned, so the service's scoping still applies.
 */
export async function loadAppointmentRows(
  appointments: AppointmentsService,
  prisma: PrismaService,
  user: AuthenticatedUser,
): Promise<AppointmentRow[]> {
  const list = await appointments.findAllForAdmin(user);
  if (list.length === 0) return [];
  const links = await prisma.appointment.findMany({
    where: { id: { in: list.map((appointment) => appointment.id) } },
    select: { id: true, patientId: true, doctorId: true },
  });
  const byId = new Map(links.map((link) => [link.id, link]));
  return list.flatMap((appointment) => {
    const link = byId.get(appointment.id);
    if (!link) return [];
    return [
      {
        id: appointment.id,
        patientId: link.patientId,
        doctorId: link.doctorId,
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        specialization: appointment.specialization,
        department: appointment.department,
        scheduledAt: new Date(appointment.scheduledAt),
        mode: appointment.mode,
        status: appointment.status,
        reason: appointment.reason,
      },
    ];
  });
}

/** Upper bound for "every doctor" directory reads (the service default is 20). */
export const DOCTOR_DIRECTORY_LIMIT = 1000;

/** doctorId -> configured appointment length in minutes (DoctorsService.listDoctors). */
export async function loadDoctorDurations(doctors: DoctorsService, user: AuthenticatedUser): Promise<Map<string, number>> {
  const list = await doctors.listDoctors({ limit: DOCTOR_DIRECTORY_LIMIT }, user);
  return new Map(list.map((doctor) => [doctor.id, Math.max(doctor.appointmentDurationMinutes, 1)]));
}

export const DEFAULT_DURATION_MINUTES = 30;

export interface Overlap {
  kind: 'doctor' | 'patient';
  first: AppointmentRow & { endsAt: Date };
  second: AppointmentRow & { endsAt: Date };
  overlapMinutes: number;
}

/**
 * Pairs of SCHEDULED appointments whose [start, start + duration) intervals
 * overlap, for the same doctor (and optionally the same patient). Duration is
 * the doctor's current appointmentDurationMinutes -- the same rule
 * AppointmentsService.book uses for its conflict check.
 */
export function findOverlaps(
  rows: readonly AppointmentRow[],
  durations: ReadonlyMap<string, number>,
  kinds: ReadonlyArray<'doctor' | 'patient'>,
): Overlap[] {
  const scheduled = rows
    .filter((row) => row.status === 'scheduled')
    .map((row) => ({
      ...row,
      endsAt: new Date(row.scheduledAt.getTime() + (durations.get(row.doctorId) ?? DEFAULT_DURATION_MINUTES) * 60_000),
    }))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const overlaps: Overlap[] = [];
  for (const kind of kinds) {
    const groups = new Map<string, typeof scheduled>();
    for (const row of scheduled) {
      const key = kind === 'doctor' ? row.doctorId : row.patientId;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length && group[j].scheduledAt < group[i].endsAt; j++) {
          const end = Math.min(group[i].endsAt.getTime(), group[j].endsAt.getTime());
          overlaps.push({
            kind,
            first: group[i],
            second: group[j],
            overlapMinutes: Math.round((end - group[j].scheduledAt.getTime()) / 60_000),
          });
        }
      }
    }
  }
  return overlaps.sort((a, b) => a.first.scheduledAt.getTime() - b.first.scheduledAt.getTime());
}
