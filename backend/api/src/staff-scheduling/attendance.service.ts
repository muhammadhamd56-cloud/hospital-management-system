import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceResponse, toAttendanceResponse, toPrismaAttendanceStatus } from './attendance.mapper';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

export interface AttendanceFilters {
  staffId?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(filters: AttendanceFilters = {}): Promise<AttendanceResponse[]> {
    const rows = await this.prisma.attendance.findMany({
      where: {
        staffId: filters.staffId,
        shift: {
          date: {
            gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
            lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toAttendanceResponse);
  }

  /** A staff member cannot have two attendance records for the same shift --
   *  Attendance.shiftId is @unique; this just gives a friendlier error than
   *  a raw Prisma constraint violation. */
  async create(dto: CreateAttendanceDto, actorId: string): Promise<AttendanceResponse> {
    const shift = await this.prisma.staffShift.findUnique({ where: { id: dto.shiftId } });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    const existing = await this.prisma.attendance.findUnique({ where: { shiftId: dto.shiftId } });

    if (existing) {
      throw new ConflictException('Attendance has already been recorded for this shift');
    }

    if (dto.checkIn && dto.checkOut && new Date(dto.checkOut) <= new Date(dto.checkIn)) {
      throw new BadRequestException('Check-out must be after check-in');
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        shiftId: dto.shiftId,
        staffId: shift.staffId,
        status: toPrismaAttendanceStatus(dto.status),
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
        notes: dto.notes,
      },
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CREATE,
      entityType: 'Attendance',
      entityId: attendance.id,
      metadata: { shiftId: attendance.shiftId, staffId: attendance.staffId, status: attendance.status },
    });

    return toAttendanceResponse(attendance);
  }

  async update(id: string, dto: UpdateAttendanceDto, actorId: string): Promise<AttendanceResponse> {
    const existing = await this.prisma.attendance.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Attendance record not found');
    }

    const checkIn = dto.checkIn ? new Date(dto.checkIn) : existing.checkIn;
    const checkOut = dto.checkOut ? new Date(dto.checkOut) : existing.checkOut;

    if (checkIn && checkOut && checkOut <= checkIn) {
      throw new BadRequestException('Check-out must be after check-in');
    }

    const attendance = await this.prisma.attendance.update({
      where: { id },
      data: {
        status: dto.status ? toPrismaAttendanceStatus(dto.status) : existing.status,
        checkIn,
        checkOut,
        notes: dto.notes ?? existing.notes,
      },
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'Attendance',
      entityId: attendance.id,
      metadata: { before: existing },
    });

    return toAttendanceResponse(attendance);
  }
}
