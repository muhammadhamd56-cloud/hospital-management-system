import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { RequestLabTestDto } from './dto/request-lab-test.dto';
import { UpdateLabTestStatusDto } from './dto/update-lab-test-status.dto';
import { LaboratoryService } from './laboratory.service';
import type { LabTestResponse } from './laboratory.mapper';

@Controller('laboratory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  @Get('tests')
  @Roles(Role.ADMIN, Role.DOCTOR, Role.STAFF)
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<{ tests: LabTestResponse[] }> {
    const tests = await this.laboratoryService.findAll(user);
    return { tests };
  }

  @Post('tests')
  @Roles(Role.ADMIN, Role.DOCTOR)
  async request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestLabTestDto,
  ): Promise<{ test: LabTestResponse }> {
    const test = await this.laboratoryService.request(user, dto);
    return { test };
  }

  @Patch('tests/:id/status')
  @Roles(Role.ADMIN, Role.STAFF)
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLabTestStatusDto,
  ): Promise<{ test: LabTestResponse }> {
    const test = await this.laboratoryService.updateStatus(user, id, dto);
    return { test };
  }
}
