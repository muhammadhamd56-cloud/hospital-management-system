import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, EmergencyStatus, NotificationType, Role, StaffType } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AddEmergencyNoteDto } from './dto/add-emergency-note.dto';
import { AssignEmergencyDto } from './dto/assign-emergency.dto';
import { CancelEmergencyDto } from './dto/cancel-emergency.dto';
import { CreateEmergencyDto } from './dto/create-emergency.dto';
import { ListEmergenciesDto } from './dto/list-emergencies.dto';
import { ShareLocationDto } from './dto/share-location.dto';
import { UpdateEmergencyDetailsDto } from './dto/update-emergency-details.dto';
import { UpdateEmergencyPriorityDto } from './dto/update-emergency-priority.dto';
import { UpdateEmergencyStatusDto } from './dto/update-emergency-status.dto';
import {
  AssignableNurse,
  EmergencyCaseDetail,
  EmergencyCaseSummary,
  EmergencyCaseWithRelations,
  toAssignableNurse,
  toClientEmergencyStatus,
  toEmergencyCaseDetail,
  toEmergencyCaseSummary,
  toEmergencyTimeline,
  toPrismaEmergencyPriority,
  toPrismaEmergencyStatus,
  toPrismaEmergencyType,
} from './emergency.mapper';

const CASE_INCLUDE = {
  patient: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      dateOfBirth: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
    },
  },
  acknowledgedBy: { select: { firstName: true, lastName: true } },
  assignedDoctor: { include: { user: { select: { firstName: true, lastName: true } } } },
  assignedStaff: { include: { user: { select: { firstName: true, lastName: true } } } },
  assignedBy: { select: { firstName: true, lastName: true } },
  resolvedBy: { select: { firstName: true, lastName: true } },
} as const;

const CASE_INCLUDE_WITH_NOTES = {
  ...CASE_INCLUDE,
  notes: {
    include: { author: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

const ACTIVE_STATUSES: EmergencyStatus[] = [
  EmergencyStatus.NEW,
  EmergencyStatus.ACKNOWLEDGED,
  EmergencyStatus.TEAM_ASSIGNED,
  EmergencyStatus.RESPONDING,
  EmergencyStatus.ARRIVED,
];

/** Direct-status-PATCH transitions only -- reaching TEAM_ASSIGNED goes
 *  through assign(), and CANCELLED goes through cancel(), neither of which
 *  is a target of updateStatus(). */
const ALLOWED_STATUS_TRANSITIONS: Partial<Record<EmergencyStatus, EmergencyStatus[]>> = {
  [EmergencyStatus.NEW]: [EmergencyStatus.ACKNOWLEDGED],
  [EmergencyStatus.TEAM_ASSIGNED]: [EmergencyStatus.RESPONDING],
  [EmergencyStatus.RESPONDING]: [EmergencyStatus.ARRIVED],
  [EmergencyStatus.ARRIVED]: [EmergencyStatus.RESOLVED],
};

const PATIENT_STATUS_MESSAGE: Partial<Record<EmergencyStatus, string>> = {
  [EmergencyStatus.ACKNOWLEDGED]: 'Your emergency request has been acknowledged.',
  [EmergencyStatus.RESPONDING]: 'An emergency team is responding.',
  [EmergencyStatus.ARRIVED]: 'The emergency team has arrived.',
  [EmergencyStatus.RESOLVED]: 'Your emergency case has been resolved.',
};

const PATIENT_STATUS_NOTIFICATION_TYPE: Partial<Record<EmergencyStatus, NotificationType>> = {
  [EmergencyStatus.ACKNOWLEDGED]: NotificationType.EMERGENCY_ACKNOWLEDGED,
  [EmergencyStatus.RESPONDING]: NotificationType.EMERGENCY_STATUS_UPDATED,
  [EmergencyStatus.ARRIVED]: NotificationType.EMERGENCY_STATUS_UPDATED,
  [EmergencyStatus.RESOLVED]: NotificationType.EMERGENCY_RESOLVED,
};

@Injectable()
export class EmergencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Bare case created the instant the patient confirms -- type/description
   * are optional follow-ups added afterward via updateDetails(), never a
   * precondition for creating the case. See CreateEmergencyDto.
   */
  async create(caller: AuthenticatedUser, dto: CreateEmergencyDto): Promise<EmergencyCaseSummary> {
    const existingActive = await this.prisma.emergencyCase.findFirst({
      where: { patientId: caller.id, status: { in: ACTIVE_STATUSES } },
    });

    if (existingActive) {
      throw new ConflictException('You already have an active emergency request.');
    }

    const created = await this.prisma.emergencyCase.create({
      data: {
        patientId: caller.id,
        emergencyType: toPrismaEmergencyType(dto.emergencyType ?? 'other'),
        description: dto.description ?? null,
      },
      include: CASE_INCLUDE,
    });

    await this.auditLogService.log({
      actorId: caller.id,
      action: AuditAction.CREATE,
      entityType: 'EmergencyCase',
      entityId: created.id,
    });

    // Every ADMIN plus every NURSE-type STAFF -- the people who actually
    // staff the Emergency Center -- not every DOCTOR (too broad and noisy;
    // a doctor gets pulled in specifically via assign(), same as the rest of
    // this app scopes a doctor's visibility to patients they're actually
    // treating rather than broadcasting everything to everyone).
    const responders = await this.prisma.user.findMany({
      where: { OR: [{ role: Role.ADMIN }, { role: Role.STAFF, staffProfile: { staffType: StaffType.NURSE } }] },
      select: { id: true },
    });

    await Promise.all(
      responders.map((responder) =>
        this.notificationsService.create(
          responder.id,
          NotificationType.EMERGENCY_CREATED,
          'New emergency request',
          `A new hospital emergency request needs attention.`,
          `/emergency/cases/${created.id}`,
        ),
      ),
    );

    return toEmergencyCaseSummary(created as EmergencyCaseWithRelations);
  }

  /** The patient's optional "what kind of emergency is this?" follow-up. Never blocks create(). */
  async updateDetails(caller: AuthenticatedUser, id: string, dto: UpdateEmergencyDetailsDto): Promise<EmergencyCaseSummary> {
    const existing = await this.requireOwnCase(caller, id);

    const updated = await this.prisma.emergencyCase.update({
      where: { id },
      data: {
        emergencyType: toPrismaEmergencyType(dto.emergencyType),
        description: dto.description ?? existing.description,
      },
      include: CASE_INCLUDE,
    });

    return toEmergencyCaseSummary(updated as EmergencyCaseWithRelations);
  }

  /** The patient's optional, explicit, one-time location share. */
  async shareLocation(caller: AuthenticatedUser, id: string, dto: ShareLocationDto): Promise<EmergencyCaseSummary> {
    await this.requireOwnCase(caller, id);

    const updated = await this.prisma.emergencyCase.update({
      where: { id },
      data: { locationShared: true, locationLat: dto.lat, locationLng: dto.lng },
      include: CASE_INCLUDE,
    });

    await this.auditLogService.log({
      actorId: caller.id,
      action: AuditAction.UPDATE,
      entityType: 'EmergencyCase',
      entityId: id,
      metadata: { transition: 'location_shared' },
    });

    return toEmergencyCaseSummary(updated as EmergencyCaseWithRelations);
  }

  async listMine(caller: AuthenticatedUser): Promise<EmergencyCaseSummary[]> {
    const cases = await this.prisma.emergencyCase.findMany({
      where: { patientId: caller.id },
      include: CASE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    // Active case(s) first so the "you have an active request" banner has an
    // obvious one to link to, most-recent history after.
    const sorted = [...cases].sort((a, b) => {
      const aActive = ACTIVE_STATUSES.includes(a.status) ? 0 : 1;
      const bActive = ACTIVE_STATUSES.includes(b.status) ? 0 : 1;
      return aActive - bActive;
    });

    return sorted.map((c) => toEmergencyCaseSummary(c as EmergencyCaseWithRelations));
  }

  async listAll(caller: AuthenticatedUser, filters: ListEmergenciesDto): Promise<EmergencyCaseSummary[]> {
    await this.requireResponderAccess(caller);

    const cases = await this.prisma.emergencyCase.findMany({
      where: {
        status: filters.status ? toPrismaEmergencyStatus(filters.status) : undefined,
        priority: filters.priority ? toPrismaEmergencyPriority(filters.priority) : undefined,
        emergencyType: filters.emergencyType ? toPrismaEmergencyType(filters.emergencyType) : undefined,
        assignedStaffId: filters.assignedStaffId,
        assignedDoctorId: filters.assignedDoctorId,
      },
      include: CASE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return cases.map((c) => toEmergencyCaseSummary(c as EmergencyCaseWithRelations));
  }

  async findOne(caller: AuthenticatedUser, id: string): Promise<EmergencyCaseDetail> {
    const emergencyCase = await this.prisma.emergencyCase.findUnique({ where: { id }, include: CASE_INCLUDE_WITH_NOTES });

    if (!emergencyCase) {
      throw new NotFoundException('Emergency case not found');
    }

    const isOwner = emergencyCase.patientId === caller.id;
    const isResponder = await this.hasResponderAccess(caller);

    // A patient requesting someone else's case gets the same 404 an
    // unauthorized responder would -- never confirms the id exists.
    if (!isOwner && !isResponder) {
      throw new NotFoundException('Emergency case not found');
    }

    if (isResponder && emergencyCase.locationShared) {
      await this.auditLogService.log({
        actorId: caller.id,
        action: AuditAction.VIEW,
        entityType: 'EmergencyCase',
        entityId: id,
        metadata: { transition: 'location' },
      });
    }

    const logs = await this.auditLogService.findForEntity('EmergencyCase', id);

    return toEmergencyCaseDetail(emergencyCase as Parameters<typeof toEmergencyCaseDetail>[0], {
      includeLocation: isOwner || isResponder,
      includePatientContact: isResponder && !isOwner,
      timeline: toEmergencyTimeline(logs),
    });
  }

  async updateStatus(caller: AuthenticatedUser, id: string, dto: UpdateEmergencyStatusDto): Promise<EmergencyCaseSummary> {
    await this.requireResponderAccess(caller);

    const existing = await this.prisma.emergencyCase.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Emergency case not found');
    }

    const targetStatus = toPrismaEmergencyStatus(dto.status);
    const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status] ?? [];

    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot move an emergency case from ${toClientEmergencyStatus(existing.status)} to ${dto.status}.`,
      );
    }

    const now = new Date();
    const data: Record<string, unknown> = { status: targetStatus };

    if (targetStatus === EmergencyStatus.ACKNOWLEDGED) {
      data.acknowledgedById = caller.id;
      data.acknowledgedAt = now;
    } else if (targetStatus === EmergencyStatus.RESPONDING) {
      data.respondingAt = now;
    } else if (targetStatus === EmergencyStatus.ARRIVED) {
      data.arrivedAt = now;
    } else if (targetStatus === EmergencyStatus.RESOLVED) {
      data.resolvedById = caller.id;
      data.resolvedAt = now;
    }

    const updated = await this.prisma.emergencyCase.update({ where: { id }, data, include: CASE_INCLUDE });

    await this.auditLogService.log({
      actorId: caller.id,
      action: AuditAction.UPDATE,
      entityType: 'EmergencyCase',
      entityId: id,
      metadata: { transition: dto.status },
    });

    const message = PATIENT_STATUS_MESSAGE[targetStatus];
    const notificationType = PATIENT_STATUS_NOTIFICATION_TYPE[targetStatus];
    if (message && notificationType) {
      await this.notificationsService.create(
        existing.patientId,
        notificationType,
        'Emergency status update',
        message,
        `/emergency/cases/${id}`,
      );
    }

    return toEmergencyCaseSummary(updated as EmergencyCaseWithRelations);
  }

  /** Only ADMIN/DOCTOR assign a team, and only once the case has been
   *  acknowledged -- this is what actually advances it to TEAM_ASSIGNED. */
  async assign(caller: AuthenticatedUser, id: string, dto: AssignEmergencyDto): Promise<EmergencyCaseSummary> {
    this.requireAssignerAccess(caller);

    if (!dto.doctorId && !dto.staffId && !dto.teamName) {
      throw new BadRequestException('Assign at least a doctor, a nurse, or a team name.');
    }

    const existing = await this.prisma.emergencyCase.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Emergency case not found');
    }

    if (existing.status !== EmergencyStatus.ACKNOWLEDGED) {
      throw new BadRequestException('A team can only be assigned once the case has been acknowledged.');
    }

    if (dto.doctorId) {
      const doctor = await this.prisma.doctor.findUnique({ where: { id: dto.doctorId } });
      if (!doctor) {
        throw new BadRequestException('Doctor not found');
      }
    }

    let assignedStaffUserId: string | null = null;
    if (dto.staffId) {
      const staff = await this.prisma.staff.findUnique({ where: { id: dto.staffId } });
      if (!staff || staff.staffType !== StaffType.NURSE) {
        throw new BadRequestException('Only a nurse can be assigned to an emergency case.');
      }
      assignedStaffUserId = staff.userId;
    }

    const updated = await this.prisma.emergencyCase.update({
      where: { id },
      data: {
        status: EmergencyStatus.TEAM_ASSIGNED,
        assignedDoctorId: dto.doctorId ?? null,
        assignedStaffId: dto.staffId ?? null,
        assignedTeamName: dto.teamName ?? null,
        assignedById: caller.id,
        assignedAt: new Date(),
      },
      include: CASE_INCLUDE,
    });

    await this.auditLogService.log({
      actorId: caller.id,
      action: AuditAction.UPDATE,
      entityType: 'EmergencyCase',
      entityId: id,
      metadata: { transition: 'team_assigned', doctorId: dto.doctorId ?? null, staffId: dto.staffId ?? null, teamName: dto.teamName ?? null },
    });

    await this.notificationsService.create(
      existing.patientId,
      NotificationType.EMERGENCY_TEAM_ASSIGNED,
      'Emergency team assigned',
      'An emergency team has been assigned to your request.',
      `/emergency/cases/${id}`,
    );

    const notifyTargets = [updated.assignedDoctor?.userId, assignedStaffUserId].filter(
      (userId): userId is string => Boolean(userId),
    );

    await Promise.all(
      notifyTargets.map((userId) =>
        this.notificationsService.create(
          userId,
          NotificationType.EMERGENCY_TEAM_ASSIGNED,
          'Assigned to an emergency case',
          'You have been assigned to a hospital emergency case.',
          `/emergency/cases/${id}`,
        ),
      ),
    );

    return toEmergencyCaseSummary(updated as EmergencyCaseWithRelations);
  }

  async updatePriority(caller: AuthenticatedUser, id: string, dto: UpdateEmergencyPriorityDto): Promise<EmergencyCaseSummary> {
    this.requireAssignerAccess(caller);

    const existing = await this.prisma.emergencyCase.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Emergency case not found');
    }

    const updated = await this.prisma.emergencyCase.update({
      where: { id },
      data: { priority: toPrismaEmergencyPriority(dto.priority) },
      include: CASE_INCLUDE,
    });

    await this.auditLogService.log({
      actorId: caller.id,
      action: AuditAction.UPDATE,
      entityType: 'EmergencyCase',
      entityId: id,
      metadata: { transition: 'priority', priority: dto.priority },
    });

    return toEmergencyCaseSummary(updated as EmergencyCaseWithRelations);
  }

  async addNote(caller: AuthenticatedUser, id: string, dto: AddEmergencyNoteDto): Promise<EmergencyCaseDetail> {
    await this.requireResponderAccess(caller);

    const existing = await this.prisma.emergencyCase.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Emergency case not found');
    }

    await this.prisma.emergencyNote.create({ data: { caseId: id, authorId: caller.id, body: dto.body } });

    await this.auditLogService.log({
      actorId: caller.id,
      action: AuditAction.UPDATE,
      entityType: 'EmergencyCase',
      entityId: id,
      metadata: { transition: 'note' },
    });

    return this.findOne(caller, id);
  }

  /** The patient can cancel their own request while it's still early
   *  (NEW/ACKNOWLEDGED); an admin can stand it down at any active stage. */
  async cancel(caller: AuthenticatedUser, id: string, dto: CancelEmergencyDto): Promise<EmergencyCaseSummary> {
    const existing = await this.prisma.emergencyCase.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Emergency case not found');
    }

    const isOwner = existing.patientId === caller.id;

    if (!isOwner && caller.role !== Role.ADMIN) {
      throw new NotFoundException('Emergency case not found');
    }

    if (!ACTIVE_STATUSES.includes(existing.status)) {
      throw new BadRequestException('This case is no longer active.');
    }

    if (isOwner && caller.role === Role.PATIENT) {
      const patientCancellable: EmergencyStatus[] = [EmergencyStatus.NEW, EmergencyStatus.ACKNOWLEDGED];
      if (!patientCancellable.includes(existing.status)) {
        throw new BadRequestException('This request can no longer be cancelled -- a team is already responding.');
      }
    }

    const updated = await this.prisma.emergencyCase.update({
      where: { id },
      data: { status: EmergencyStatus.CANCELLED, cancelledAt: new Date(), cancelReason: dto.reason ?? null },
      include: CASE_INCLUDE,
    });

    await this.auditLogService.log({
      actorId: caller.id,
      action: AuditAction.UPDATE,
      entityType: 'EmergencyCase',
      entityId: id,
      metadata: { transition: 'cancelled', reason: dto.reason ?? null },
    });

    if (!isOwner) {
      await this.notificationsService.create(
        existing.patientId,
        NotificationType.EMERGENCY_CANCELLED,
        'Emergency request cancelled',
        'Your emergency request has been cancelled.',
        `/emergency/cases/${id}`,
      );
    }

    return toEmergencyCaseSummary(updated as EmergencyCaseWithRelations);
  }

  /** Backs the "Assign Team" nurse dropdown -- ADMIN/DOCTOR only (same
   *  gate as assign() itself), since GET /staff is admin-only and a doctor
   *  still needs to see nurses to assign one. */
  async listAssignableNurses(caller: AuthenticatedUser): Promise<AssignableNurse[]> {
    this.requireAssignerAccess(caller);

    const nurses = await this.prisma.staff.findMany({
      where: { staffType: StaffType.NURSE, isActive: true },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { fullName: 'asc' },
    });

    return nurses.map(toAssignableNurse);
  }

  async analytics(caller: AuthenticatedUser): Promise<{
    totalCases: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    avgAcknowledgeSeconds: number | null;
    avgAssignSeconds: number | null;
    avgResponseSeconds: number | null;
    avgResolutionSeconds: number | null;
    volumeByDay: { date: string; count: number }[];
  }> {
    if (caller.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can view emergency analytics');
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const cases = await this.prisma.emergencyCase.findMany({
      where: { createdAt: { gte: since } },
      select: {
        status: true,
        priority: true,
        emergencyType: true,
        createdAt: true,
        acknowledgedAt: true,
        assignedAt: true,
        respondingAt: true,
        resolvedAt: true,
      },
    });

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const volumeMap = new Map<string, number>();

    const ackDurations: number[] = [];
    const assignDurations: number[] = [];
    const responseDurations: number[] = [];
    const resolutionDurations: number[] = [];

    for (const c of cases) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      byPriority[c.priority] = (byPriority[c.priority] ?? 0) + 1;
      byType[c.emergencyType] = (byType[c.emergencyType] ?? 0) + 1;

      const day = c.createdAt.toISOString().slice(0, 10);
      volumeMap.set(day, (volumeMap.get(day) ?? 0) + 1);

      if (c.acknowledgedAt) {
        ackDurations.push((c.acknowledgedAt.getTime() - c.createdAt.getTime()) / 1000);
      }
      if (c.acknowledgedAt && c.assignedAt) {
        assignDurations.push((c.assignedAt.getTime() - c.acknowledgedAt.getTime()) / 1000);
      }
      if (c.assignedAt && c.respondingAt) {
        responseDurations.push((c.respondingAt.getTime() - c.assignedAt.getTime()) / 1000);
      }
      if (c.resolvedAt) {
        resolutionDurations.push((c.resolvedAt.getTime() - c.createdAt.getTime()) / 1000);
      }
    }

    function average(values: number[]): number | null {
      if (values.length === 0) return null;
      return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
    }

    return {
      totalCases: cases.length,
      byStatus,
      byPriority,
      byType,
      avgAcknowledgeSeconds: average(ackDurations),
      avgAssignSeconds: average(assignDurations),
      avgResponseSeconds: average(responseDurations),
      avgResolutionSeconds: average(resolutionDurations),
      volumeByDay: [...volumeMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    };
  }

  /** ADMIN/DOCTOR always qualify as responders; a STAFF caller only if their
   *  linked roster row is specifically a nurse -- same shape as
   *  LaboratoryService.requireLabAccess. */
  private async requireResponderAccess(caller: AuthenticatedUser): Promise<void> {
    if (await this.hasResponderAccess(caller)) {
      return;
    }
    throw new ForbiddenException('Only emergency-response staff can access this');
  }

  private async hasResponderAccess(caller: AuthenticatedUser): Promise<boolean> {
    if (caller.role === Role.ADMIN || caller.role === Role.DOCTOR) {
      return true;
    }
    if (caller.role !== Role.STAFF) {
      return false;
    }
    const staff = await this.prisma.staff.findUnique({ where: { userId: caller.id } });
    return staff?.staffType === StaffType.NURSE;
  }

  /** Assigning a team and reprioritizing are deliberately narrower than
   *  general responder access -- a nurse can acknowledge/update/note a case
   *  but not redirect who's responsible for it. */
  private requireAssignerAccess(caller: AuthenticatedUser): void {
    if (caller.role !== Role.ADMIN && caller.role !== Role.DOCTOR) {
      throw new ForbiddenException('Only an admin or doctor can assign or reprioritize an emergency case');
    }
  }

  private async requireOwnCase(caller: AuthenticatedUser, id: string) {
    const existing = await this.prisma.emergencyCase.findUnique({ where: { id } });

    if (!existing || existing.patientId !== caller.id) {
      throw new NotFoundException('Emergency case not found');
    }

    return existing;
  }
}
