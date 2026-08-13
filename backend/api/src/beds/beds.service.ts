import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BedStatus, Role, type Bed, type Department, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface BedResponse {
  id: string;
  label: string;
  department: string;
  status: 'available' | 'occupied' | 'maintenance';
  patientId: string | null;
  patientName: string | null;
}

export interface BedListResponse {
  beds: BedResponse[];
  totalCount: number;
  availableCount: number;
}

type BedWithPatient = Bed & {
  patient: Pick<User, 'firstName' | 'lastName'> | null;
  department: Pick<Department, 'name'>;
};

function toBedResponse(bed: BedWithPatient): BedResponse {
  return {
    id: bed.id,
    label: bed.label,
    department: bed.department.name,
    status: bed.status.toLowerCase() as BedResponse['status'],
    patientId: bed.patientId,
    patientName: bed.patient ? `${bed.patient.firstName} ${bed.patient.lastName}`.trim() : null,
  };
}

const PATIENT_INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  department: { select: { name: true } },
} as const;

@Injectable()
export class BedsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<BedListResponse> {
    const beds = await this.prisma.bed.findMany({
      include: PATIENT_INCLUDE,
      orderBy: [{ department: { name: 'asc' } }, { label: 'asc' }],
    });

    return {
      beds: beds.map(toBedResponse),
      totalCount: beds.length,
      availableCount: beds.filter((bed) => bed.status === BedStatus.AVAILABLE).length,
    };
  }

  async assign(bedId: string, patientId: string): Promise<BedResponse> {
    const bed = await this.prisma.bed.findUnique({ where: { id: bedId } });

    if (!bed) {
      throw new NotFoundException('Bed not found');
    }

    if (bed.status !== BedStatus.AVAILABLE) {
      throw new BadRequestException('Bed is not available');
    }

    const patient = await this.prisma.user.findUnique({ where: { id: patientId } });

    if (!patient || patient.role !== Role.PATIENT) {
      throw new BadRequestException('Patient not found');
    }

    const updated = await this.prisma.bed.update({
      where: { id: bedId },
      data: { status: BedStatus.OCCUPIED, patientId },
      include: PATIENT_INCLUDE,
    });

    return toBedResponse(updated);
  }

  async release(bedId: string): Promise<BedResponse> {
    const bed = await this.prisma.bed.findUnique({ where: { id: bedId } });

    if (!bed) {
      throw new NotFoundException('Bed not found');
    }

    if (bed.status !== BedStatus.OCCUPIED) {
      throw new BadRequestException('Bed is not occupied');
    }

    const updated = await this.prisma.bed.update({
      where: { id: bedId },
      data: { status: BedStatus.AVAILABLE, patientId: null },
      include: PATIENT_INCLUDE,
    });

    return toBedResponse(updated);
  }
}
