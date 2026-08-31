import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, NotificationType, Prisma, Role } from '@prisma/client';
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

    // Serializable so two concurrent bookings for the same doctor+time can't
    // both pass the conflict check before either commits -- Postgres aborts
    // the loser with a serialization failure (caught below) instead of
    // silently allowing a double-booking.
    let appointment: Awaited<ReturnType<AppointmentsService['createAppointmentRow']>>;
    try {
      appointment = await this.prisma.$transaction(
        (tx) => this.createAppointmentRow(tx, patientId, dto, scheduledAt, doctor.consultationFee),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException(
          'Sorry, this appointment slot is no longer available. Please choose another time.',
        );
      }
      throw error;
    }

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
        appointment.id,
      );
    }

    return toPatientAppointmentResponse(appointment);
  }

  /** Runs inside the Serializable transaction in book() -- see the comment there. */
  private async createAppointmentRow(
    tx: Prisma.TransactionClient,
    patientId: string,
    dto: BookAppointmentDto,
    scheduledAt: Date,
    consultationFee: number,
  ) {
    const conflict = await tx.appointment.findFirst({
      where: { doctorId: dto.doctorId, scheduledAt, status: AppointmentStatus.SCHEDULED },
    });

    if (conflict) {
      throw new ConflictException('This doctor already has an appointment at that time');
    }

    return tx.appointment.create({
      data: {
        patientId,
        doctorId: dto.doctorId,
        scheduledAt,
        mode: toPrismaMode(dto.mode),
        reason: dto.reason,
        consultationFee,
      },
      include: DOCTOR_AND_PATIENT_INCLUDE,
    });
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

    await this.billingService.cancelInvoiceForAppointment(appointmentId);

    return toPatientAppointmentResponse(updated);
  }
}
