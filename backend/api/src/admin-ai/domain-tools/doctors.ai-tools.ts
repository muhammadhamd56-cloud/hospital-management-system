import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppointmentsService } from '../../appointments/appointments.service';
import { DoctorsService } from '../../doctors/doctors.service';
import { PrismaService } from '../../prisma/prisma.service';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import {
  addDays,
  DOCTOR_DIRECTORY_LIMIT,
  findOverlaps,
  inRange,
  isoDateInput,
  loadAppointmentRows,
  resolveRange,
  startOfLocalDay,
} from './ai-tool-helpers';
import { conflictRow, toConflictRow } from './appointments.ai-tools';

const doctorRow = z.object({
  id: z.string(),
  fullName: z.string(),
  specialization: z.string(),
  department: z.string(),
  experienceYears: z.number(),
  rating: z.number(),
  isAvailable: z.boolean(),
  acceptsOnline: z.boolean(),
  consultationFee: z.number(),
  appointmentDurationMinutes: z.number(),
});

/**
 * Doctors: directory, booking availability, workload and double-booking
 * checks over DoctorsService.listDoctors + AppointmentsService.findAllForAdmin.
 * Read-only. GAP: there is no doctor working-hours/shift model linked to
 * Doctor, so "availability" means the booking flags plus booked load.
 */
@Injectable()
export class DoctorsAiTools implements AiToolProvider {
  readonly domain = 'doctors' as const;

  constructor(
    private readonly doctors: DoctorsService,
    private readonly appointments: AppointmentsService,
    private readonly prisma: PrismaService,
  ) {}

  private directory(ctxUser: Parameters<DoctorsService['listDoctors']>[1], q?: string, department?: string) {
    return this.doctors.listDoctors({ q, department, limit: DOCTOR_DIRECTORY_LIMIT }, ctxUser);
  }

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'doctors.listDoctors',
        domain: 'doctors',
        mode: 'read',
        permission: 'ai.read.doctors',
        description:
          'Doctor directory (includes doctors not yet approved). Optional `q` (every word must match first/last name, specialization or email) and exact `department` name. ' +
          'Returns id, name, specialization, department, experience, rating, booking flags, consultation fee and appointment length, sorted by rating; at most `limit` rows plus the exact matching count. No contact details.',
        input: z.object({
          q: z.string().trim().min(1).max(100).optional(),
          department: z.string().trim().min(1).max(80).optional(),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        output: z.object({ matching: z.number(), returned: z.number(), doctors: z.array(doctorRow) }),
        execute: async (args, ctx) => {
          const list = await this.directory(ctx.user, args.q, args.department);
          const rows = list.slice(0, args.limit).map((d) => ({
            id: d.id,
            fullName: d.fullName,
            specialization: d.specialization,
            department: d.department,
            experienceYears: d.experienceYears,
            rating: d.rating,
            isAvailable: d.isAvailable,
            acceptsOnline: d.acceptsOnline,
            consultationFee: d.consultationFee,
            appointmentDurationMinutes: d.appointmentDurationMinutes,
          }));
          return { matching: list.length, returned: rows.length, doctors: rows };
        },
      }),
      defineTool({
        name: 'doctors.getAvailability',
        domain: 'doctors',
        mode: 'read',
        permission: 'ai.read.doctors',
        description:
          'Booking availability per doctor: whether they accept bookings (isAvailable) and online sessions, appointment length, number of scheduled appointments in the next `days` days (default 7, max 60), and the next scheduled appointment time. ' +
          'Filter by doctorId, `q` or exact `department`. LIMITATION: no working hours/shifts are stored for doctors, so this is not a shift roster -- use appointments.findAvailableSlots for free times on a date. ' +
          'At most `limit` doctors plus the exact matching count.',
        input: z.object({
          doctorId: z.string().min(1).max(64).optional(),
          q: z.string().trim().min(1).max(100).optional(),
          department: z.string().trim().min(1).max(80).optional(),
          onlyAccepting: z.boolean().optional(),
          days: z.number().int().min(1).max(60).default(7),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        output: z.object({
          matching: z.number(),
          returned: z.number(),
          doctors: z.array(
            z.object({
              id: z.string(),
              fullName: z.string(),
              department: z.string(),
              isAvailable: z.boolean(),
              acceptsOnline: z.boolean(),
              appointmentDurationMinutes: z.number(),
              upcomingScheduled: z.number(),
              nextScheduledAt: z.string().nullable(),
            }),
          ),
        }),
        execute: async (args, ctx) => {
          const [list, rows] = await Promise.all([
            this.directory(ctx.user, args.q, args.department),
            loadAppointmentRows(this.appointments, this.prisma, ctx.user),
          ]);
          const now = new Date();
          const window = { from: now, to: addDays(now, args.days) };
          const matching = list.filter(
            (d) => (!args.doctorId || d.id === args.doctorId) && (!args.onlyAccepting || d.isAvailable),
          );
          const out = matching.slice(0, args.limit).map((d) => {
            const upcoming = rows
              .filter((r) => r.doctorId === d.id && r.status === 'scheduled' && r.scheduledAt >= now)
              .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
            return {
              id: d.id,
              fullName: d.fullName,
              department: d.department,
              isAvailable: d.isAvailable,
              acceptsOnline: d.acceptsOnline,
              appointmentDurationMinutes: d.appointmentDurationMinutes,
              upcomingScheduled: upcoming.filter((r) => inRange(r.scheduledAt, window)).length,
              nextScheduledAt: upcoming[0]?.scheduledAt.toISOString() ?? null,
            };
          });
          return { matching: matching.length, returned: out.length, doctors: out };
        },
      }),
      defineTool({
        name: 'doctors.getWorkload',
        domain: 'doctors',
        mode: 'read',
        permission: 'ai.read.doctors',
        description:
          'Appointments per doctor whose scheduledAt falls in a date range (default: last 30 days up to today; max 366 days), with scheduled/completed/cancelled counts and booked hours ' +
          "(non-cancelled appointments x the doctor's appointment length). Includes doctors with zero appointments. Optional exact `department`. " +
          'Sorted by total descending; at most `limit` doctors plus totals across all matching doctors.',
        input: z.object({
          from: isoDateInput.optional(),
          to: isoDateInput.optional(),
          department: z.string().trim().min(1).max(80).optional(),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        output: z.object({
          from: z.string(),
          to: z.string(),
          doctorCount: z.number(),
          totalAppointments: z.number(),
          returned: z.number(),
          doctors: z.array(
            z.object({
              doctorId: z.string(),
              doctorName: z.string(),
              department: z.string(),
              total: z.number(),
              scheduled: z.number(),
              completed: z.number(),
              cancelled: z.number(),
              bookedHours: z.number(),
            }),
          ),
        }),
        execute: async (args, ctx) => {
          const tomorrow = addDays(startOfLocalDay(new Date()), 1);
          const range = resolveRange(args.from, args.to, { from: addDays(tomorrow, -30), to: tomorrow });
          const [list, rows] = await Promise.all([
            this.directory(ctx.user, undefined, args.department),
            loadAppointmentRows(this.appointments, this.prisma, ctx.user),
          ]);
          const inWindow = rows.filter((r) => inRange(r.scheduledAt, range));
          const workload = list
            .map((d) => {
              const own = inWindow.filter((r) => r.doctorId === d.id);
              const count = (status: string) => own.filter((r) => r.status === status).length;
              const active = own.length - count('cancelled');
              return {
                doctorId: d.id,
                doctorName: d.fullName,
                department: d.department,
                total: own.length,
                scheduled: count('scheduled'),
                completed: count('completed'),
                cancelled: count('cancelled'),
                bookedHours: Math.round((active * Math.max(d.appointmentDurationMinutes, 1)) / 6) / 10,
              };
            })
            .sort((a, b) => b.total - a.total || a.doctorName.localeCompare(b.doctorName));
          const out = workload.slice(0, args.limit);
          return {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            doctorCount: workload.length,
            totalAppointments: workload.reduce((sum, d) => sum + d.total, 0),
            returned: out.length,
            doctors: out,
          };
        },
      }),
      defineTool({
        name: 'doctors.findScheduleConflicts',
        domain: 'doctors',
        mode: 'read',
        permission: 'ai.read.doctors',
        description:
          "Doctor double-bookings: pairs of overlapping SCHEDULED appointments for the same doctor in a date range (default: now to 30 days ahead; max 366 days), each lasting the doctor's appointment length. " +
          'Optional doctorId. At most `limit` pairs plus the exact total. (appointments.findConflicts also covers patient-side overlaps.)',
        input: z.object({
          doctorId: z.string().min(1).max(64).optional(),
          from: isoDateInput.optional(),
          to: isoDateInput.optional(),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        output: z.object({ total: z.number(), returned: z.number(), conflicts: z.array(conflictRow) }),
        execute: async (args, ctx) => {
          const now = new Date();
          const range = resolveRange(args.from, args.to, { from: now, to: addDays(now, 30) });
          const [list, rows] = await Promise.all([
            this.directory(ctx.user),
            loadAppointmentRows(this.appointments, this.prisma, ctx.user),
          ]);
          const durations = new Map(list.map((d) => [d.id, Math.max(d.appointmentDurationMinutes, 1)]));
          const lookback = new Date(range.from.getTime() - 240 * 60_000);
          const candidates = rows.filter(
            (r) => (!args.doctorId || r.doctorId === args.doctorId) && r.scheduledAt >= lookback && r.scheduledAt < range.to,
          );
          const overlaps = findOverlaps(candidates, durations, ['doctor']).filter(
            (o) => Math.min(o.first.endsAt.getTime(), o.second.endsAt.getTime()) > range.from.getTime(),
          );
          const out = overlaps.slice(0, args.limit).map((o) => toConflictRow(o, ctx.phi));
          return { total: overlaps.length, returned: out.length, conflicts: out };
        },
      }),
    ];
  }
}
