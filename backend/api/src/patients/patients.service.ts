import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PatientAppointmentResponse, toPatientAppointmentResponse } from '../appointments/appointment.mapper';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

export interface PatientListItemResponse {
  id: string;
  fullName: string;
  email: string;
  picture: string | null;
  joinedAt: string;
  appointmentCount: number;
  lastVisit: string | null;
}

export interface PatientDetailResponse extends PatientListItemResponse {
  appointments: PatientAppointmentResponse[];
}

const DOCTOR_INCLUDE = {
  doctor: {
    include: {
      user: { select: { firstName: true, lastName: true } },
      department: { select: { name: true } },
    },
  },
} as const;

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admins see every patient. Doctors only see patients they have an actual
   * relationship with (a past/future appointment or a chat thread) — mirrors
   * the scoping DoctorPortalService.assertRelationship() applies to chat and
   * medical records, so a doctor can't browse the whole hospital's patients.
   */
  async findAll(caller: AuthenticatedUser): Promise<PatientListItemResponse[]> {
    const patientIds = await this.scopedPatientIds(caller);

    if (patientIds !== null && patientIds.length === 0) {
      return [];
    }

    const patients = await this.prisma.user.findMany({
      where: { role: Role.PATIENT, ...(patientIds !== null ? { id: { in: patientIds } } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        appointments: { select: { scheduledAt: true }, orderBy: { scheduledAt: 'desc' }, take: 1 },
        _count: { select: { appointments: true } },
      },
    });

    return patients.map((patient) => ({
      id: patient.id,
      fullName: `${patient.firstName} ${patient.lastName}`.trim(),
      email: patient.email,
      picture: patient.picture,
      joinedAt: patient.createdAt.toISOString(),
      appointmentCount: patient._count.appointments,
      lastVisit: patient.appointments[0]?.scheduledAt.toISOString() ?? null,
    }));
  }

  async findOne(caller: AuthenticatedUser, id: string): Promise<PatientDetailResponse> {
    if (caller.role === Role.DOCTOR) {
      await this.assertDoctorRelationship(caller.id, id);
    }

    const patient = await this.prisma.user.findFirst({
      where: { id, role: Role.PATIENT },
      include: {
        appointments: { include: DOCTOR_INCLUDE, orderBy: { scheduledAt: 'desc' } },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const appointments = patient.appointments.map(toPatientAppointmentResponse);

    return {
      id: patient.id,
      fullName: `${patient.firstName} ${patient.lastName}`.trim(),
      email: patient.email,
      picture: patient.picture,
      joinedAt: patient.createdAt.toISOString(),
      appointmentCount: appointments.length,
      lastVisit: appointments[0]?.scheduledAt ?? null,
      appointments,
    };
  }

  /** Returns null for admins (no filter — see every patient), or the list of patient ids the calling doctor has a relationship with (possibly empty). */
  private async scopedPatientIds(caller: AuthenticatedUser): Promise<string[] | null> {
    if (caller.role !== Role.DOCTOR) {
      return null;
    }

    const doctor = await this.prisma.doctor.findUnique({ where: { userId: caller.id } });

    if (!doctor) {
      return [];
    }

    const [fromAppointments, fromMessages] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { doctorId: doctor.id },
        select: { patientId: true },
        distinct: ['patientId'],
      }),
      this.prisma.chatMessage.findMany({
        where: { doctorId: doctor.id },
        select: { patientId: true },
        distinct: ['patientId'],
      }),
    ]);

    return [...new Set([...fromAppointments, ...fromMessages].map((row) => row.patientId))];
  }

  private async assertDoctorRelationship(callerId: string, patientId: string): Promise<void> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: callerId } });

    if (!doctor) {
      throw new NotFoundException('Patient not found');
    }

    const [hasAppointment, hasMessage] = await Promise.all([
      this.prisma.appointment.findFirst({ where: { doctorId: doctor.id, patientId } }),
      this.prisma.chatMessage.findFirst({ where: { doctorId: doctor.id, patientId } }),
    ]);

    if (!hasAppointment && !hasMessage) {
      throw new NotFoundException('Patient not found');
    }
  }
}
