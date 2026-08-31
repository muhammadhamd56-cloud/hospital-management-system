import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ChatSender, NotificationType } from '@prisma/client';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    doctor: { findUnique: jest.Mock; findMany: jest.Mock };
    appointment: { findMany: jest.Mock };
    chatMessage: { findMany: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      doctor: { findUnique: jest.fn(), findMany: jest.fn() },
      appointment: { findMany: jest.fn() },
      chatMessage: { findMany: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    notificationsService = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  describe('getThread / sendMessage', () => {
    it('throws NotFoundException when the doctor does not exist', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.getThread('patient-1', 'missing-doctor')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lets a patient message a doctor with no prior appointment or thread', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doctor-1', userId: 'doctor-user-1' });
      prisma.user.findUnique.mockResolvedValue({ firstName: 'Pat', lastName: 'Ient' });
      prisma.chatMessage.findMany.mockResolvedValue([
        { id: 'm1', doctorId: 'doctor-1', sender: ChatSender.PATIENT, body: 'Hi', createdAt: new Date() },
      ]);

      const thread = await service.sendMessage('patient-1', 'doctor-1', 'Hi');

      expect(prisma.chatMessage.create).toHaveBeenCalledWith({
        data: { patientId: 'patient-1', doctorId: 'doctor-1', sender: 'PATIENT', body: 'Hi' },
      });
      expect(notificationsService.create).toHaveBeenCalledWith(
        'doctor-user-1',
        NotificationType.CHAT_MESSAGE,
        'New message from Pat Ient',
        'Hi',
        '/messages?patientId=patient-1',
      );
      expect(thread).toHaveLength(1);
    });
  });

  describe('listInboxDoctors', () => {
    it('returns an empty array when there are no appointments or messages', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.chatMessage.findMany.mockResolvedValue([]);

      const result = await service.listInboxDoctors('patient-1');

      expect(result).toEqual([]);
      expect(prisma.doctor.findMany).not.toHaveBeenCalled();
    });

    it('merges doctors from appointments and messages, deduplicated', async () => {
      prisma.appointment.findMany.mockResolvedValue([{ doctorId: 'doctor-1' }]);
      prisma.chatMessage.findMany.mockResolvedValue([{ doctorId: 'doctor-1' }, { doctorId: 'doctor-2' }]);
      prisma.doctor.findMany.mockResolvedValue([
        { id: 'doctor-1', specialization: 'Cardiology', user: { firstName: 'Dana', lastName: 'Doctor' } },
        { id: 'doctor-2', specialization: 'Neurology', user: { firstName: 'Alex', lastName: 'Neuro' } },
      ]);

      const result = await service.listInboxDoctors('patient-1');

      expect(prisma.doctor.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['doctor-1', 'doctor-2'] } },
        include: { user: { select: { firstName: true, lastName: true } } },
      });
      expect(result).toEqual([
        { doctorId: 'doctor-2', doctorName: 'Alex Neuro', specialization: 'Neurology' },
        { doctorId: 'doctor-1', doctorName: 'Dana Doctor', specialization: 'Cardiology' },
      ]);
    });
  });
});
