import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LabTestStatus, NotificationType, Role, StaffType } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestLabTestDto } from './dto/request-lab-test.dto';
import { UpdateLabTestStatusDto } from './dto/update-lab-test-status.dto';
import {
  LabTestResponse,
  toLabTestResponse,
  toPrismaCategory,
  toPrismaLabTestStatus,
  type LabTestWithRelations,
} from './laboratory.mapper';

const LAB_TEST_INCLUDE = {
  patient: { select: { firstName: true, lastName: true } },
  doctor: {
    include: {
      user: { select: { firstName: true, lastName: true } },
      department: { select: { name: true } },
    },
  },
  assignedTo: { select: { firstName: true, lastName: true } },
} as const;

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * ADMIN/lab-technician STAFF see every test -- lab staff serve the whole
   * hospital. DOCTOR is scoped to patients they have a real relationship
   * with (an appointment or chat message), matching
   * PatientsService.scopedPatientIds -- NOT just tests they personally
   * requested, since a treating doctor needs to see results for their
   * patients regardless of which colleague ordered the test.
   */
  async findAll(caller: AuthenticatedUser): Promise<LabTestResponse[]> {
    await this.requireLabAccess(caller);

    const where = caller.role === Role.DOCTOR ? await this.scopedPatientWhere(caller.id) : {};

    if (where === null) {
      return [];
    }

    const labTests = await this.prisma.labTest.findMany({
      where,
      include: LAB_TEST_INCLUDE,
      orderBy: { requestedAt: 'desc' },
    });

    return labTests.map((labTest) => toLabTestResponse(labTest as LabTestWithRelations));
  }

  /**
   * ADMIN supplies any doctorId directly. A DOCTOR caller can only request on
   * their own behalf -- their linked doctor id is used regardless of what the
   * client sends, the same way AppointmentsService.book() ignores any
   * client-supplied patientId.
   */
  async request(caller: AuthenticatedUser, dto: RequestLabTestDto): Promise<LabTestResponse> {
    const doctorId = caller.role === Role.DOCTOR ? await this.requireOwnDoctorId(caller.id) : dto.doctorId;

    const doctorExists = await this.prisma.doctor.findUnique({ where: { id: doctorId } });

    if (!doctorExists) {
      throw new NotFoundException('Doctor not found');
    }

    const patient = await this.prisma.user.findUnique({ where: { id: dto.patientId } });

    if (!patient || patient.role !== Role.PATIENT) {
      throw new BadRequestException('Patient not found');
    }

    const labTest = await this.prisma.labTest.create({
      data: {
        patientId: dto.patientId,
        doctorId,
        testName: dto.testName,
        category: toPrismaCategory(dto.category),
      },
      include: LAB_TEST_INCLUDE,
    });

    return toLabTestResponse(labTest as LabTestWithRelations);
  }

  /** Updates status/result; fires LAB_RESULT_READY to the patient and requesting doctor on the transition into COMPLETED. */
  async updateStatus(caller: AuthenticatedUser, id: string, dto: UpdateLabTestStatusDto): Promise<LabTestResponse> {
    await this.requireLabAccess(caller);

    const existing = await this.prisma.labTest.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Lab test not found');
    }

    const status = toPrismaLabTestStatus(dto.status);
    const justCompleted = status === LabTestStatus.COMPLETED && existing.status !== LabTestStatus.COMPLETED;

    const updated = await this.prisma.labTest.update({
      where: { id },
      data: {
        status,
        resultSummary: dto.resultSummary ?? existing.resultSummary,
        completedAt: justCompleted ? new Date() : existing.completedAt,
      },
      include: LAB_TEST_INCLUDE,
    });

    if (justCompleted) {
      const patientName = `${updated.patient.firstName} ${updated.patient.lastName}`.trim();

      await Promise.all([
        this.notificationsService.create(
          updated.patientId,
          NotificationType.LAB_RESULT_READY,
          'Lab result ready',
          `Your ${updated.testName} results are ready.`,
          '/medical-records',
        ),
        this.notificationsService.create(
          updated.doctor.userId,
          NotificationType.LAB_RESULT_READY,
          'Lab result ready',
          `${patientName}'s ${updated.testName} results are ready.`,
          '/laboratory',
        ),
      ]);
    }

    return toLabTestResponse(updated as LabTestWithRelations);
  }

  /**
   * ADMIN and DOCTOR always pass. A STAFF caller only passes when their
   * linked roster row is specifically a lab technician -- Role.STAFF is
   * shared by every non-doctor staff type now, so a receptionist or nurse
   * holding that same login role must not get lab-test access just because
   * the class-level @Roles(...) guard admits Role.STAFF in general.
   */
  private async requireLabAccess(caller: AuthenticatedUser): Promise<void> {
    if (caller.role === Role.ADMIN || caller.role === Role.DOCTOR) {
      return;
    }

    const staff = await this.prisma.staff.findUnique({ where: { userId: caller.id } });

    if (!staff || staff.staffType !== StaffType.LAB_TECHNICIAN) {
      throw new ForbiddenException('Only lab technicians can access laboratory tests');
    }
  }

  private async requireOwnDoctorId(userId: string): Promise<string> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });

    if (!doctor) {
      throw new NotFoundException('Complete your doctor profile first');
    }

    return doctor.id;
  }

  /** Returns a Prisma where-clause scoped to patients this doctor has an appointment or chat relationship with, or null if there are none (caller has no matches at all). */
  private async scopedPatientWhere(userId: string): Promise<{ patientId: { in: string[] } } | null> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });

    if (!doctor) {
      return null;
    }

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

    if (patientIds.length === 0) {
      return null;
    }

    return { patientId: { in: patientIds } };
  }
}
