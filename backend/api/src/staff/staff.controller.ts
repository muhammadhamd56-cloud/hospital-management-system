import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffResponse } from './staff.mapper';
import { CreateStaffResult, StaffService } from './staff.service';

/** Admin-only staff directory + provisioning (doctor/staff). */
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  async findAll(): Promise<{ staff: StaffResponse[] }> {
    const staff = await this.staffService.findAll();
    return { staff };
  }

  @Post()
  async create(@Body() dto: CreateStaffDto): Promise<CreateStaffResult> {
    return this.staffService.create(dto);
  }
}
