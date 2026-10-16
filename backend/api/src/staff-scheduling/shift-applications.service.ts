import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, AuditAction, NotificationType } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftsService } from './shifts.service';
import { ApplyShiftDto } from './dto/apply-shift.dto';
import { RespondShiftApplicationDto } from './dto/respond-shift-application.dto';
import {
  ShiftApplicationResponse,
  ShiftApplicationWithRelations,
  toShiftApplicationResponse,
} from './shift-applications.mapper';

const INCLUDE = {
  opening: { include: { department: true, applications: { select: { status: true, staffId: true } } } },
  staff: { include: { user: true, department: true } },
} as const;

export interface ShiftApplicationFilters {
  openingId?: string;
  staffId?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'withdrawn';
}

const CLIENT_TO_PRISMA_STATUS: Record<string, ApplicationStatus> = {
  pending: ApplicationStatus.PENDING,
  approved: ApplicationStatus.APPROVED,
  rejected: ApplicationStatus.REJECTED,
  withdrawn: ApplicationStatus.WITHDRAWN,
};

@Injectable()
export class ShiftApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly shiftsService: ShiftsService,
  ) {}

  private async requireLinkedStaff(userId: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId } });

    if (!staff) {
      throw new NotFoundException('You are not on the staff roster yet -- ask an admin to add you');
    }

    return staff;
  }

  // ---------- self-service (nurse/staff) ----------

  async listMine(userId: string): Promise<ShiftApplicationResponse[]> {
    const staff = await this.requireLinkedStaff(userId);

    const applications = await this.prisma.shiftApplication.findMany({
      where: { staffId: staff.id },
      include: INCLUDE,
      orderBy: { appliedAt: 'desc' },
    });

    return applications.map(toShiftApplicationResponse);
  }

  async apply(userId: string, openingId: string, dto: ApplyShiftDto): Promise<ShiftApplicationResponse> {
    const staff = await this.requireLinkedStaff(userId);

    if (!staff.isActive) {
      throw new ForbiddenException('Your account is not active for scheduling');
    }

    const opening = await this.prisma.shiftOpening.findUnique({
      where: { id: openingId },
      include: { applications: { select: { status: true } } },
    });

    if (!opening) {
      throw new NotFoundException('This shift is no longer available');
    }

    if (!opening.isOpen) {
      throw new BadRequestException('Applications for this shift are closed');
    }

    if (opening.applicationDeadline.getTime() < Date.now()) {
      throw new BadRequestException('The application deadline for this shift has passed');
    }

    if (opening.requiredStaffType !== staff.staffType) {
      throw new ForbiddenException('This shift is not open to your staff role');
    }

    const approvedCount = opening.applications.filter((application) => application.status === 'APPROVED').length;
    if (approvedCount >= opening.positions) {
      throw new BadRequestException('This shift is full');
    }

    const existing = await this.prisma.shiftApplication.findUnique({
      where: { openingId_staffId: { openingId, staffId: staff.id } },
    });

    if (existing) {
      throw new ConflictException("You've already applied to this shift");
    }

    // Same conflict/leave/availability check a direct admin assignment
    // would run -- rejected here, before an application is even created,
    // so a nurse never wastes time applying to something that could never
    // be approved.
    const localStartMinutes = opening.startTime.getUTCHours() * 60 + opening.startTime.getUTCMinutes();
    await this.shiftsService.assertNoSchedulingConflict({
      staffId: staff.id,
      startTime: opening.startTime,
      endTime: opening.endTime,
      date: opening.date,
      localStartMinutes,
    });

    const application = await this.prisma.shiftApplication.create({
      data: { openingId, staffId: staff.id, message: dto.message },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId: userId,
      action: AuditAction.CREATE,
      entityType: 'ShiftApplication',
      entityId: application.id,
      metadata: { openingId, staffId: staff.id },
    });

    return toShiftApplicationResponse(application);
  }

  async withdraw(userId: string, applicationId: string): Promise<ShiftApplicationResponse> {
    const staff = await this.requireLinkedStaff(userId);
    const application = await this.prisma.shiftApplication.findUnique({ where: { id: applicationId } });

    if (!application || application.staffId !== staff.id) {
      throw new NotFoundException('Application not found');
    }

    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException('Only a pending application can be withdrawn');
    }

    const updated = await this.prisma.shiftApplication.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.WITHDRAWN, respondedAt: new Date() },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId: userId,
      action: AuditAction.UPDATE,
      entityType: 'ShiftApplication',
      entityId: applicationId,
      metadata: { status: 'WITHDRAWN' },
    });

    return toShiftApplicationResponse(updated);
  }

  // ---------- admin ----------

  async listAll(filters: ShiftApplicationFilters = {}): Promise<ShiftApplicationResponse[]> {
    const applications = await this.prisma.shiftApplication.findMany({
      where: {
        openingId: filters.openingId,
        staffId: filters.staffId,
        status: filters.status ? CLIENT_TO_PRISMA_STATUS[filters.status] : undefined,
      },
      include: INCLUDE,
      orderBy: { appliedAt: 'desc' },
    });

    return applications.map(toShiftApplicationResponse);
  }

  async respond(id: string, dto: RespondShiftApplicationDto, actorId: string): Promise<ShiftApplicationResponse> {
    const application = await this.prisma.shiftApplication.findUnique({
      where: { id },
      include: {
        ...INCLUDE,
        opening: { include: { department: true } },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException('This application has already been responded to');
    }

    if (dto.decision === 'reject') {
      const updated = await this.prisma.shiftApplication.update({
        where: { id },
        data: {
          status: ApplicationStatus.REJECTED,
          adminNotes: dto.adminNotes,
          respondedById: actorId,
          respondedAt: new Date(),
        },
        include: INCLUDE,
      });

      await this.auditLog.log({
        actorId,
        action: AuditAction.UPDATE,
        entityType: 'ShiftApplication',
        entityId: id,
        metadata: { status: 'REJECTED', adminNotes: dto.adminNotes },
      });

      if (application.staff.userId) {
        await this.notifications.create(
          application.staff.userId,
          NotificationType.SHIFT_APPLICATION_REJECTED,
          'Shift application rejected',
          `Your application for the ${formatOpeningLabel(application.opening)} shift was not approved.`,
          '/available-shifts',
        );
      }

      return toShiftApplicationResponse(updated);
    }

    // Claim the position first, under a row lock on the opening: the
    // capacity re-check, marking this application APPROVED and auto-closing
    // a now-full opening all happen while no other approval for the same
    // opening can run. Without the lock, two admins (or a double-click)
    // approving the last slot at once could both pass the count check.
    const { freshOpening, closedOpening } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ShiftOpening" WHERE id = ${application.openingId} FOR UPDATE`;
      const freshOpening = await tx.shiftOpening.findUniqueOrThrow({
        where: { id: application.openingId },
        include: { applications: { select: { status: true } } },
      });
      const approvedCount = freshOpening.applications.filter((a) => a.status === 'APPROVED').length;

      if (!freshOpening.isOpen) {
        throw new BadRequestException('This opening has been closed');
      }

      if (approvedCount >= freshOpening.positions) {
        throw new BadRequestException('This shift is already full');
      }

      const claimed = await tx.shiftApplication.updateMany({
        where: { id, status: ApplicationStatus.PENDING },
        data: {
          status: ApplicationStatus.APPROVED,
          adminNotes: dto.adminNotes,
          respondedById: actorId,
          respondedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        throw new BadRequestException('This application has already been responded to');
      }

      // Auto-close once the last position is filled -- a clear signal to the
      // admin without them having to check the count themselves.
      const closedOpening = approvedCount + 1 >= freshOpening.positions;
      if (closedOpening) {
        await tx.shiftOpening.update({ where: { id: freshOpening.id }, data: { isOpen: false } });
      }

      return { freshOpening, closedOpening };
    });

    let shift: Awaited<ReturnType<ShiftsService['assignFromOpening']>>;
    try {
      shift = await this.shiftsService.assignFromOpening({
        staffId: application.staffId,
        departmentId: freshOpening.departmentId,
        date: freshOpening.date,
        startTime: freshOpening.startTime,
        endTime: freshOpening.endTime,
        shiftType: freshOpening.shiftType,
        createdById: actorId,
        notes: application.message ?? undefined,
        notify: false,
      });
    } catch (error) {
      // The shift couldn't be created (e.g. it now clashes with another shift
      // for this staff member) -- give the position back.
      await this.prisma.$transaction([
        this.prisma.shiftApplication.update({
          where: { id },
          data: { status: ApplicationStatus.PENDING, adminNotes: application.adminNotes, respondedById: null, respondedAt: null },
        }),
        ...(closedOpening
          ? [this.prisma.shiftOpening.update({ where: { id: freshOpening.id }, data: { isOpen: true } })]
          : []),
      ]);
      throw error;
    }

    const updated = await this.prisma.shiftApplication.update({
      where: { id },
      data: { resultingShiftId: shift.id },
      include: INCLUDE,
    });


    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'ShiftApplication',
      entityId: id,
      metadata: { status: 'APPROVED', resultingShiftId: shift.id },
    });

    if (application.staff.userId) {
      await this.notifications.create(
        application.staff.userId,
        NotificationType.SHIFT_APPLICATION_APPROVED,
        'Shift application approved',
        `You're scheduled for the ${formatOpeningLabel(application.opening)} shift.`,
        `/my-shifts?shiftId=${shift.id}`,
      );
    }

    return toShiftApplicationResponse(updated as unknown as ShiftApplicationWithRelations);
  }
}

function formatOpeningLabel(opening: { date: Date; department: { name: string } | null }): string {
  const date = opening.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  return opening.department ? `${opening.department.name} · ${date}` : date;
}
