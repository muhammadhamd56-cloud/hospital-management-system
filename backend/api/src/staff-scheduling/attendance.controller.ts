import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AttendanceResponse } from './attendance.mapper';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

/** Simple, database-driven attendance tracking tied 1:1 to a shift -- no
 *  biometric integration. */
@ApiTags('Staff Scheduling')
@ApiBearerAuth()
@Controller('staff-scheduling/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @ApiOperation({ summary: 'List attendance records, optionally filtered by staff or date range' })
  @Get()
  async findAll(
    @Query('staffId') staffId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<{ attendance: AttendanceResponse[] }> {
    const attendance = await this.attendanceService.findAll({ staffId, dateFrom, dateTo });
    return { attendance };
  }

  @ApiOperation({ summary: 'Record attendance for a shift (409 if one already exists for that shift)' })
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAttendanceDto,
  ): Promise<{ attendance: AttendanceResponse }> {
    const attendance = await this.attendanceService.create(dto, user.id);
    return { attendance };
  }

  @ApiOperation({ summary: 'Update an attendance record' })
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
  ): Promise<{ attendance: AttendanceResponse }> {
    const attendance = await this.attendanceService.update(id, dto, user.id);
    return { attendance };
  }
}
