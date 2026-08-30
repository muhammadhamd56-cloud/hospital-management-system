import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ShiftsService } from '../staff-scheduling/shifts.service';
import type { ClientShiftStatus } from '../staff-scheduling/dto/create-shift.dto';
import { ShiftOpeningsService } from '../staff-scheduling/shift-openings.service';
import { ShiftApplicationsService } from '../staff-scheduling/shift-applications.service';
import { ApplyShiftDto } from '../staff-scheduling/dto/apply-shift.dto';
import { TasksService } from '../staff-scheduling/tasks.service';
import { UpdateTaskStatusDto } from '../staff-scheduling/dto/update-task-status.dto';
import type { TaskDisplayStatus } from '../staff-scheduling/tasks.mapper';
import { toClientStaffType } from '../staff-scheduling/staff.mapper';
import { StaffPortalService } from './staff-portal.service';

/**
 * Self-service endpoints for the logged-in staff member -- nurse,
 * receptionist, pharmacist, lab technician, or any other non-doctor staff
 * type, all sharing the general STAFF role. Every method resolves the
 * caller's own Staff row from their JWT user id -- nothing here ever trusts
 * a client-supplied staffId, so one staff member can never reach another's
 * shifts, applications, or tasks by guessing an id.
 */
@Controller('staff-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STAFF)
export class StaffPortalController {
  constructor(
    private readonly staffPortalService: StaffPortalService,
    private readonly shiftsService: ShiftsService,
    private readonly shiftOpeningsService: ShiftOpeningsService,
    private readonly shiftApplicationsService: ShiftApplicationsService,
    private readonly tasksService: TasksService,
  ) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.staffPortalService.getProfile(user.id);
    return { profile };
  }

  @Get('shifts')
  async getMyShifts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ClientShiftStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const staff = await this.staffPortalService.requireLinkedStaff(user.id);
    const shifts = await this.shiftsService.findAll({ staffId: staff.id, status, dateFrom, dateTo });
    return { shifts };
  }

  @Get('shift-openings')
  async getAvailableShifts(@CurrentUser() user: AuthenticatedUser) {
    const staff = await this.staffPortalService.requireLinkedStaff(user.id);
    const openings = await this.shiftOpeningsService.findAvailableForStaff(staff.id, toClientStaffType(staff.staffType));
    return { openings };
  }

  @Post('shift-openings/:id/apply')
  async applyToShift(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') openingId: string,
    @Body() dto: ApplyShiftDto,
  ) {
    const application = await this.shiftApplicationsService.apply(user.id, openingId, dto);
    return { application };
  }

  @Get('shift-applications')
  async getMyApplications(@CurrentUser() user: AuthenticatedUser) {
    const applications = await this.shiftApplicationsService.listMine(user.id);
    return { applications };
  }

  @Delete('shift-applications/:id')
  async withdrawApplication(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const application = await this.shiftApplicationsService.withdraw(user.id, id);
    return { application };
  }

  @Get('tasks')
  async getMyTasks(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: TaskDisplayStatus) {
    const tasks = await this.tasksService.findMine(user.id, { status });
    return { tasks };
  }

  @Patch('tasks/:id/status')
  async updateTaskStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    const task = await this.tasksService.updateStatusAsOwner(user.id, id, dto);
    return { task };
  }
}
