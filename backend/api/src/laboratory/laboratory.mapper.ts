import { LabTestCategory, LabTestStatus } from '@prisma/client';
import type { Department, Doctor, LabTest, User } from '@prisma/client';

export type ClientLabTestCategory = 'Hematology' | 'Biochemistry' | 'Microbiology' | 'Radiology' | 'Pathology';
export type ClientLabTestStatus = 'pending' | 'in-progress' | 'completed';

const CATEGORY_TO_PRISMA: Record<ClientLabTestCategory, LabTestCategory> = {
  Hematology: LabTestCategory.HEMATOLOGY,
  Biochemistry: LabTestCategory.BIOCHEMISTRY,
  Microbiology: LabTestCategory.MICROBIOLOGY,
  Radiology: LabTestCategory.RADIOLOGY,
  Pathology: LabTestCategory.PATHOLOGY,
};

const CATEGORY_TO_CLIENT: Record<LabTestCategory, ClientLabTestCategory> = {
  [LabTestCategory.HEMATOLOGY]: 'Hematology',
  [LabTestCategory.BIOCHEMISTRY]: 'Biochemistry',
  [LabTestCategory.MICROBIOLOGY]: 'Microbiology',
  [LabTestCategory.RADIOLOGY]: 'Radiology',
  [LabTestCategory.PATHOLOGY]: 'Pathology',
};

export function toPrismaCategory(category: ClientLabTestCategory): LabTestCategory {
  return CATEGORY_TO_PRISMA[category];
}

export function toClientCategory(category: LabTestCategory): ClientLabTestCategory {
  return CATEGORY_TO_CLIENT[category];
}

const STATUS_TO_PRISMA: Record<ClientLabTestStatus, LabTestStatus> = {
  pending: LabTestStatus.PENDING,
  'in-progress': LabTestStatus.IN_PROGRESS,
  completed: LabTestStatus.COMPLETED,
};

const STATUS_TO_CLIENT: Record<LabTestStatus, ClientLabTestStatus> = {
  [LabTestStatus.PENDING]: 'pending',
  [LabTestStatus.IN_PROGRESS]: 'in-progress',
  [LabTestStatus.COMPLETED]: 'completed',
};

export function toPrismaLabTestStatus(status: ClientLabTestStatus): LabTestStatus {
  return STATUS_TO_PRISMA[status];
}

export function toClientLabTestStatus(status: LabTestStatus): ClientLabTestStatus {
  return STATUS_TO_CLIENT[status];
}

export type LabTestWithRelations = LabTest & {
  patient: Pick<User, 'firstName' | 'lastName'>;
  doctor: Doctor & { user: Pick<User, 'firstName' | 'lastName'>; department: Pick<Department, 'name'> };
  assignedTo: Pick<User, 'firstName' | 'lastName'> | null;
};

export interface LabTestResponse {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  department: string;
  assignedToId: string | null;
  assignedToName: string | null;
  testName: string;
  category: ClientLabTestCategory;
  status: ClientLabTestStatus;
  resultSummary: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export function toLabTestResponse(labTest: LabTestWithRelations): LabTestResponse {
  return {
    id: labTest.id,
    patientId: labTest.patientId,
    patientName: `${labTest.patient.firstName} ${labTest.patient.lastName}`.trim(),
    doctorId: labTest.doctorId,
    doctorName: `${labTest.doctor.user.firstName} ${labTest.doctor.user.lastName}`.trim(),
    department: labTest.doctor.department.name,
    assignedToId: labTest.assignedToId,
    assignedToName: labTest.assignedTo ? `${labTest.assignedTo.firstName} ${labTest.assignedTo.lastName}`.trim() : null,
    testName: labTest.testName,
    category: toClientCategory(labTest.category),
    status: toClientLabTestStatus(labTest.status),
    resultSummary: labTest.resultSummary,
    requestedAt: labTest.requestedAt.toISOString(),
    completedAt: labTest.completedAt?.toISOString() ?? null,
  };
}
