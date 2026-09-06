import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, DayOfWeek, NotificationType, Prisma, ShiftStatus, ShiftType } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClientShiftStatus, CreateShiftDto } from './dto/create-shift.dto';
import { CreateRecurringShiftDto } from './dto/create-recurring-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { ShiftResponse, ShiftWithStaff, toPrismaShiftStatus, toPrismaShiftType, toShiftResponse } from './shifts.mapper';

const INCLUDE = { staff: { include: { user: true, department: true } }, department: true } as const;

/** JS Date#getUTCDay() returns 0 (Sunday) .. 6 (Saturday); index into this
 *  to get the matching Prisma DayOfWeek. */
const DAY_OF_WEEK_BY_JS_INDEX: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  [ShiftType.MORNING]: 'Morning',
  [ShiftType.EVENING]: 'Evening',
  [ShiftType.NIGHT]: 'Night',
  [ShiftType.CUSTOM]: 'Custom',
};

export interface ShiftFilters {
  staffId?: string;
  department?: string;
  status?: ClientShiftStatus;
  dateFrom?: string;
  dateTo?: string;
}

/** Either the top-level PrismaService or a $transaction callback's client --
 *  conflict checks must run against whichever one is also doing the
 *  write, or Serializable isolation can't see its own in-flight read. */
type Db = PrismaService | Prisma.TransactionClient;

const CONFLICT_MESSAGE = "You're already assigned to a shift during this time.";

interface AssignmentCheck {
  staffId: string;
  startTime: Date;
  endTime: Date;
  /** The admin's local calendar date (UTC midnight of that date) -- used
   *  for day-of-week/leave lookups instead of truncating startTime, which
   *  can land on the wrong calendar day once a UTC offset is involved. */
  date: Date;
  /** Minutes since local midnight for startTime, as entered by the admin --
   *  compared directly against availableFrom/availableTo (also local
   *  wall-clock), never against startTime's UTC hour. */
  localStartMinutes: number;
  excludeShiftId?: string;
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(filters: ShiftFilters = {}): Promise<ShiftResponse[]> {
    const shifts = await this.prisma.staffShift.findMany({
      where: {
        staffId: filters.staffId,
        department: filters.department ? { name: filters.department } : undefined,
        status: filters.status ? toPrismaShiftStatus(filters.status) : undefined,
        date: {
          gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
          lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
        },
      },
      include: INCLUDE,
      orderBy: { startTime: 'asc' },
    });

    return shifts.map(toShiftResponse);
  }

  async findOne(id: string): Promise<ShiftResponse> {
    const shift = await this.prisma.staffShift.findUnique({ where: { id }, include: INCLUDE });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    return toShiftResponse(shift);
  }

  async create(dto: CreateShiftDto, createdById: string): Promise<ShiftResponse> {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    const date = parseLocalDate(dto.date);
    const localStartMinutes = parseLocalMinutes(dto.localStartTime);

    const departmentId = await this.resolveDepartmentId(dto.department);

    // Serializable so two concurrent assignments for the same staff member
    // can't both pass the conflict check before either commits -- mirrors
    // AppointmentsService.book(); see assertNoSchedulingConflict's overlap
    // query for what this is guarding.
    let shift: ShiftWithStaff;
    try {
      shift = await this.prisma.$transaction(
        async (tx) => {
          await this.assertValidAssignment({ staffId: dto.staffId, startTime, endTime, date, localStartMinutes }, tx);

          return tx.staffShift.create({
            data: {
              staffId: dto.staffId,
              departmentId,
              date,
              startTime,
              endTime,
              shiftType: toPrismaShiftType(dto.shiftType),
              notes: dto.notes,
              groupId: dto.groupId,
              createdById,
            },
            include: INCLUDE,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException(CONFLICT_MESSAGE);
      }
      throw error;
    }

    await this.auditLog.log({
      actorId: createdById,
      action: AuditAction.CREATE,
      entityType: 'StaffShift',
      entityId: shift.id,
      metadata: { staffId: shift.staffId, startTime: shift.startTime, endTime: shift.endTime, shiftType: shift.shiftType },
    });

    await this.notifyStaff(
      shift,
      NotificationType.SHIFT_SCHEDULED,
      'Shift scheduled',
      `You have been scheduled for a ${SHIFT_TYPE_LABELS[shift.shiftType]} shift on ${formatShiftDate(shift.date)}.`,
    );

    return toShiftResponse(shift);
  }

  /**
   * Creates one StaffShift per occurrence, validating conflicts (overlap,
   * availability, leave) for EVERY occurrence before committing any of
   * them. If any occurrence fails, every shift already created in this
   * batch is rolled back and the original error is re-thrown -- recurring
   * shifts are all-or-nothing, never partially created.
   *
   * Occurrence start/end are already-resolved ISO instants computed by the
   * frontend (see CreateRecurringShiftDto) -- the backend never guesses
   * which local calendar day/weekday a wall-clock time belongs to, since
   * only the browser knows the admin's timezone offset.
   */
  async createRecurring(dto: CreateRecurringShiftDto, createdById: string): Promise<ShiftResponse[]> {
    const departmentId = await this.resolveDepartmentId(dto.department);
    const groupId = randomUUID();
    const created: ShiftWithStaff[] = [];

    try {
      for (const occurrence of dto.occurrences) {
        const startTime = new Date(occurrence.startTime);
        const endTime = new Date(occurrence.endTime);
        const date = parseLocalDate(occurrence.date);
        const localStartMinutes = parseLocalMinutes(occurrence.localStartTime);

        // Serializable per-occurrence, same reasoning as create() -- each
        // occurrence's check+create must run against the one connection
        // that also holds its write, or two concurrent requests could both
        // pass the check for the same occurrence before either commits.
        const shift = await this.prisma.$transaction(
          async (tx) => {
            await this.assertValidAssignment({ staffId: dto.staffId, startTime, endTime, date, localStartMinutes }, tx);

            return tx.staffShift.create({
              data: {
                staffId: dto.staffId,
                departmentId,
                date,
                startTime,
                endTime,
                shiftType: toPrismaShiftType(dto.shiftType),
                notes: dto.notes,
                groupId,
                createdById,
              },
              include: INCLUDE,
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        created.push(shift);
      }
    } catch (error) {
      if (created.length > 0) {
        await this.prisma.staffShift.deleteMany({ where: { id: { in: created.map((shift) => shift.id) } } });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException(CONFLICT_MESSAGE);
      }
      throw error;
    }

    await this.auditLog.log({
      actorId: createdById,
      action: AuditAction.CREATE,
      entityType: 'StaffShift',
      entityId: groupId,
      metadata: { staffId: dto.staffId, shiftIds: created.map((shift) => shift.id), recurring: true },
    });

    const first = created[0];
    if (first) {
      await this.notifyStaff(
        first,
        NotificationType.SHIFT_SCHEDULED,
        'Recurring shift scheduled',
        `You have been scheduled for ${created.length} shift${created.length === 1 ? '' : 's'} starting ${formatShiftDate(first.date)}.`,
      );
    }

    return created.map(toShiftResponse);
  }

  /** Re-validates conflicts on every edit (requirement: "validate conflicts
   *  again" before saving changes) -- skipped only when nothing schedule-
   *  relevant (staff/time) actually changed, e.g. a notes-only edit or a
   *  status transition. */
  async update(id: string, dto: UpdateShiftDto, actorId: string): Promise<ShiftResponse> {
    const existing = await this.prisma.staffShift.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Shift not found');
    }

    const staffId = dto.staffId ?? existing.staffId;
    const startTime = dto.startTime ? new Date(dto.startTime) : existing.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : existing.endTime;
    const date = dto.date ? parseLocalDate(dto.date) : existing.date;
    const departmentId =
      dto.department !== undefined ? await this.resolveDepartmentId(dto.department) : existing.departmentId;

    const scheduleChanged = dto.staffId !== undefined || dto.startTime !== undefined || dto.endTime !== undefined;

    const newStatus = dto.status ? toPrismaShiftStatus(dto.status) : existing.status;
    const isNewlyCancelled = newStatus === ShiftStatus.CANCELLED && existing.status !== ShiftStatus.CANCELLED;

    const updateData = {
      staffId,
      departmentId,
      date,
      startTime,
      endTime,
      shiftType: dto.shiftType ? toPrismaShiftType(dto.shiftType) : existing.shiftType,
      status: newStatus,
      notes: dto.notes ?? existing.notes,
    };

    let shift: ShiftWithStaff;
    if (scheduleChanged) {
      // dto.localStartTime should always accompany dto.startTime from the
      // frontend; falling back to the (less accurate) UTC hour only covers
      // a caller that skips the recommended field entirely.
      const localStartMinutes = dto.localStartTime
        ? parseLocalMinutes(dto.localStartTime)
        : startTime.getUTCHours() * 60 + startTime.getUTCMinutes();

      // Serializable so this re-validation can't be raced by a concurrent
      // assignment the same way create()'s can -- see the comment there.
      try {
        shift = await this.prisma.$transaction(
          async (tx) => {
            await this.assertValidAssignment(
              { staffId, startTime, endTime, date, localStartMinutes, excludeShiftId: id },
              tx,
            );

            return tx.staffShift.update({ where: { id }, data: updateData, include: INCLUDE });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          throw new ConflictException(CONFLICT_MESSAGE);
        }
        throw error;
      }
    } else {
      shift = await this.prisma.staffShift.update({ where: { id }, data: updateData, include: INCLUDE });
    }

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'StaffShift',
      entityId: shift.id,
      metadata: { before: existing, cancelled: isNewlyCancelled },
    });

    if (isNewlyCancelled) {
      await this.notifyStaff(
        shift,
        NotificationType.SHIFT_CANCELLED,
        'Shift cancelled',
        `Your shift on ${formatShiftDate(shift.date)} has been cancelled.`,
      );
    } else {
      await this.notifyStaff(
        shift,
        NotificationType.SHIFT_UPDATED,
        'Shift updated',
        `Your shift on ${formatShiftDate(shift.date)} has been updated.`,
      );
    }

    return toShiftResponse(shift);
  }

  /** Hard delete is only for shifts still Scheduled (created in error) --
   *  everything else should be cancelled via status so the history sticks
   *  around for attendance/reporting. */
  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.staffShift.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Shift not found');
    }

    if (existing.status !== ShiftStatus.SCHEDULED) {
      throw new BadRequestException('Only shifts still in Scheduled status can be deleted -- cancel it instead');
    }

    await this.prisma.staffShift.delete({ where: { id } });

    await this.auditLog.log({
      actorId,
      action: AuditAction.DELETE,
      entityType: 'StaffShift',
      entityId: id,
      metadata: { staffId: existing.staffId, startTime: existing.startTime, endTime: existing.endTime },
    });
  }

  /** Everything except staff-existence/active checks, factored out so
   *  ShiftApplicationsService can run the identical overlap/leave/
   *  availability checks before approving an application, without a second
   *  StaffShift-creation path that could diverge from this one. */
  async assertNoSchedulingConflict(params: AssignmentCheck, db: Db = this.prisma): Promise<void> {
    const { staffId, startTime, endTime, date, localStartMinutes, excludeShiftId } = params;

    this.assertBasicShiftTiming(startTime, endTime, date);

    const dayOfWeek = DAY_OF_WEEK_BY_JS_INDEX[date.getUTCDay()];

    const [leave, availability] = await Promise.all([
      db.staffLeave.findUnique({ where: { staffId_date: { staffId, date } } }),
      db.staffAvailability.findUnique({ where: { staffId_dayOfWeek: { staffId, dayOfWeek } } }),
    ]);

    if (leave) {
      throw new BadRequestException('Staff member is on leave on this date');
    }

    if (availability && !availability.isAvailable) {
      throw new BadRequestException('Staff member is unavailable on this day');
    }

    if (availability?.isAvailable && availability.availableFrom && availability.availableTo) {
      const availableFromMinutes = parseLocalMinutes(availability.availableFrom);
      const availableToMinutes = parseLocalMinutes(availability.availableTo);

      if (localStartMinutes < availableFromMinutes || localStartMinutes > availableToMinutes) {
        throw new BadRequestException("Shift start time falls outside the staff member's available hours");
      }
    }

    const overlapping = await db.staffShift.findFirst({
      where: {
        staffId,
        status: { not: ShiftStatus.CANCELLED },
        id: excludeShiftId ? { not: excludeShiftId } : undefined,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (overlapping) {
      throw new ConflictException(CONFLICT_MESSAGE);
    }
  }

  private assertBasicShiftTiming(startTime: Date, endTime: Date, date: Date): void {
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    if (endTime <= startTime) {
      throw new BadRequestException('Shift end time must be after the start time');
    }
  }

  private async assertValidAssignment(params: AssignmentCheck, db: Db = this.prisma): Promise<void> {
    // Preserves the original check order (timing, then staff existence,
    // then leave/availability/overlap) -- callers/tests rely on a
    // malformed date/time never reaching the staff lookup.
    this.assertBasicShiftTiming(params.startTime, params.endTime, params.date);

    const staff = await db.staff.findUnique({ where: { id: params.staffId } });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    if (!staff.isActive) {
      throw new BadRequestException('This staff member is not active and cannot be scheduled');
    }

    await this.assertNoSchedulingConflict(params, db);
  }

  /**
   * Creates the real, conflict-checked StaffShift an approved ShiftApplication
   * produces. Goes through the exact same assertNoSchedulingConflict() an
   * admin's direct shift assignment does -- an approved application can
   * never produce a double-booking a direct assignment would have rejected.
   * `notify: false` lets the caller (ShiftApplicationsService) send its own,
   * more specific "application approved" notification instead of the
   * generic "shift scheduled" one this method would otherwise send.
   */
  async assignFromOpening(params: {
    staffId: string;
    departmentId?: string | null;
    date: Date;
    startTime: Date;
    endTime: Date;
    shiftType: ShiftType;
    createdById: string;
    notes?: string;
    notify?: boolean;
  }): Promise<ShiftWithStaff> {
    const localStartMinutes = params.startTime.getUTCHours() * 60 + params.startTime.getUTCMinutes();

    // Serializable, same reasoning as create() -- an approved application
    // and a directly-scheduled shift racing for the same slot must not
    // both be able to slip past this check.
    let shift: ShiftWithStaff;
    try {
      shift = await this.prisma.$transaction(
        async (tx) => {
          await this.assertNoSchedulingConflict(
            {
              staffId: params.staffId,
              startTime: params.startTime,
              endTime: params.endTime,
              date: params.date,
              localStartMinutes,
            },
            tx,
          );

          return tx.staffShift.create({
            data: {
              staffId: params.staffId,
              departmentId: params.departmentId ?? undefined,
              date: params.date,
              startTime: params.startTime,
              endTime: params.endTime,
              shiftType: params.shiftType,
              notes: params.notes,
              createdById: params.createdById,
            },
            include: INCLUDE,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException(CONFLICT_MESSAGE);
      }
      throw error;
    }

    await this.auditLog.log({
      actorId: params.createdById,
      action: AuditAction.CREATE,
      entityType: 'StaffShift',
      entityId: shift.id,
      metadata: { staffId: shift.staffId, startTime: shift.startTime, endTime: shift.endTime, fromApplication: true },
    });

    if (params.notify !== false) {
      await this.notifyStaff(
        shift,
        NotificationType.SHIFT_SCHEDULED,
        'Shift scheduled',
        `You have been scheduled for a ${SHIFT_TYPE_LABELS[shift.shiftType]} shift on ${formatShiftDate(shift.date)}.`,
      );
    }

    return shift;
  }

  /** Departments are name-keyed across the app -- upsert rather than
   *  require a separate "manage departments" screen. */
  private async resolveDepartmentId(name?: string): Promise<string | undefined> {
    if (!name) return undefined;

    const department = await this.prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });

    return department.id;
  }

  /** Only staff types with a login account (Doctor, Lab Technician) have
   *  anyone to notify -- name-only roster entries are silently skipped. */
  private async notifyStaff(
    shift: ShiftWithStaff,
    type: NotificationType,
    title: string,
    body: string,
  ): Promise<void> {
    if (!shift.staff.userId) return;

    await this.notifications.create(shift.staff.userId, type, title, body, `/my-shifts?shiftId=${shift.id}`);
  }
}

/** Parses a "YYYY-MM-DD" local calendar date into a UTC-midnight Date
 *  representing that same calendar day -- never derived from a UTC
 *  instant, which can land on the wrong day once an offset is involved. */
function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Parses a local "HH:mm" wall-clock string into minutes since midnight. */
function parseLocalMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

/** Formats a shift's `date` (already UTC-midnight of the admin's intended
 *  local calendar day) -- timeZone: 'UTC' is required here so the output
 *  reflects that calendar day regardless of the server's own timezone. */
function formatShiftDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}
