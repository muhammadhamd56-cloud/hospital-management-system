import { StaffType } from '@prisma/client';
import type { Department, Staff, User } from '@prisma/client';
import type { ClientStaffType } from './dto/create-staff.dto';

const CLIENT_TO_PRISMA_STAFF_TYPE: Record<ClientStaffType, StaffType> = {
  doctor: StaffType.DOCTOR,
  nurse: StaffType.NURSE,
  receptionist: StaffType.RECEPTIONIST,
  pharmacist: StaffType.PHARMACIST,
  lab_technician: StaffType.LAB_TECHNICIAN,
  other: StaffType.OTHER,
};

const PRISMA_TO_CLIENT_STAFF_TYPE: Record<StaffType, ClientStaffType> = {
  [StaffType.DOCTOR]: 'doctor',
  [StaffType.NURSE]: 'nurse',
  [StaffType.RECEPTIONIST]: 'receptionist',
  [StaffType.PHARMACIST]: 'pharmacist',
  [StaffType.LAB_TECHNICIAN]: 'lab_technician',
  [StaffType.OTHER]: 'other',
};

export function toClientStaffType(type: StaffType): ClientStaffType {
  return PRISMA_TO_CLIENT_STAFF_TYPE[type];
}

export function toPrismaStaffType(type: ClientStaffType): StaffType {
  return CLIENT_TO_PRISMA_STAFF_TYPE[type];
}

export interface StaffResponse {
  id: string;
  staffType: ClientStaffType;
  fullName: string;
  email: string | null;
  isActive: boolean;
  userId: string | null;
  department: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StaffWithUser = Staff & { user: User | null; department: Department | null };

/** fullName/email resolve from the linked User when one exists (Doctor,
 *  Lab Technician), else from the Staff row's own columns (name-only
 *  roster entries) -- callers never need to care which kind of row it is. */
export function toStaffResponse(staff: StaffWithUser): StaffResponse {
  return {
    id: staff.id,
    staffType: toClientStaffType(staff.staffType),
    fullName: staff.user ? `${staff.user.firstName} ${staff.user.lastName}`.trim() : staff.fullName,
    email: staff.user ? staff.user.email : staff.email,
    isActive: staff.isActive,
    userId: staff.userId,
    department: staff.department?.name ?? null,
    createdAt: staff.createdAt.toISOString(),
    updatedAt: staff.updatedAt.toISOString(),
  };
}
