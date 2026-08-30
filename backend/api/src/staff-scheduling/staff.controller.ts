import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ClientStaffType, CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffResponse } from './staff.mapper';
import { StaffService } from './staff.service';

/** Admin-only staff scheduling roster -- covers every staff type, linking to
 *  an existing User where a login account already exists (Doctor, Lab
 *  Technician) instead of creating a duplicate identity. */
@ApiTags('Staff Scheduling')
@ApiBearerAuth()
@Controller('staff-scheduling/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @ApiOperation({ summary: 'List the staff scheduling roster, optionally filtered by type or department' })
  @Get()
  async findAll(
    @Query('staffType') staffType?: ClientStaffType,
    @Query('department') department?: string,
  ): Promise<{ staff: StaffResponse[] }> {
    const staff = await this.staffService.findAll({ staffType, department });
    return { staff };
  }

  @ApiOperation({ summary: 'Add a staff member to the roster (links an existing account, or a name-only entry)' })
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStaffDto,
  ): Promise<{ staff: StaffResponse }> {
    const staff = await this.staffService.create(dto, user.id);
    return { staff };
  }

  @ApiOperation({ summary: 'Update a roster entry (department, active status, or name-only profile fields)' })
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ): Promise<{ staff: StaffResponse }> {
    const staff = await this.staffService.update(id, dto, user.id);
    return { staff };
  }

  @ApiOperation({ summary: 'Remove a staff member from the roster (cascades their shifts)' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.staffService.remove(id, user.id);
  }
}
