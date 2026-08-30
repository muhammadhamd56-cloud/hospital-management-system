import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateShiftOpeningDto } from './dto/create-shift-opening.dto';
import { UpdateShiftOpeningDto } from './dto/update-shift-opening.dto';
import type { ClientStaffType } from './dto/create-staff.dto';
import { ShiftOpeningResponse } from './shift-openings.mapper';
import { ShiftOpeningsService } from './shift-openings.service';

/** Admin-only management of posted "available shift" openings. Nurses/staff
 *  browse and apply to these through staff-portal instead. */
@Controller('staff-scheduling/shift-openings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ShiftOpeningsController {
  constructor(private readonly shiftOpeningsService: ShiftOpeningsService) {}

  @Get()
  async findAll(
    @Query('isOpen') isOpen?: string,
    @Query('requiredStaffType') requiredStaffType?: ClientStaffType,
    @Query('department') department?: string,
  ): Promise<{ openings: ShiftOpeningResponse[] }> {
    const openings = await this.shiftOpeningsService.findAll({
      isOpen: isOpen === undefined ? undefined : isOpen === 'true',
      requiredStaffType,
      department,
    });
    return { openings };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<{ opening: ShiftOpeningResponse }> {
    const opening = await this.shiftOpeningsService.findOne(id);
    return { opening };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShiftOpeningDto,
  ): Promise<{ opening: ShiftOpeningResponse }> {
    const opening = await this.shiftOpeningsService.create(dto, user.id);
    return { opening };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateShiftOpeningDto,
  ): Promise<{ opening: ShiftOpeningResponse }> {
    const opening = await this.shiftOpeningsService.update(id, dto, user.id);
    return { opening };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.shiftOpeningsService.remove(id, user.id);
  }
}
