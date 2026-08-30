import { AttendanceStatus } from '@prisma/client';
import type { Attendance } from '@prisma/client';
import type { ClientAttendanceStatus } from './dto/create-attendance.dto';

const CLIENT_TO_PRISMA: Record<ClientAttendanceStatus, AttendanceStatus> = {
  scheduled: AttendanceStatus.SCHEDULED,
  present: AttendanceStatus.PRESENT,
  late: AttendanceStatus.LATE,
  absent: AttendanceStatus.ABSENT,
  leave: AttendanceStatus.LEAVE,
};

const PRISMA_TO_CLIENT: Record<AttendanceStatus, ClientAttendanceStatus> = {
  [AttendanceStatus.SCHEDULED]: 'scheduled',
  [AttendanceStatus.PRESENT]: 'present',
  [AttendanceStatus.LATE]: 'late',
  [AttendanceStatus.ABSENT]: 'absent',
  [AttendanceStatus.LEAVE]: 'leave',
};

export function toClientAttendanceStatus(status: AttendanceStatus): ClientAttendanceStatus {
  return PRISMA_TO_CLIENT[status];
}

export function toPrismaAttendanceStatus(status: ClientAttendanceStatus): AttendanceStatus {
  return CLIENT_TO_PRISMA[status];
}

export interface AttendanceResponse {
  id: string;
  shiftId: string;
  staffId: string;
  status: ClientAttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toAttendanceResponse(row: Attendance): AttendanceResponse {
  return {
    id: row.id,
    shiftId: row.shiftId,
    staffId: row.staffId,
    status: toClientAttendanceStatus(row.status),
    checkIn: row.checkIn ? row.checkIn.toISOString() : null,
    checkOut: row.checkOut ? row.checkOut.toISOString() : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
