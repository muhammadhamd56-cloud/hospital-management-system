import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { BedStatus, type User } from '@prisma/client';
import { hashPassword, verifyPassword } from '../auth/password.util';
import { ClientRole, toPrismaRole } from '../common/role.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { SetPasswordDto } from './dto/set-password.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
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

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: toPrismaRole(role), roleSelected: true },
    });
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

    return this.prisma.user.update({
      where: { id: userId },
      data: { password, mustChangePassword: false },
    });
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
