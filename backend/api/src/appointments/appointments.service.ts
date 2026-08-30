import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, NotificationType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaMode } from '../common/session.mapper';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import {
  AdminAppointmentResponse,
  PatientAppointmentResponse,
  toAdminAppointmentResponse,
  toPatientAppointmentResponse,
} from './appointment.mapper';

const DOCTOR_INCLUDE = {
  doctor: {
    include: {
      user: { select: { firstName: true, lastName: true } },
      department: { select: { name: true } },
    },
  },
} as const;

const DOCTOR_AND_PATIENT_INCLUDE = {
  doctor: {
    include: {
      user: { select: { firstName: true, lastName: true } },
      department: { select: { name: true } },
    },
  },
  patient: { select: { firstName: true, lastName: true } },
} as const;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly billingService: BillingService,
  ) {}

  async findAllForAdmin(): Promise<AdminAppointmentResponse[]> {
    const appointments = await this.prisma.appointment.findMany({
      include: DOCTOR_AND_PATIENT_INCLUDE,
      orderBy: { scheduledAt: 'asc' },
    });

    return appointments.map(toAdminAppointmentResponse);
  }

  async listMine(patientId: string): Promise<PatientAppointmentResponse[]> {
    const appointments = await this.prisma.appointment.findMany({
      where: { patientId },
      include: DOCTOR_INCLUDE,
      orderBy: { scheduledAt: 'asc' },
    });

    return appointments.map(toPatientAppointmentResponse);
  }

  /** Front-desk/admin booking on a patient's behalf -- patientId comes from
   *  the request body instead of the caller's own session, so unlike book()
   *  it must be validated before use. */
  async bookForPatient(patientId: string, dto: BookAppointmentDto): Promise<PatientAppointmentResponse> {
    const patient = await this.prisma.user.findUnique({ where: { id: patientId } });

    if (!patient || patient.role !== Role.PATIENT) {
      throw new BadRequestException('Patient not found');
    }

    return this.book(patientId, dto);
  }

  async book(patientId: string, dto: BookAppointmentDto): Promise<PatientAppointmentResponse> {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: dto.doctorId } });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const scheduledAt = new Date(dto.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid date/time');
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Session must be scheduled in the future');
    }

    const conflict = await this.prisma.appointment.findFirst({
      where: { doctorId: dto.doctorId, scheduledAt, status: AppointmentStatus.SCHEDULED },
    });

    if (conflict) {
      throw new ConflictException('This doctor already has an appointment at that time');
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId,
        doctorId: dto.doctorId,
        scheduledAt,
        mode: toPrismaMode(dto.mode),
        reason: dto.reason,
      },
      include: DOCTOR_AND_PATIENT_INCLUDE,
    });

    const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim();
    await this.notificationsService.create(
      appointment.doctor.userId,
      NotificationType.APPOINTMENT_BOOKED,
      'New appointment booked',
      `${patientName} booked a session with you on ${appointment.scheduledAt.toLocaleString()}.`,
    );

    if (doctor.consultationFee > 0) {
      const doctorName = `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`.trim();
      await this.billingService.createConsultationInvoice(
        patientId,
        doctorName,
        doctor.consultationFee,
        appointment.scheduledAt,
      );
    }

    return toPatientAppointmentResponse(appointment);
  }

  async cancel(patientId: string, appointmentId: string): Promise<PatientAppointmentResponse> {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });

    if (!appointment || appointment.patientId !== patientId) {
      throw new NotFoundException('Appointment not found');
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED' },
      include: DOCTOR_AND_PATIENT_INCLUDE,
    });

    const patientName = `${updated.patient.firstName} ${updated.patient.lastName}`.trim();
    await this.notificationsService.create(
      updated.doctor.userId,
      NotificationType.APPOINTMENT_CANCELLED,
      'Appointment cancelled',
      `${patientName} cancelled their session on ${updated.scheduledAt.toLocaleString()}.`,
    );

    return toPatientAppointmentResponse(updated);
  }
}
