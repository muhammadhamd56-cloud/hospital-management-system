import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toClientStaffType } from '../staff-scheduling/staff.mapper';
import type { ClientStaffType } from '../staff-scheduling/dto/create-staff.dto';

export interface StaffPortalProfileResponse {
  staffId: string;
  /** Human-facing employee identifier -- the roster row's own id, since
   *  there's no separate employee-number sequence anywhere in this schema. */
  employeeId: string;
  staffType: ClientStaffType;
  fullName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  joinedAt: string;
  isActive: boolean;
}

/**
 * Thin self-service layer for the logged-in staff member (nurse, etc.).
 * Everything that already resolves ownership from userId internally
 * (ShiftApplicationsService, TasksService) is called directly by the
 * controller -- this service only covers what those don't: the read-only
 * profile view and "my shifts", which reuse ShiftsService/Staff lookups
 * scoped to the caller's own roster row.
 */
@Injectable()
export class StaffPortalService {
  constructor(private readonly prisma: PrismaService) {}

  async requireLinkedStaff(userId: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId } });

    if (!staff) {
      throw new NotFoundException('You are not on the staff roster yet -- ask an admin to add you');
    }

    return staff;
  }

  async getProfile(userId: string): Promise<StaffPortalProfileResponse> {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      include: { user: true, department: true },
    });

    if (!staff) {
      throw new NotFoundException('You are not on the staff roster yet -- ask an admin to add you');
    }

    return {
      staffId: staff.id,
      employeeId: staff.id,
      staffType: toClientStaffType(staff.staffType),
      fullName: staff.user ? `${staff.user.firstName} ${staff.user.lastName}`.trim() : staff.fullName,
      email: staff.user?.email ?? staff.email,
      phone: staff.user?.phone ?? null,
      department: staff.department?.name ?? null,
      joinedAt: (staff.user?.createdAt ?? staff.createdAt).toISOString(),
      isActive: staff.isActive,
    };
  }
}
