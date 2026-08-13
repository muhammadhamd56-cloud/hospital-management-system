import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { MEDICAL_RECORD_INCLUDE, MedicalRecordResponse, toMedicalRecordResponse } from './medical-record.mapper';

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class MedicalRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(patientId: string): Promise<MedicalRecordResponse[]> {
    const records = await this.prisma.medicalRecord.findMany({
      where: { patientId },
      include: MEDICAL_RECORD_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return records.map(toMedicalRecordResponse);
  }

  async listForPatientByDoctor(doctorId: string, patientId: string): Promise<MedicalRecordResponse[]> {
    const records = await this.prisma.medicalRecord.findMany({
      where: { doctorId, patientId },
      include: MEDICAL_RECORD_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return records.map(toMedicalRecordResponse);
  }

  /** Caller (doctor-portal) is responsible for verifying the doctor is allowed
   *  to write for this patient at all -- this only validates a given appointmentId. */
  async createForPatient(
    doctorId: string,
    patientId: string,
    dto: CreateMedicalRecordDto,
  ): Promise<MedicalRecordResponse> {
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({ where: { id: dto.appointmentId } });

      if (!appointment || appointment.doctorId !== doctorId || appointment.patientId !== patientId) {
        throw new BadRequestException('Appointment does not belong to this doctor and patient');
      }
    }

    try {
      const record = await this.prisma.medicalRecord.create({
        data: {
          patientId,
          doctorId,
          appointmentId: dto.appointmentId,
          diagnosis: dto.diagnosis,
          notes: dto.notes,
          prescriptions: dto.prescriptions?.length ? { create: dto.prescriptions } : undefined,
        },
        include: MEDICAL_RECORD_INCLUDE,
      });

      return toMedicalRecordResponse(record);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
        throw new ConflictException('This appointment already has a medical record');
      }
      throw error;
    }
  }
}
