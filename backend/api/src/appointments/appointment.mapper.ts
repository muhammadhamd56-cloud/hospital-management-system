import type { Appointment, Department, Doctor, User } from '@prisma/client';
import { toClientMode, toClientStatus } from '../common/session.mapper';

export type AppointmentWithDoctor = Appointment & {
  doctor: Doctor & { user: Pick<User, 'firstName' | 'lastName'>; department: Pick<Department, 'name'> };
};

export interface PatientAppointmentResponse {
  id: string;
  doctorId: string;
  doctorName: string;
  specialization: string;
  department: string;
  scheduledAt: string;
  mode: 'online' | 'in-person';
  status: 'scheduled' | 'completed' | 'cancelled';
  reason: string;
  /** Snapshot of the doctor's consultation fee at booking time -- never the doctor's current fee. */
  consultationFee: number;
}

export function toPatientAppointmentResponse(appointment: AppointmentWithDoctor): PatientAppointmentResponse {
  return {
    id: appointment.id,
    doctorId: appointment.doctorId,
    doctorName: `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`.trim(),
    specialization: appointment.doctor.specialization,
    department: appointment.doctor.department.name,
    scheduledAt: appointment.scheduledAt.toISOString(),
    mode: toClientMode(appointment.mode),
    status: toClientStatus(appointment.status),
    reason: appointment.reason,
    consultationFee: appointment.consultationFee,
  };
}

export type AppointmentWithPatient = Appointment & { patient: Pick<User, 'firstName' | 'lastName'> };

export interface DoctorAppointmentResponse {
  id: string;
  patientId: string;
  patientName: string;
  scheduledAt: string;
  mode: 'online' | 'in-person';
  status: 'scheduled' | 'completed' | 'cancelled';
  reason: string;
  /** Snapshot of the doctor's consultation fee at booking time -- never the doctor's current fee. */
  consultationFee: number;
}

export function toDoctorAppointmentResponse(appointment: AppointmentWithPatient): DoctorAppointmentResponse {
  return {
    id: appointment.id,
    patientId: appointment.patientId,
    patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim(),
    scheduledAt: appointment.scheduledAt.toISOString(),
    mode: toClientMode(appointment.mode),
    status: toClientStatus(appointment.status),
    reason: appointment.reason,
    consultationFee: appointment.consultationFee,
  };
}

export type AppointmentWithDoctorAndPatient = Appointment & {
  doctor: Doctor & { user: Pick<User, 'firstName' | 'lastName'>; department: Pick<Department, 'name'> };
  patient: Pick<User, 'firstName' | 'lastName'>;
};

export interface AdminAppointmentResponse {
  id: string;
  patientName: string;
  doctorName: string;
  specialization: string;
  department: string;
  scheduledAt: string;
  mode: 'online' | 'in-person';
  status: 'scheduled' | 'completed' | 'cancelled';
  reason: string;
  /** Snapshot of the doctor's consultation fee at booking time -- never the doctor's current fee. */
  consultationFee: number;
}

export function toAdminAppointmentResponse(appointment: AppointmentWithDoctorAndPatient): AdminAppointmentResponse {
  return {
    id: appointment.id,
    patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim(),
    doctorName: `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`.trim(),
    specialization: appointment.doctor.specialization,
    department: appointment.doctor.department.name,
    scheduledAt: appointment.scheduledAt.toISOString(),
    mode: toClientMode(appointment.mode),
    status: toClientStatus(appointment.status),
    reason: appointment.reason,
    consultationFee: appointment.consultationFee,
  };
}
