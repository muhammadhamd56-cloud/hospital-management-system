import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { MedicalRecordsService } from './medical-records.service';
import type { MedicalRecordResponse } from './medical-record.mapper';

/** Patient-side read access to their own records. Doctor-side write/view lives in doctor-portal/. */
@Controller('medical-records')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class MedicalRecordsController {
  constructor(private readonly medicalRecordsService: MedicalRecordsService) {}

  @Get('me')
  async listMine(@CurrentUser() user: AuthenticatedUser): Promise<{ records: MedicalRecordResponse[] }> {
    const records = await this.medicalRecordsService.listMine(user.id);
    return { records };
  }
}
