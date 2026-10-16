import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, AppointmentStatus, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaMode } from '../common/session.mapper';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
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

  /**
   * ADMIN sees every appointment hospital-wide. DOCTOR is scoped to only
   * their own appointments -- this endpoint used to return everyone's
   * appointments to any doctor who called it, leaking every other doctor's
   * patients (name, reason, schedule) to them. Mirrors the doctor-scoping
   * pattern already used in PatientsService/BillingService/LaboratoryService.
   */
  async findAllForAdmin(caller: AuthenticatedUser): Promise<AdminAppointmentResponse[]> {
    let where: { doctorId?: string } = {};

    if (caller.role === Role.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId: caller.id } });

      if (!doctor) {
        return [];
      }

      where = { doctorId: doctor.id };
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
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
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: dto.doctorId },
      include: { user: { select: { approvalStatus: true } } },
    });

    // An unvetted (pending/rejected) doctor can't be booked -- same 404 as an unknown one.
    if (!doctor || doctor.user.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new NotFoundException('Doctor not found');
    }

    // The booking page only offers available doctors -- enforced here too so
    // the API can't be used to book around a doctor's own settings.
    if (!doctor.isAvailable) {
      throw new BadRequestException('This doctor is not accepting bookings right now');
    }

    if (dto.mode === 'online' && !doctor.acceptsOnline) {
      throw new BadRequestException('This doctor only offers in-person sessions');
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
        (tx) =>
          this.createAppointmentRow(tx, patientId, dto, scheduledAt, doctor.consultationFee, doctor.appointmentDurationMinutes),
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
      `/appointments?appointmentId=${appointment.id}`,
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
    durationMinutes: number,
  ) {
    // Any scheduled session starting less than one session-length before or
    // after this one overlaps it -- not just one at the identical instant
    // (10:00 and 10:05 would otherwise both be accepted). Inside the
    // Serializable transaction this range read is conflict-checked too.
    const durationMs = Math.max(durationMinutes, 1) * 60_000;
    const overlapping = {
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: { gt: new Date(scheduledAt.getTime() - durationMs), lt: new Date(scheduledAt.getTime() + durationMs) },
    };

    const [doctorConflict, patientConflict] = await Promise.all([
      tx.appointment.findFirst({ where: { doctorId: dto.doctorId, ...overlapping }, select: { id: true } }),
      tx.appointment.findFirst({ where: { patientId, ...overlapping }, select: { id: true } }),
    ]);

    if (doctorConflict) {
      throw new ConflictException('This doctor already has an appointment at that time');
    }

    if (patientConflict) {
      throw new ConflictException('You already have another appointment at that time');
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

    // A completed visit can't be "cancelled" after the fact -- that would
    // rewrite history and void its unpaid invoice.
    if (appointment.status !== AppointmentStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled sessions can be cancelled');
    }

    const updated = await this.updateIfScheduled(appointmentId, AppointmentStatus.CANCELLED);

    const patientName = `${updated.patient.firstName} ${updated.patient.lastName}`.trim();
    await this.notificationsService.create(
      updated.doctor.userId,
      NotificationType.APPOINTMENT_CANCELLED,
      'Appointment cancelled',
      `${patientName} cancelled their session on ${updated.scheduledAt.toLocaleString()}.`,
      `/appointments?appointmentId=${updated.id}`,
    );

    await this.billingService.cancelInvoiceForAppointment(appointmentId);

    return toPatientAppointmentResponse(updated);
  }

  /** Writes only while the appointment is still SCHEDULED, so a cancel racing
   *  the doctor's "complete" (or a double-click) can't overwrite it. */
  private async updateIfScheduled(appointmentId: string, status: AppointmentStatus) {
    try {
      return await this.prisma.appointment.update({
        where: { id: appointmentId, status: AppointmentStatus.SCHEDULED },
        data: { status },
        include: DOCTOR_AND_PATIENT_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException('This session was just updated. Refresh to see its current status.');
      }
      throw error;
    }
  }
}
