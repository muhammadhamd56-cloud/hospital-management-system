import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MedicalRecordsService } from './medical-records.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMedicalRecordDto } from './dto/create-medical-record.dto';

function buildRecordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'record-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    appointmentId: null,
    diagnosis: 'Common cold',
    notes: 'Rest and fluids',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    doctor: { specialization: 'General Medicine', user: { firstName: 'Ada', lastName: 'Lovelace' } },
    prescriptions: [],
    ...overrides,
  };
}

describe('MedicalRecordsService', () => {
  let service: MedicalRecordsService;
  let prisma: {
    medicalRecord: { findMany: jest.Mock; create: jest.Mock };
    appointment: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      medicalRecord: { findMany: jest.fn(), create: jest.fn() },
      appointment: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MedicalRecordsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(MedicalRecordsService);
  });

  describe('listMine', () => {
    it('returns the patient’s own records, newest first, mapped to the response shape', async () => {
      prisma.medicalRecord.findMany.mockResolvedValue([buildRecordRow()]);

      const result = await service.listMine('patient-1');

      expect(prisma.medicalRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { patientId: 'patient-1' }, orderBy: { createdAt: 'desc' } }),
      );
      expect(result).toEqual([
        {
          id: 'record-1',
          patientId: 'patient-1',
          doctorId: 'doctor-1',
          doctorName: 'Ada Lovelace',
          specialization: 'General Medicine',
          appointmentId: null,
          diagnosis: 'Common cold',
          notes: 'Rest and fluids',
          createdAt: '2026-01-01T00:00:00.000Z',
          prescriptions: [],
        },
      ]);
    });
  });

  describe('listForPatientByDoctor', () => {
    it('scopes the query to both doctorId and patientId', async () => {
      prisma.medicalRecord.findMany.mockResolvedValue([]);

      await service.listForPatientByDoctor('doctor-1', 'patient-1');

      expect(prisma.medicalRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { doctorId: 'doctor-1', patientId: 'patient-1' } }),
      );
    });
  });

  describe('createForPatient', () => {
    const dto: CreateMedicalRecordDto = { diagnosis: 'Flu', notes: 'Rest' };

    it('creates a record with nested prescriptions when provided', async () => {
      const dtoWithPrescriptions: CreateMedicalRecordDto = {
        ...dto,
        prescriptions: [
          { medicationName: 'Paracetamol', dosage: '500mg', frequency: 'Twice daily', durationDays: 5 },
        ],
      };
      prisma.medicalRecord.create.mockResolvedValue(
        buildRecordRow({ prescriptions: [{ id: 'rx-1', medicationName: 'Paracetamol' }] }),
      );

      await service.createForPatient('doctor-1', 'patient-1', dtoWithPrescriptions);

      expect(prisma.medicalRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'patient-1',
            doctorId: 'doctor-1',
            diagnosis: 'Flu',
            notes: 'Rest',
            prescriptions: { create: dtoWithPrescriptions.prescriptions },
          }),
        }),
      );
    });

    it('omits the prescriptions key entirely when none are given', async () => {
      prisma.medicalRecord.create.mockResolvedValue(buildRecordRow());

      await service.createForPatient('doctor-1', 'patient-1', dto);

      const createArgs = prisma.medicalRecord.create.mock.calls[0][0];
      expect(createArgs.data.prescriptions).toBeUndefined();
    });

    it('throws BadRequestException when appointmentId belongs to a different doctor', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        doctorId: 'someone-else',
        patientId: 'patient-1',
      });

      await expect(
        service.createForPatient('doctor-1', 'patient-1', { ...dto, appointmentId: 'appt-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.medicalRecord.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when appointmentId belongs to a different patient', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        doctorId: 'doctor-1',
        patientId: 'someone-else',
      });

      await expect(
        service.createForPatient('doctor-1', 'patient-1', { ...dto, appointmentId: 'appt-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when the appointment already has a medical record', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        doctorId: 'doctor-1',
        patientId: 'patient-1',
      });
      prisma.medicalRecord.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.createForPatient('doctor-1', 'patient-1', { ...dto, appointmentId: 'appt-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
