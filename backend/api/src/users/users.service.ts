import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApprovalStatus, BedStatus, type User } from '@prisma/client';
import { AccountApprovalsService, requiresApproval } from '../account-approvals/account-approvals.service';
import { hashPassword, verifyPassword } from '../auth/password.util';
import { AUTH_AUDIT_EVENTS, AuthAuditService } from '../auth/auth-audit.service';
import { ClientRole, toPrismaRole } from '../common/role.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { SetPasswordDto } from './dto/set-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountApprovalsService: AccountApprovalsService,
    private readonly authAudit: AuthAuditService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /** Updates the caller's own basic profile fields. Any field omitted from the DTO is left unchanged. */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    await this.findById(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone === '' ? null : dto.phone }),
        ...(dto.dateOfBirth !== undefined && {
          dateOfBirth: dto.dateOfBirth === '' ? null : new Date(dto.dateOfBirth),
        }),
        ...(dto.gender !== undefined && { gender: dto.gender === '' ? null : dto.gender }),
        ...(dto.address !== undefined && { address: dto.address === '' ? null : dto.address }),
        ...(dto.emergencyContactName !== undefined && {
          emergencyContactName: dto.emergencyContactName === '' ? null : dto.emergencyContactName,
        }),
        ...(dto.emergencyContactPhone !== undefined && {
          emergencyContactPhone: dto.emergencyContactPhone === '' ? null : dto.emergencyContactPhone,
        }),
      },
    });
  }

  /**
   * One-time self-service role pick, for the post-signup "how will you use
   * this?" screen. Google OAuth has no way to collect a role up front, so
   * every new user starts as PATIENT with roleSelected=false. Once set, this
   * throws rather than allowing another call — otherwise any authenticated
   * user could self-promote to ADMIN at will. Changing an already-set role
   * requires a direct DB edit until an admin-management endpoint exists.
   */
  async selectRole(userId: string, role: ClientRole): Promise<User> {
    if (role === 'admin') {
      throw new ForbiddenException('Admin accounts cannot be self-assigned');
    }

    const user = await this.findById(userId);

    if (user.roleSelected) {
      throw new ForbiddenException('Your role has already been set for this account');
    }

    // Doctor/staff roles open up patient data, so picking one needs an admin's
    // approval. Google has already verified the email, so the request goes
    // to the admins' queue straight away.
    const needsApproval = requiresApproval(toPrismaRole(role));
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: toPrismaRole(role),
        roleSelected: true,
        approvalStatus: needsApproval ? ApprovalStatus.PENDING : ApprovalStatus.APPROVED,
      },
    });

    if (needsApproval) {
      await this.accountApprovalsService.notifyAdminsOfRequest(updated);
    }

    return updated;
  }

  /**
   * Sets (Google-only accounts) or changes (existing local accounts) the
   * account's password. Google-only accounts have no password to confirm
   * against, so `currentPassword` is only required when one already exists
   * — otherwise a stolen short-lived JWT could permanently lock out the
   * real owner of an account that already has a password.
   */
  async setPassword(userId: string, dto: SetPasswordDto): Promise<User> {
    const user = await this.findById(userId);

    if (user.password) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required');
      }

      const isValid = await verifyPassword(dto.currentPassword, user.password);

      if (!isValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    const password = await hashPassword(dto.newPassword);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password,
        mustChangePassword: false,
        // Setting a new password is itself proof of control of the account
        // (either the current password or a fresh admin temp password) --
        // clear any login lockout so a just-changed password isn't
        // immediately unusable. See AuthService.resetPassword for the same
        // reasoning on the forgot-password path.
        failedLoginAttempts: 0,
        lockedUntil: null,
        // Sign out every other session (e.g. a stolen refresh cookie); the
        // controller re-issues cookies for the caller's own session.
        tokenVersion: { increment: 1 },
      },
    });

    await this.authAudit.record(user.password ? AUTH_AUDIT_EVENTS.PASSWORD_CHANGED : AUTH_AUDIT_EVENTS.PASSWORD_SET, {
      actorId: userId,
      userId,
      // True when an admin-issued temporary password forced this change.
      metadata: { required: user.mustChangePassword },
    });

    return updated;
  }

  /**
   * Permanently deletes the account and everything that hangs off it —
   * doctor profile, appointments, chat messages, invoices all cascade via
   * `onDelete: Cascade` in schema.prisma. Bed assignment is `onDelete:
   * SetNull` instead (a bed should outlive the patient), but that only
   * clears `patientId` — it would leave `status` stuck at OCCUPIED with no
   * patient, silently hiding an available bed. Release it explicitly first.
   * Irreversible; the frontend confirms before calling this.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.findById(userId);

    await this.prisma.$transaction([
      this.prisma.bed.updateMany({
        where: { patientId: userId, status: BedStatus.OCCUPIED },
        data: { status: BedStatus.AVAILABLE, patientId: null },
      }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
  }
}
