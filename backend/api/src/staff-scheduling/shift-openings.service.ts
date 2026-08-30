import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaShiftType } from './shifts.mapper';
import { toPrismaStaffType } from './staff.mapper';
import { CreateShiftOpeningDto } from './dto/create-shift-opening.dto';
import { UpdateShiftOpeningDto } from './dto/update-shift-opening.dto';
import { toShiftOpeningResponse, ShiftOpeningResponse } from './shift-openings.mapper';
import type { ClientStaffType } from './dto/create-staff.dto';

const INCLUDE = { department: true, applications: { select: { status: true, staffId: true } } } as const;

export interface ShiftOpeningFilters {
  isOpen?: boolean;
  requiredStaffType?: ClientStaffType;
  department?: string;
}

@Injectable()
export class ShiftOpeningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(filters: ShiftOpeningFilters = {}): Promise<ShiftOpeningResponse[]> {
    const openings = await this.prisma.shiftOpening.findMany({
      where: {
        isOpen: filters.isOpen,
        requiredStaffType: filters.requiredStaffType ? toPrismaStaffType(filters.requiredStaffType) : undefined,
        department: filters.department ? { name: filters.department } : undefined,
      },
      include: INCLUDE,
      orderBy: { date: 'asc' },
    });

    return openings.map((opening) => toShiftOpeningResponse(opening));
  }

  /** Openings a given staff member could plausibly apply to: matching role,
   *  still open, deadline not passed, shift date not already in the past.
   *  Each includes that staff member's own application status (if any) so
   *  the frontend can render "Apply" vs. "Already applied" without a
   *  second round trip. */
  async findAvailableForStaff(staffId: string, staffType: ClientStaffType): Promise<ShiftOpeningResponse[]> {
    const now = new Date();

    const openings = await this.prisma.shiftOpening.findMany({
      where: {
        isOpen: true,
        requiredStaffType: toPrismaStaffType(staffType),
        applicationDeadline: { gt: now },
        date: { gte: new Date(now.toISOString().slice(0, 10)) },
      },
      include: INCLUDE,
      orderBy: { date: 'asc' },
    });

    return openings.map((opening) => toShiftOpeningResponse(opening, staffId));
  }

  async findOne(id: string): Promise<ShiftOpeningResponse> {
    const opening = await this.prisma.shiftOpening.findUnique({ where: { id }, include: INCLUDE });

    if (!opening) {
      throw new NotFoundException('Shift opening not found');
    }

    return toShiftOpeningResponse(opening);
  }

  async create(dto: CreateShiftOpeningDto, actorId: string): Promise<ShiftOpeningResponse> {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    const date = new Date(`${dto.date}T00:00:00.000Z`);
    const applicationDeadline = new Date(dto.applicationDeadline);

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    if (endTime <= startTime) {
      throw new BadRequestException('Shift end time must be after the start time');
    }

    if (Number.isNaN(applicationDeadline.getTime()) || applicationDeadline > startTime) {
      throw new BadRequestException('Application deadline must be before the shift starts');
    }

    const departmentId = await this.resolveDepartmentId(dto.department);

    const opening = await this.prisma.shiftOpening.create({
      data: {
        requiredStaffType: toPrismaStaffType(dto.requiredStaffType),
        departmentId,
        date,
        startTime,
        endTime,
        shiftType: toPrismaShiftType(dto.shiftType),
        positions: dto.positions,
        applicationDeadline,
        notes: dto.notes,
        createdById: actorId,
      },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CREATE,
      entityType: 'ShiftOpening',
      entityId: opening.id,
      metadata: { requiredStaffType: opening.requiredStaffType, date: opening.date, positions: opening.positions },
    });

    return toShiftOpeningResponse(opening);
  }

  async update(id: string, dto: UpdateShiftOpeningDto, actorId: string): Promise<ShiftOpeningResponse> {
    const existing = await this.prisma.shiftOpening.findUnique({ where: { id }, include: INCLUDE });

    if (!existing) {
      throw new NotFoundException('Shift opening not found');
    }

    const approvedCount = (existing.applications ?? []).filter((application) => application.status === 'APPROVED').length;
    const positions = dto.positions ?? existing.positions;

    if (positions < approvedCount) {
      throw new BadRequestException(
        `Cannot reduce positions below the ${approvedCount} application(s) already approved`,
      );
    }

    const applicationDeadline = dto.applicationDeadline ? new Date(dto.applicationDeadline) : existing.applicationDeadline;

    if (dto.applicationDeadline && applicationDeadline > existing.startTime) {
      throw new BadRequestException('Application deadline must be before the shift starts');
    }

    const opening = await this.prisma.shiftOpening.update({
      where: { id },
      data: {
        positions,
        applicationDeadline,
        notes: dto.notes ?? existing.notes,
        isOpen: dto.isOpen ?? existing.isOpen,
      },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'ShiftOpening',
      entityId: opening.id,
      metadata: { before: { positions: existing.positions, isOpen: existing.isOpen, applicationDeadline: existing.applicationDeadline } },
    });

    return toShiftOpeningResponse(opening);
  }

  /** Only allowed with zero applications -- once someone has applied, close
   *  it (isOpen: false) via update() instead of destroying that history. */
  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.shiftOpening.findUnique({
      where: { id },
      include: { applications: { select: { id: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Shift opening not found');
    }

    if (existing.applications.length > 0) {
      throw new ConflictException(
        'This opening already has applications -- close it instead of deleting so the application history is kept',
      );
    }

    await this.prisma.shiftOpening.delete({ where: { id } });

    await this.auditLog.log({
      actorId,
      action: AuditAction.DELETE,
      entityType: 'ShiftOpening',
      entityId: id,
      metadata: { requiredStaffType: existing.requiredStaffType, date: existing.date },
    });
  }

  private async resolveDepartmentId(name?: string): Promise<string | undefined> {
    if (!name) return undefined;

    const department = await this.prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });

    return department.id;
  }
}
