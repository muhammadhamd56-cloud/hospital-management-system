import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ClientShiftStatus, CreateShiftDto } from './dto/create-shift.dto';
import { CreateRecurringShiftDto } from './dto/create-recurring-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { ShiftResponse } from './shifts.mapper';
import { ShiftsService } from './shifts.service';

/** Admin-only shift schedule covering every staff type. Conflict detection
 *  (overlapping shifts, invalid staff/department/time) is enforced entirely
 *  server-side in ShiftsService -- never rely on frontend validation alone. */
@ApiTags('Staff Scheduling')
@ApiBearerAuth()
@Controller('staff-scheduling/shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @ApiOperation({ summary: 'List shifts, optionally filtered by staff, department, status, or date range' })
  @Get()
  async findAll(
    @Query('staffId') staffId?: string,
    @Query('department') department?: string,
    @Query('status') status?: ClientShiftStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<{ shifts: ShiftResponse[] }> {
    const shifts = await this.shiftsService.findAll({ staffId, department, status, dateFrom, dateTo });
    return { shifts };
  }

  @ApiOperation({ summary: 'Get a single shift by id' })
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<{ shift: ShiftResponse }> {
    const shift = await this.shiftsService.findOne(id);
    return { shift };
  }

  @ApiOperation({ summary: 'Schedule a shift -- rejected with 409 if it overlaps an existing one for the same staff member' })
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShiftDto,
  ): Promise<{ shift: ShiftResponse }> {
    const shift = await this.shiftsService.create(dto, user.id);
    return { shift };
  }

  @ApiOperation({
    summary: 'Generate one shift per occurrence (all-or-nothing -- if any occurrence would conflict, none are created)',
  })
  @Post('recurring')
  async createRecurring(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRecurringShiftDto,
  ): Promise<{ shifts: ShiftResponse[] }> {
    const shifts = await this.shiftsService.createRecurring(dto, user.id);
    return { shifts };
  }

  @ApiOperation({ summary: 'Update a shift (re-validates conflicts when staff/time actually change)' })
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateShiftDto,
  ): Promise<{ shift: ShiftResponse }> {
    const shift = await this.shiftsService.update(id, dto, user.id);
    return { shift };
  }

  @ApiOperation({ summary: 'Delete a shift -- only allowed while it is still Scheduled; cancel it otherwise' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.shiftsService.remove(id, user.id);
  }
}
