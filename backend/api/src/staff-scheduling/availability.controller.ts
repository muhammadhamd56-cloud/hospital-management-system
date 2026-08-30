import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AvailabilityResponse, LeaveResponse } from './availability.mapper';
import { AvailabilityService } from './availability.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpsertAvailabilityDto } from './dto/upsert-availability.dto';

/** A staff member's recurring weekly availability plus one-off leave dates --
 *  both feed into ShiftsService's conflict detection. */
@ApiTags('Staff Scheduling')
@ApiBearerAuth()
@Controller('staff-scheduling')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @ApiOperation({ summary: "Get a staff member's weekly availability (days without a saved row default to available)" })
  @Get('availability/:staffId')
  async findForStaff(@Param('staffId') staffId: string): Promise<{ availability: AvailabilityResponse[] }> {
    const availability = await this.availabilityService.findForStaff(staffId);
    return { availability };
  }

  @ApiOperation({ summary: "Replace a staff member's weekly availability" })
  @Put('availability/:staffId')
  async upsertForStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffId') staffId: string,
    @Body() dto: UpsertAvailabilityDto,
  ): Promise<{ availability: AvailabilityResponse[] }> {
    const availability = await this.availabilityService.upsertForStaff(staffId, dto, user.id);
    return { availability };
  }

  @ApiOperation({ summary: "List a staff member's leave dates" })
  @Get('leave/:staffId')
  async listLeave(@Param('staffId') staffId: string): Promise<{ leave: LeaveResponse[] }> {
    const leave = await this.availabilityService.listLeave(staffId);
    return { leave };
  }

  @ApiOperation({ summary: 'Add a leave date for a staff member' })
  @Post('leave/:staffId')
  async createLeave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffId') staffId: string,
    @Body() dto: CreateLeaveDto,
  ): Promise<{ leave: LeaveResponse }> {
    const leave = await this.availabilityService.createLeave(staffId, dto, user.id);
    return { leave };
  }

  @ApiOperation({ summary: 'Remove a leave date' })
  @Delete('leave/:staffId/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLeave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.availabilityService.removeLeave(staffId, id, user.id);
  }
}
