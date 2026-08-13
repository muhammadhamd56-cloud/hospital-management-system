import type { Doctor, MedicalRecord, Prescription, User } from '@prisma/client';

export interface PrescriptionResponse {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions: string | null;
}

export interface MedicalRecordResponse {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  specialization: string;
  appointmentId: string | null;
  diagnosis: string;
  notes: string;
  createdAt: string;
  prescriptions: PrescriptionResponse[];
}

export type MedicalRecordWithRelations = MedicalRecord & {
  doctor: Doctor & { user: Pick<User, 'firstName' | 'lastName'> };
  prescriptions: Prescription[];
};

export const MEDICAL_RECORD_INCLUDE = {
  doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
  prescriptions: true,
} as const;

function toPrescriptionResponse(prescription: Prescription): PrescriptionResponse {
  return {
    id: prescription.id,
    medicationName: prescription.medicationName,
    dosage: prescription.dosage,
    frequency: prescription.frequency,
    durationDays: prescription.durationDays,
    instructions: prescription.instructions,
  };
}

export function toMedicalRecordResponse(record: MedicalRecordWithRelations): MedicalRecordResponse {
  return {
    id: record.id,
    patientId: record.patientId,
    doctorId: record.doctorId,
    doctorName: `${record.doctor.user.firstName} ${record.doctor.user.lastName}`.trim(),
    specialization: record.doctor.specialization,
    appointmentId: record.appointmentId,
    diagnosis: record.diagnosis,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    prescriptions: record.prescriptions.map(toPrescriptionResponse),
  };
}
