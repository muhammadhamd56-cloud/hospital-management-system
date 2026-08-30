import { ShiftStatus, ShiftType } from '@prisma/client';
import type { Department, StaffShift } from '@prisma/client';
import type { ClientShiftStatus, ClientShiftType } from './dto/create-shift.dto';
import { StaffResponse, StaffWithUser, toStaffResponse } from './staff.mapper';

const CLIENT_TO_PRISMA_SHIFT_TYPE: Record<ClientShiftType, ShiftType> = {
  morning: ShiftType.MORNING,
  evening: ShiftType.EVENING,
  night: ShiftType.NIGHT,
  custom: ShiftType.CUSTOM,
};

const PRISMA_TO_CLIENT_SHIFT_TYPE: Record<ShiftType, ClientShiftType> = {
  [ShiftType.MORNING]: 'morning',
  [ShiftType.EVENING]: 'evening',
  [ShiftType.NIGHT]: 'night',
  [ShiftType.CUSTOM]: 'custom',
};

const CLIENT_TO_PRISMA_SHIFT_STATUS: Record<ClientShiftStatus, ShiftStatus> = {
  scheduled: ShiftStatus.SCHEDULED,
  confirmed: ShiftStatus.CONFIRMED,
  in_progress: ShiftStatus.IN_PROGRESS,
  completed: ShiftStatus.COMPLETED,
  cancelled: ShiftStatus.CANCELLED,
  absent: ShiftStatus.ABSENT,
};

const PRISMA_TO_CLIENT_SHIFT_STATUS: Record<ShiftStatus, ClientShiftStatus> = {
  [ShiftStatus.SCHEDULED]: 'scheduled',
  [ShiftStatus.CONFIRMED]: 'confirmed',
  [ShiftStatus.IN_PROGRESS]: 'in_progress',
  [ShiftStatus.COMPLETED]: 'completed',
  [ShiftStatus.CANCELLED]: 'cancelled',
  [ShiftStatus.ABSENT]: 'absent',
};

export function toClientShiftType(type: ShiftType): ClientShiftType {
  return PRISMA_TO_CLIENT_SHIFT_TYPE[type];
}

export function toPrismaShiftType(type: ClientShiftType): ShiftType {
  return CLIENT_TO_PRISMA_SHIFT_TYPE[type];
}

export function toClientShiftStatus(status: ShiftStatus): ClientShiftStatus {
  return PRISMA_TO_CLIENT_SHIFT_STATUS[status];
}

export function toPrismaShiftStatus(status: ClientShiftStatus): ShiftStatus {
  return CLIENT_TO_PRISMA_SHIFT_STATUS[status];
}

export interface ShiftResponse {
  id: string;
  staff: StaffResponse;
  department: string | null;
  date: string;
  startTime: string;
  endTime: string;
  shiftType: ClientShiftType;
  status: ClientShiftStatus;
  notes: string | null;
  groupId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ShiftWithStaff = StaffShift & { staff: StaffWithUser; department: Department | null };

export function toShiftResponse(shift: ShiftWithStaff): ShiftResponse {
  return {
    id: shift.id,
    staff: toStaffResponse(shift.staff),
    department: shift.department?.name ?? null,
    date: shift.date.toISOString(),
    startTime: shift.startTime.toISOString(),
    endTime: shift.endTime.toISOString(),
    shiftType: toClientShiftType(shift.shiftType),
    status: toClientShiftStatus(shift.status),
    notes: shift.notes,
    groupId: shift.groupId,
    createdById: shift.createdById,
    createdAt: shift.createdAt.toISOString(),
    updatedAt: shift.updatedAt.toISOString(),
  };
}
