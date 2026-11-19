import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { RespondShiftApplicationDto } from './dto/respond-shift-application.dto';
import { ShiftApplicationResponse } from './shift-applications.mapper';
import { ShiftApplicationsService } from './shift-applications.service';
import { ListShiftApplicationsQueryDto } from './dto/list-queries.dto';

/** Admin-only review of shift applications. Nurses/staff submit and track
 *  their own through staff-portal, which shares this same service. */
@Controller('staff-scheduling/shift-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ShiftApplicationsController {
  constructor(private readonly shiftApplicationsService: ShiftApplicationsService) {}

  @Get()
  async findAll(@Query() query: ListShiftApplicationsQueryDto): Promise<{ applications: ShiftApplicationResponse[] }> {
    const { openingId, staffId, status } = query;
    const applications = await this.shiftApplicationsService.listAll({ openingId, staffId, status });
    return { applications };
  }

  @Patch(':id')
  async respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RespondShiftApplicationDto,
  ): Promise<{ application: ShiftApplicationResponse }> {
    const application = await this.shiftApplicationsService.respond(id, dto, user.id);
    return { application };
  }
}
