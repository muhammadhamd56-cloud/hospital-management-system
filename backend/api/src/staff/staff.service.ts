import { ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashPassword } from '../auth/password.util';
import { toPrismaRole } from '../common/role.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffResponse, toStaffResponse } from './staff.mapper';

const STAFF_ROLES = [Role.DOCTOR, Role.STAFF];

export interface CreateStaffResult {
  staff: StaffResponse;
  /** Plaintext temp password -- returned exactly once for the admin to relay. Never stored or logged. */
  tempPassword: string;
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<StaffResponse[]> {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      orderBy: { createdAt: 'desc' },
    });

    return staff.map(toStaffResponse);
  }

  /**
   * Admin-provisions a staff account (doctor/staff
   * -- never admin or patient, see CreateStaffDto). Unlike self-signup, there's
   * no OTP step: the admin has already vetted this person, so the account is
   * created pre-verified with a server-generated temp password that must be
   * changed on first login (mustChangePassword) -- see UsersService.setPassword,
   * the same set-password flow Google-only accounts already use.
   */
  async create(dto: CreateStaffDto): Promise<CreateStaffResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const tempPassword = generateTempPassword();
    const password = await hashPassword(tempPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: toPrismaRole(dto.role),
          roleSelected: true,
          emailVerified: true,
          mustChangePassword: true,
        },
      });

      if (dto.role === 'doctor') {
        const department = await tx.department.upsert({
          where: { name: dto.department! },
          update: {},
          create: { name: dto.department! },
        });

        await tx.doctor.create({
          data: {
            specialization: dto.specialization!,
            departmentId: department.id,
            bio: dto.bio!,
            experienceYears: dto.experienceYears!,
            userId: user.id,
          },
        });
      }

      return user;
    });

    return { staff: toStaffResponse(user), tempPassword };
  }
}

/** 16-char URL-safe random temp password -- e.g. "kX9m2Qw_p7ZbN3aR". */
function generateTempPassword(): string {
  return randomBytes(12).toString('base64url');
}
