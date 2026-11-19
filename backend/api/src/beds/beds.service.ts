import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BedStatus, Prisma, Role, type Bed, type Department, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { doctorHasPatient, doctorPatientIds } from '../common/doctor-patient';

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

/** `showPatient` false keeps the occupancy but hides who's in the bed. */
function toBedResponse(bed: BedWithPatient, showPatient = true): BedResponse {
  return {
    id: bed.id,
    label: bed.label,
    department: bed.department.name,
    status: bed.status.toLowerCase() as BedResponse['status'],
    patientId: showPatient ? bed.patientId : null,
    patientName: showPatient && bed.patient ? `${bed.patient.firstName} ${bed.patient.lastName}`.trim() : null,
  };
}

const PATIENT_INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  department: { select: { name: true } },
} as const;

@Injectable()
export class BedsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ADMIN sees every occupant. A DOCTOR sees the whole ward's occupancy (to
   * find a free bed) but only the names of their own patients -- doctor
   * accounts can be self-registered, so the role alone mustn't reveal who
   * is admitted.
   */
  async findAll(caller: AuthenticatedUser): Promise<BedListResponse> {
    const beds = await this.prisma.bed.findMany({
      include: PATIENT_INCLUDE,
      orderBy: [{ department: { name: 'asc' } }, { label: 'asc' }],
    });

    const ownPatients = caller.role === Role.DOCTOR ? new Set(await this.doctorPatients(caller.id)) : null;

    return {
      beds: beds.map((bed) => toBedResponse(bed, !ownPatients || (bed.patientId !== null && ownPatients.has(bed.patientId)))),
      totalCount: beds.length,
      availableCount: beds.filter((bed) => bed.status === BedStatus.AVAILABLE).length,
    };
  }

  async assign(caller: AuthenticatedUser, bedId: string, patientId: string): Promise<BedResponse> {
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

    if (caller.role === Role.DOCTOR && !(await this.isOwnPatient(caller.id, patientId))) {
      throw new BadRequestException('Patient not found');
    }

    const existingBed = await this.prisma.bed.findUnique({ where: { patientId } });

    if (existingBed) {
      throw new ConflictException('This patient is already assigned to a bed');
    }

    try {
      // Conditional on still being AVAILABLE: two concurrent assigns of
      // different patients to this bed must not both succeed.
      const updated = await this.prisma.bed.update({
        where: { id: bedId, status: BedStatus.AVAILABLE },
        data: { status: BedStatus.OCCUPIED, patientId },
        include: PATIENT_INCLUDE,
      });

      return toBedResponse(updated);
    } catch (error) {
      // Belt-and-suspenders for the check above -- Bed.patientId is @unique,
      // so two concurrent assign() calls for the same patient can't both
      // succeed even if both raced past the findUnique check.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This patient is already assigned to a bed');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException('Bed is no longer available');
      }
      throw error;
    }
  }

  async release(caller: AuthenticatedUser, bedId: string): Promise<BedResponse> {
    const bed = await this.prisma.bed.findUnique({ where: { id: bedId } });

    if (!bed) {
      throw new NotFoundException('Bed not found');
    }

    if (bed.status !== BedStatus.OCCUPIED) {
      throw new BadRequestException('Bed is not occupied');
    }

    if (caller.role === Role.DOCTOR && !(bed.patientId && (await this.isOwnPatient(caller.id, bed.patientId)))) {
      throw new ForbiddenException("Only an admin or the patient's own doctor can release this bed");
    }

    const updated = await this.prisma.bed.update({
      where: { id: bedId },
      data: { status: BedStatus.AVAILABLE, patientId: null },
      include: PATIENT_INCLUDE,
    });

    return toBedResponse(updated);
  }

  private async doctorPatients(userId: string): Promise<string[]> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
    return doctor ? doctorPatientIds(this.prisma, doctor.id) : [];
  }

  private async isOwnPatient(userId: string, patientId: string): Promise<boolean> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
    return doctor ? doctorHasPatient(this.prisma, doctor.id, patientId) : false;
  }
}
