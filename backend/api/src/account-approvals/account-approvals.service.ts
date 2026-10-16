import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, AuditAction, NotificationType, Role, type User } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { toClientRole, type ClientRole } from '../common/role.mapper';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ReviewAccountDto } from './dto/review-account.dto';

/** Roles that grant access to patient data, so can't be self-granted. */
const ROLES_REQUIRING_APPROVAL: readonly Role[] = [Role.DOCTOR, Role.STAFF];

export function requiresApproval(role: Role): boolean {
  return ROLES_REQUIRING_APPROVAL.includes(role);
}

export interface AccountRequestResponse {
  id: string;
  fullName: string;
  email: string;
  role: ClientRole;
  status: 'pending' | 'approved' | 'rejected';
  /** Doctor applicants only: what they said they practise. */
  specialization: string | null;
  department: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  note: string | null;
}

type UserWithDoctor = User & {
  doctorProfile: { specialization: string; department: { name: string } } | null;
};

function toAccountRequestResponse(user: UserWithDoctor): AccountRequestResponse {
  return {
    id: user.id,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    role: toClientRole(user.role),
    status: user.approvalStatus.toLowerCase() as AccountRequestResponse['status'],
    specialization: user.doctorProfile?.specialization ?? null,
    department: user.doctorProfile?.department.name ?? null,
    requestedAt: user.createdAt.toISOString(),
    reviewedAt: user.approvalReviewedAt?.toISOString() ?? null,
    note: user.approvalNote,
  };
}

const DOCTOR_INCLUDE = {
  doctorProfile: { select: { specialization: true, department: { select: { name: true } } } },
} as const;

/**
 * Doctor and staff accounts that sign themselves up start PENDING (see
 * ApprovalStatus in schema.prisma) and can use nothing beyond their own
 * account until an admin reviews them here. Admin-created accounts and
 * patients never need review.
 */
@Injectable()
export class AccountApprovalsService {
  private readonly logger = new Logger(AccountApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Tells every admin a request is waiting. Called once the applicant has
   * proven their email (OTP verified, or a Google account), so throwaway
   * signups that never verify don't reach the queue.
   */
  async notifyAdminsOfRequest(user: Pick<User, 'firstName' | 'lastName' | 'role'>): Promise<void> {
    const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN }, select: { id: true } });
    const name = `${user.firstName} ${user.lastName}`.trim();
    const role = toClientRole(user.role);

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.create(
          admin.id,
          NotificationType.ACCOUNT_APPROVAL_REQUESTED,
          'New account awaiting approval',
          `${name} signed up as ${role === 'doctor' ? 'a doctor' : 'staff'} and needs approval.`,
          '/account-approvals',
        ),
      ),
    );
  }

  /** Doctor/staff accounts with verified email in the given state, newest first. */
  async list(status: 'pending' | 'rejected'): Promise<AccountRequestResponse[]> {
    const users = await this.prisma.user.findMany({
      where: {
        approvalStatus: status === 'pending' ? ApprovalStatus.PENDING : ApprovalStatus.REJECTED,
        role: { in: [...ROLES_REQUIRING_APPROVAL] },
        emailVerified: true,
      },
      include: DOCTOR_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return users.map(toAccountRequestResponse);
  }

  /**
   * Approves or rejects a request. A rejected request can later be approved
   * (an admin changing their mind); an approved account is not reopened
   * here. The write is conditional on the status the decision applies to,
   * so two admins reviewing at once can't both act.
   */
  async review(admin: AuthenticatedUser, userId: string, dto: ReviewAccountDto): Promise<AccountRequestResponse> {
    const approve = dto.decision === 'approve';
    const fromStatuses = approve ? [ApprovalStatus.PENDING, ApprovalStatus.REJECTED] : [ApprovalStatus.PENDING];

    const { count } = await this.prisma.user.updateMany({
      where: {
        id: userId,
        role: { in: [...ROLES_REQUIRING_APPROVAL] },
        emailVerified: true,
        approvalStatus: { in: fromStatuses },
      },
      data: {
        approvalStatus: approve ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
        approvalReviewedAt: new Date(),
        approvalNote: approve ? null : (dto.note?.trim() || null),
      },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: DOCTOR_INCLUDE });

    if (!user || !requiresApproval(user.role)) {
      throw new NotFoundException('Account request not found');
    }

    if (count === 0) {
      throw new BadRequestException(
        user.emailVerified
          ? `This account is already ${user.approvalStatus.toLowerCase()}`
          : "This applicant hasn't verified their email yet",
      );
    }

    await this.auditLogService.log({
      actorId: admin.id,
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: user.id,
      metadata: { approvalStatus: user.approvalStatus, note: user.approvalNote },
    });

    await this.notificationsService.create(
      user.id,
      approve ? NotificationType.ACCOUNT_APPROVED : NotificationType.ACCOUNT_REJECTED,
      approve ? 'Your account has been approved' : 'Your account request was not approved',
      approve
        ? 'An administrator approved your account. You now have full access.'
        : (user.approvalNote ?? 'An administrator reviewed your request and did not approve it.'),
      approve ? '/dashboard' : undefined,
    );

    // The applicant may not be signed in to see the in-app notice. Best effort.
    try {
      await this.emailService.sendAccountDecisionEmail(user.email, {
        firstName: user.firstName,
        approved: approve,
        note: user.approvalNote,
      });
    } catch (error) {
      this.logger.error(`Account decision email to ${user.email} failed: ${(error as Error).message}`);
    }

    return toAccountRequestResponse(user);
  }
}
