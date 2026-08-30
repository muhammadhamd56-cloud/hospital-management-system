import type { Department, ShiftOpening } from '@prisma/client';
import { toClientShiftType } from './shifts.mapper';
import { toClientStaffType } from './staff.mapper';
import type { ClientShiftType } from './dto/create-shift.dto';
import type { ClientStaffType } from './dto/create-staff.dto';

export type ClientApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface ShiftOpeningResponse {
  id: string;
  requiredStaffType: ClientStaffType;
  department: string | null;
  date: string;
  startTime: string;
  endTime: string;
  shiftType: ClientShiftType;
  positions: number;
  /** Count of currently-APPROVED applications -- derived, not stored, so it
   *  can never drift out of sync with the applications themselves. */
  approvedCount: number;
  applicationDeadline: string;
  notes: string | null;
  isOpen: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only populated when a specific staff member's own application status
   *  is relevant (the staff-portal "available shifts" list) -- undefined in
   *  the admin-wide list, null when that staff member hasn't applied. */
  myApplicationStatus?: ClientApplicationStatus | null;
}

export type ShiftOpeningWithDepartment = ShiftOpening & {
  department: Department | null;
  applications?: { status: string; staffId: string }[];
};

export function toShiftOpeningResponse(
  opening: ShiftOpeningWithDepartment,
  viewerStaffId?: string,
): ShiftOpeningResponse {
  const applications = opening.applications ?? [];
  const approvedCount = applications.filter((application) => application.status === 'APPROVED').length;
  const mine = viewerStaffId ? applications.find((application) => application.staffId === viewerStaffId) : undefined;

  return {
    id: opening.id,
    requiredStaffType: toClientStaffType(opening.requiredStaffType),
    department: opening.department?.name ?? null,
    date: opening.date.toISOString(),
    startTime: opening.startTime.toISOString(),
    endTime: opening.endTime.toISOString(),
    shiftType: toClientShiftType(opening.shiftType),
    positions: opening.positions,
    approvedCount,
    applicationDeadline: opening.applicationDeadline.toISOString(),
    notes: opening.notes,
    isOpen: opening.isOpen,
    createdById: opening.createdById,
    createdAt: opening.createdAt.toISOString(),
    updatedAt: opening.updatedAt.toISOString(),
    myApplicationStatus: viewerStaffId
      ? ((mine?.status.toLowerCase() as ClientApplicationStatus | undefined) ?? null)
      : undefined,
  };
}
