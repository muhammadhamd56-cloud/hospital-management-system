import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreatePatientDto } from './dto/create-patient.dto';
import {
  CreatePatientResult,
  PatientDetailResponse,
  PatientListItemResponse,
  PatientsService,
} from './patients.service';

/**
 * Admin/doctor-facing patient directory. Admins see every patient; doctors
 * only see patients they have an appointment or chat relationship with — see
 * PatientsService.scopedPatientIds(). Provisioning a new patient account
 * (front-desk intake) is admin-only, mirroring StaffController.
 */
@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DOCTOR)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<{ patients: PatientListItemResponse[] }> {
    const patients = await this.patientsService.findAll(user);
    return { patients };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ patient: PatientDetailResponse }> {
    const patient = await this.patientsService.findOne(user, id);
    return { patient };
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreatePatientDto): Promise<CreatePatientResult> {
    return this.patientsService.create(dto);
  }
}
