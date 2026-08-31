import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, type Doctor } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatMessageResponse, toChatMessageResponse } from './chat.mapper';

export interface ChatInboxDoctor {
  doctorId: string;
  doctorName: string;
  specialization: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Doctors the patient has an appointment or an existing message thread with — mirrors doctor-portal's inbox. */
  async listInboxDoctors(patientId: string): Promise<ChatInboxDoctor[]> {
    const [fromAppointments, fromMessages] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId },
        select: { doctorId: true },
        distinct: ['doctorId'],
      }),
      this.prisma.chatMessage.findMany({
        where: { patientId },
        select: { doctorId: true },
        distinct: ['doctorId'],
      }),
    ]);

    const doctorIds = [...new Set([...fromAppointments, ...fromMessages].map((row) => row.doctorId))];
    if (doctorIds.length === 0) return [];

    const doctors = await this.prisma.doctor.findMany({
      where: { id: { in: doctorIds } },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    return doctors
      .map((doctor) => ({
        doctorId: doctor.id,
        doctorName: `${doctor.user.firstName} ${doctor.user.lastName}`.trim(),
        specialization: doctor.specialization,
      }))
      .sort((a, b) => a.doctorName.localeCompare(b.doctorName));
  }

  private async assertDoctorExists(doctorId: string): Promise<Doctor> {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    return doctor;
  }

  async getThread(patientId: string, doctorId: string): Promise<ChatMessageResponse[]> {
    await this.assertDoctorExists(doctorId);

    const messages = await this.prisma.chatMessage.findMany({
      where: { patientId, doctorId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(toChatMessageResponse);
  }

  async sendMessage(patientId: string, doctorId: string, body: string): Promise<ChatMessageResponse[]> {
    const doctor = await this.assertDoctorExists(doctorId);

    await this.prisma.chatMessage.create({
      data: { patientId, doctorId, sender: 'PATIENT', body },
    });

    const patient = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    });
    const patientName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : 'A patient';
    await this.notificationsService.create(
      doctor.userId,
      NotificationType.CHAT_MESSAGE,
      `New message from ${patientName}`,
      body,
      `/messages?patientId=${patientId}`,
    );

    const thread = await this.prisma.chatMessage.findMany({
      where: { patientId, doctorId },
      orderBy: { createdAt: 'asc' },
    });

    return thread.map(toChatMessageResponse);
  }
}
