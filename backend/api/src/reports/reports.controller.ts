import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  DepartmentCountResponse,
  MonthlyRevenueResponse,
  ReportsService,
  StatusCountResponse,
} from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue-trend')
  async revenueTrend(): Promise<{ data: MonthlyRevenueResponse[] }> {
    return { data: await this.reportsService.revenueTrend() };
  }

  @Get('appointments-by-department')
  async appointmentsByDepartment(): Promise<{ data: DepartmentCountResponse[] }> {
    return { data: await this.reportsService.appointmentsByDepartment() };
  }

  @Get('appointments-by-status')
  async appointmentsByStatus(): Promise<{ data: StatusCountResponse[] }> {
    return { data: await this.reportsService.appointmentsByStatus() };
  }
}
