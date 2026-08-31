import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DOCTOR_PROFILE_INCLUDE,
  DirectoryDoctorResponse,
  DoctorWithUser,
  toDirectoryDoctor,
} from '../doctors/doctors.service';
import {
  AppointmentWithPatient,
  DoctorAppointmentResponse,
  toDoctorAppointmentResponse,
} from '../appointments/appointment.mapper';
import { ChatMessageResponse, toChatMessageResponse } from '../chat/chat.mapper';
import { NotificationsService } from '../notifications/notifications.service';
import { MedicalRecordsService } from '../medical-records/medical-records.service';
import { CreateMedicalRecordDto } from '../medical-records/dto/create-medical-record.dto';
import type { MedicalRecordResponse } from '../medical-records/medical-record.mapper';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from '../billing/billing.service';
import { DoctorProfileDto } from './dto/doctor-profile.dto';

const APPOINTMENT_PATIENT_INCLUDE = { patient: { select: { firstName: true, lastName: true } } } as const;

@Injectable()
export class DoctorPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly medicalRecordsService: MedicalRecordsService,
    private readonly auditLogService: AuditLogService,
    private readonly billingService: BillingService,
  ) {}

  private findLinkedDoctor(userId: string): Promise<DoctorWithUser | null> {
    return this.prisma.doctor.findUnique({
      where: { userId },
      include: DOCTOR_PROFILE_INCLUDE,
    });
  }

  private async requireLinkedDoctor(userId: string): Promise<DoctorWithUser> {
    const doctor = await this.findLinkedDoctor(userId);

    if (!doctor) {
      throw new NotFoundException('Complete your doctor profile first');
    }

    return doctor;
  }

  async getProfile(userId: string): Promise<DirectoryDoctorResponse | null> {
    const doctor = await this.findLinkedDoctor(userId);
    return doctor ? toDirectoryDoctor(doctor) : null;
  }

  async upsertProfile(userId: string, dto: DoctorProfileDto): Promise<DirectoryDoctorResponse> {
    const existing = await this.prisma.doctor.findUnique({ where: { userId } });
    const department = await this.prisma.department.upsert({
      where: { name: dto.department },
      update: {},
      create: { name: dto.department },
    });
    const data = {
      specialization: dto.specialization,
      departmentId: department.id,
      bio: dto.bio,
      experienceYears: dto.experienceYears,
      consultationFee: dto.consultationFee,
      appointmentDurationMinutes: dto.appointmentDurationMinutes,
    };

    const doctor = existing
      ? await this.prisma.doctor.update({
          where: { id: existing.id },
          data,
          include: DOCTOR_PROFILE_INCLUDE,
        })
      : await this.prisma.doctor.create({
          data: { ...data, userId },
          include: DOCTOR_PROFILE_INCLUDE,
        });

    if (existing && existing.consultationFee !== dto.consultationFee) {
      await this.auditLogService.log({
        actorId: userId,
        action: 'UPDATE',
        entityType: 'Doctor',
        entityId: doctor.id,
        metadata: {
          field: 'consultationFee',
          previousFee: existing.consultationFee,
          newFee: dto.consultationFee,
        },
      });
    }

    return toDirectoryDoctor(doctor);
  }

  async setAvailability(userId: string, isAvailable: boolean): Promise<DirectoryDoctorResponse> {
    const doctor = await this.requireLinkedDoctor(userId);

    const updated = await this.prisma.doctor.update({
      where: { id: doctor.id },
      data: { isAvailable },
      include: DOCTOR_PROFILE_INCLUDE,
    });

    return toDirectoryDoctor(updated);
  }

  async listAppointments(userId: string): Promise<DoctorAppointmentResponse[]> {
    const doctor = await this.findLinkedDoctor(userId);
    if (!doctor) return [];

    const appointments = await this.prisma.appointment.findMany({
      where: { doctorId: doctor.id },
      include: APPOINTMENT_PATIENT_INCLUDE,
      orderBy: { scheduledAt: 'asc' },
    });

    return appointments.map(toDoctorAppointmentResponse);
  }

  private async updateAppointmentStatus(
    userId: string,
    appointmentId: string,
    status: 'CANCELLED' | 'COMPLETED',
  ): Promise<DoctorAppointmentResponse> {
    const doctor = await this.findLinkedDoctor(userId);
    const appointment = doctor
      ? await this.prisma.appointment.findUnique({ where: { id: appointmentId } })
      : null;

    if (!doctor || !appointment || appointment.doctorId !== doctor.id) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.status !== 'SCHEDULED') {
      throw new BadRequestException('Only scheduled sessions can be updated');
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status },
      include: APPOINTMENT_PATIENT_INCLUDE,
    });

    if (status === 'CANCELLED') {
      const doctorName = `${doctor.user.firstName} ${doctor.user.lastName}`.trim();
      await this.notificationsService.create(
        updated.patientId,
        NotificationType.APPOINTMENT_CANCELLED,
        'Appointment cancelled',
        `Dr. ${doctorName} cancelled your session on ${updated.scheduledAt.toLocaleString()}.`,
        `/my-appointments?appointmentId=${appointmentId}`,
      );
      await this.billingService.cancelInvoiceForAppointment(appointmentId);
    }

    return toDoctorAppointmentResponse(updated as AppointmentWithPatient);
  }

  cancelAppointment(userId: string, appointmentId: string): Promise<DoctorAppointmentResponse> {
    return this.updateAppointmentStatus(userId, appointmentId, 'CANCELLED');
  }

  completeAppointment(userId: string, appointmentId: string): Promise<DoctorAppointmentResponse> {
    return this.updateAppointmentStatus(userId, appointmentId, 'COMPLETED');
  }

  async listInboxPatients(userId: string): Promise<{ patientId: string; patientName: string }[]> {
    const doctor = await this.findLinkedDoctor(userId);
    if (!doctor) return [];

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

    const patientIds = [...new Set([...fromAppointments, ...fromMessages].map((row) => row.patientId))];
    if (patientIds.length === 0) return [];

    const patients = await this.prisma.user.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, firstName: true, lastName: true },
    });

    return patients
      .map((patient) => ({
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`.trim(),
      }))
      .sort((a, b) => a.patientName.localeCompare(b.patientName));
  }

  private async assertRelationship(doctorId: string, patientId: string): Promise<void> {
    const [hasAppointment, hasMessage] = await Promise.all([
      this.prisma.appointment.findFirst({ where: { doctorId, patientId } }),
      this.prisma.chatMessage.findFirst({ where: { doctorId, patientId } }),
    ]);

    if (!hasAppointment && !hasMessage) {
      throw new NotFoundException('Patient not found in your inbox');
    }
  }

  async getThread(userId: string, patientId: string): Promise<ChatMessageResponse[]> {
    const doctor = await this.requireLinkedDoctor(userId);
    await this.assertRelationship(doctor.id, patientId);

    const messages = await this.prisma.chatMessage.findMany({
      where: { doctorId: doctor.id, patientId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(toChatMessageResponse);
  }

  async sendMessage(userId: string, patientId: string, body: string): Promise<ChatMessageResponse[]> {
    const doctor = await this.requireLinkedDoctor(userId);
    await this.assertRelationship(doctor.id, patientId);

    await this.prisma.chatMessage.create({
      data: { patientId, doctorId: doctor.id, sender: 'DOCTOR', body },
    });

    const doctorName = `${doctor.user.firstName} ${doctor.user.lastName}`.trim();
    await this.notificationsService.create(
      patientId,
      NotificationType.CHAT_MESSAGE,
      `New message from Dr. ${doctorName}`,
      body,
      `/messages?doctorId=${doctor.id}`,
    );

    const thread = await this.prisma.chatMessage.findMany({
      where: { doctorId: doctor.id, patientId },
      orderBy: { createdAt: 'asc' },
    });

    return thread.map(toChatMessageResponse);
  }

  async listPatientMedicalRecords(userId: string, patientId: string): Promise<MedicalRecordResponse[]> {
    const doctor = await this.requireLinkedDoctor(userId);
    await this.assertRelationship(doctor.id, patientId);

    return this.medicalRecordsService.listForPatientByDoctor(doctor.id, patientId);
  }

  async addMedicalRecord(
    userId: string,
    patientId: string,
    dto: CreateMedicalRecordDto,
  ): Promise<MedicalRecordResponse> {
    const doctor = await this.requireLinkedDoctor(userId);
    await this.assertRelationship(doctor.id, patientId);

    const record = await this.medicalRecordsService.createForPatient(doctor.id, patientId, dto);

    const doctorName = `${doctor.user.firstName} ${doctor.user.lastName}`.trim();
    await this.notificationsService.create(
      patientId,
      NotificationType.MEDICAL_RECORD_ADDED,
      'New medical record added',
      `Dr. ${doctorName} added a new diagnosis to your medical records.`,
      '/medical-records',
    );

    return record;
  }
}
