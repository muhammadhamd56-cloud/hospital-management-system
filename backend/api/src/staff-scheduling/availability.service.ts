import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, DayOfWeek } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpsertAvailabilityDto } from './dto/upsert-availability.dto';
import {
  AvailabilityResponse,
  LeaveResponse,
  toAvailabilityResponse,
  toClientDay,
  toLeaveResponse,
  toPrismaDay,
} from './availability.mapper';

const ALL_DAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
];

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async assertStaffExists(staffId: string): Promise<void> {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
  }

  /** Days without a saved row default to "available, no time restriction" --
   *  admins only need to set exceptions, not fill in all 7 days. */
  async findForStaff(staffId: string): Promise<AvailabilityResponse[]> {
    await this.assertStaffExists(staffId);

    const rows = await this.prisma.staffAvailability.findMany({ where: { staffId } });
    const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));

    return ALL_DAYS.map((day) => {
      const row = byDay.get(day);
      return row
        ? toAvailabilityResponse(row)
        : { dayOfWeek: toClientDay(day), isAvailable: true, availableFrom: null, availableTo: null };
    });
  }

  async upsertForStaff(staffId: string, dto: UpsertAvailabilityDto, actorId: string): Promise<AvailabilityResponse[]> {
    await this.assertStaffExists(staffId);

    await this.prisma.$transaction(
      dto.days.map((day) =>
        this.prisma.staffAvailability.upsert({
          where: { staffId_dayOfWeek: { staffId, dayOfWeek: toPrismaDay(day.dayOfWeek) } },
          update: {
            isAvailable: day.isAvailable,
            availableFrom: day.isAvailable ? (day.availableFrom ?? null) : null,
            availableTo: day.isAvailable ? (day.availableTo ?? null) : null,
          },
          create: {
            staffId,
            dayOfWeek: toPrismaDay(day.dayOfWeek),
            isAvailable: day.isAvailable,
            availableFrom: day.isAvailable ? (day.availableFrom ?? null) : null,
            availableTo: day.isAvailable ? (day.availableTo ?? null) : null,
          },
        }),
      ),
    );

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'StaffAvailability',
      entityId: staffId,
      metadata: { days: dto.days },
    });

    return this.findForStaff(staffId);
  }

  async listLeave(staffId: string): Promise<LeaveResponse[]> {
    await this.assertStaffExists(staffId);

    const rows = await this.prisma.staffLeave.findMany({ where: { staffId }, orderBy: { date: 'asc' } });
    return rows.map(toLeaveResponse);
  }

  async createLeave(staffId: string, dto: CreateLeaveDto, actorId: string): Promise<LeaveResponse> {
    await this.assertStaffExists(staffId);

    const date = startOfDay(new Date(dto.date));
    const row = await this.prisma.staffLeave.upsert({
      where: { staffId_date: { staffId, date } },
      update: { reason: dto.reason },
      create: { staffId, date, reason: dto.reason },
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CREATE,
      entityType: 'StaffLeave',
      entityId: row.id,
      metadata: { staffId, date: row.date, reason: row.reason },
    });

    return toLeaveResponse(row);
  }

  async removeLeave(staffId: string, id: string, actorId: string): Promise<void> {
    const row = await this.prisma.staffLeave.findUnique({ where: { id } });

    if (!row || row.staffId !== staffId) {
      throw new NotFoundException('Leave record not found');
    }

    await this.prisma.staffLeave.delete({ where: { id } });

    await this.auditLog.log({
      actorId,
      action: AuditAction.DELETE,
      entityType: 'StaffLeave',
      entityId: id,
      metadata: { staffId, date: row.date },
    });
  }
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
