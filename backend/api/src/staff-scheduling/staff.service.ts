import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Role, StaffType } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { toClientRole } from '../common/role.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { ClientStaffType, CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffResponse, toPrismaStaffType, toStaffResponse } from './staff.mapper';

/**
 * The auth Role a linked User must already have for each roster staffType --
 * keeps someone from linking, say, a patient account. Doctor is its own
 * dedicated role; every other staffType (nurse, receptionist, pharmacist,
 * lab technician, other) shares the general STAFF login role and is
 * distinguished only by this roster row's staffType, not by a separate
 * auth role.
 */
const STAFF_TYPE_TO_AUTH_ROLE: Record<StaffType, Role> = {
  [StaffType.DOCTOR]: Role.DOCTOR,
  [StaffType.NURSE]: Role.STAFF,
  [StaffType.RECEPTIONIST]: Role.STAFF,
  [StaffType.PHARMACIST]: Role.STAFF,
  [StaffType.LAB_TECHNICIAN]: Role.STAFF,
  [StaffType.OTHER]: Role.STAFF,
};

const INCLUDE = { user: true, department: true } as const;

export interface StaffFilters {
  staffType?: ClientStaffType;
  department?: string;
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(filters: StaffFilters = {}): Promise<StaffResponse[]> {
    const staff = await this.prisma.staff.findMany({
      where: {
        staffType: filters.staffType ? toPrismaStaffType(filters.staffType) : undefined,
        department: filters.department ? { name: filters.department } : undefined,
      },
      include: INCLUDE,
      orderBy: { fullName: 'asc' },
    });

    return staff.map(toStaffResponse);
  }

  /**
   * Doctor entries always link to an existing User (via userId) -- never a
   * duplicate identity. Every other staff type can either link an existing
   * (unlinked) STAFF-role account the same way, or be entered as a
   * name-only roster row when the person doesn't need portal access,
   * same precedent as the old NursingStaff model this replaces.
   */
  async create(dto: CreateStaffDto, actorId: string): Promise<StaffResponse> {
    const staffType = toPrismaStaffType(dto.staffType);
    const departmentId = await this.resolveDepartmentId(dto.department);

    if (dto.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });

      if (!user) {
        throw new NotFoundException('User account not found');
      }

      const expectedRole = STAFF_TYPE_TO_AUTH_ROLE[staffType];
      if (user.role !== expectedRole) {
        throw new BadRequestException(`Selected user does not have the ${toClientRole(expectedRole)} role`);
      }

      const existingLink = await this.prisma.staff.findUnique({ where: { userId: dto.userId } });
      if (existingLink) {
        throw new ConflictException('This user is already on the staff scheduling roster');
      }

      const staff = await this.prisma.staff.create({
        data: {
          staffType,
          fullName: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
          userId: user.id,
          departmentId,
        },
        include: INCLUDE,
      });

      await this.auditLog.log({
        actorId,
        action: AuditAction.CREATE,
        entityType: 'Staff',
        entityId: staff.id,
        metadata: { staffType: staff.staffType, userId: staff.userId },
      });

      return toStaffResponse(staff);
    }

    const staff = await this.prisma.staff.create({
      data: {
        staffType,
        fullName: dto.fullName!,
        email: dto.email,
        departmentId,
      },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CREATE,
      entityType: 'Staff',
      entityId: staff.id,
      metadata: { staffType: staff.staffType, fullName: staff.fullName },
    });

    return toStaffResponse(staff);
  }

  async update(id: string, dto: UpdateStaffDto, actorId: string): Promise<StaffResponse> {
    const existing = await this.prisma.staff.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Staff member not found');
    }

    if (existing.userId && (dto.fullName !== undefined || dto.email !== undefined)) {
      throw new BadRequestException(
        'This staff member is linked to a user account -- edit their profile there instead',
      );
    }

    const departmentId =
      dto.department !== undefined ? await this.resolveDepartmentId(dto.department) : existing.departmentId;

    const staff = await this.prisma.staff.update({
      where: { id },
      data: {
        fullName: dto.fullName ?? existing.fullName,
        email: dto.email ?? existing.email,
        departmentId,
        isActive: dto.isActive ?? existing.isActive,
      },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'Staff',
      entityId: staff.id,
      metadata: { before: existing },
    });

    return toStaffResponse(staff);
  }

  /** Cascades to delete this staff member's shifts too -- see schema.prisma StaffShift.staff onDelete. */
  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.staff.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Staff member not found');
    }

    await this.prisma.staff.delete({ where: { id } });

    await this.auditLog.log({
      actorId,
      action: AuditAction.DELETE,
      entityType: 'Staff',
      entityId: id,
      metadata: { staffType: existing.staffType, fullName: existing.fullName },
    });
  }

  /** Departments are name-keyed across the app (see doctor provisioning in
   *  this same module's sibling) -- upsert rather than require a separate
   *  "manage departments" screen that doesn't exist anywhere else. */
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
