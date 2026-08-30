import type { ShiftApplication } from '@prisma/client';
import { toShiftOpeningResponse, type ClientApplicationStatus, type ShiftOpeningWithDepartment } from './shift-openings.mapper';
import { toStaffResponse, type StaffResponse, type StaffWithUser } from './staff.mapper';

const PRISMA_TO_CLIENT_STATUS: Record<ShiftApplication['status'], ClientApplicationStatus> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
};

export function toClientApplicationStatus(status: ShiftApplication['status']): ClientApplicationStatus {
  return PRISMA_TO_CLIENT_STATUS[status];
}

export interface ShiftApplicationResponse {
  id: string;
  opening: ReturnType<typeof toShiftOpeningResponse>;
  staff: StaffResponse;
  status: ClientApplicationStatus;
  message: string | null;
  adminNotes: string | null;
  respondedById: string | null;
  respondedAt: string | null;
  resultingShiftId: string | null;
  appliedAt: string;
  updatedAt: string;
}

export type ShiftApplicationWithRelations = ShiftApplication & {
  opening: ShiftOpeningWithDepartment;
  staff: StaffWithUser;
};

export function toShiftApplicationResponse(application: ShiftApplicationWithRelations): ShiftApplicationResponse {
  return {
    id: application.id,
    opening: toShiftOpeningResponse(application.opening),
    staff: toStaffResponse(application.staff),
    status: toClientApplicationStatus(application.status),
    message: application.message,
    adminNotes: application.adminNotes,
    respondedById: application.respondedById,
    respondedAt: application.respondedAt?.toISOString() ?? null,
    resultingShiftId: application.resultingShiftId,
    appliedAt: application.appliedAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}
