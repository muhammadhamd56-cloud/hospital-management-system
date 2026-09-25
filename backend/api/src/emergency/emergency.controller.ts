import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AddEmergencyNoteDto } from './dto/add-emergency-note.dto';
import { AssignEmergencyDto } from './dto/assign-emergency.dto';
import { CancelEmergencyDto } from './dto/cancel-emergency.dto';
import { CreateEmergencyDto } from './dto/create-emergency.dto';
import { ListEmergenciesDto } from './dto/list-emergencies.dto';
import { ShareLocationDto } from './dto/share-location.dto';
import { UpdateEmergencyDetailsDto } from './dto/update-emergency-details.dto';
import { UpdateEmergencyPriorityDto } from './dto/update-emergency-priority.dto';
import { UpdateEmergencyStatusDto } from './dto/update-emergency-status.dto';
import { EmergencyService } from './emergency.service';
import type { AssignableNurse, EmergencyCaseDetail, EmergencyCaseSummary } from './emergency.mapper';

/** "Hospital Emergency Request" only -- never presented as ambulance dispatch
 *  or contact with an external emergency service. See EmergencyCase's doc
 *  comment in schema.prisma. */
@Controller('emergency')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @Post()
  @Roles(Role.PATIENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmergencyDto,
  ): Promise<{ emergencyCase: EmergencyCaseSummary }> {
    const emergencyCase = await this.emergencyService.create(user, dto);
    return { emergencyCase };
  }

  @Get('my')
  @Roles(Role.PATIENT)
  async listMine(@CurrentUser() user: AuthenticatedUser): Promise<{ emergencyCases: EmergencyCaseSummary[] }> {
    const emergencyCases = await this.emergencyService.listMine(user);
    return { emergencyCases };
  }

  @Get()
  @Roles(Role.ADMIN, Role.DOCTOR, Role.STAFF)
  async listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEmergenciesDto,
  ): Promise<{ emergencyCases: EmergencyCaseSummary[] }> {
    const emergencyCases = await this.emergencyService.listAll(user, query);
    return { emergencyCases };
  }

  @Get('analytics')
  @Roles(Role.ADMIN)
  analytics(@CurrentUser() user: AuthenticatedUser) {
    return this.emergencyService.analytics(user);
  }

  @Get('assignable-nurses')
  @Roles(Role.ADMIN, Role.DOCTOR)
  async listAssignableNurses(@CurrentUser() user: AuthenticatedUser): Promise<{ nurses: AssignableNurse[] }> {
    const nurses = await this.emergencyService.listAssignableNurses(user);
    return { nurses };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ emergencyCase: EmergencyCaseDetail }> {
    const emergencyCase = await this.emergencyService.findOne(user, id);
    return { emergencyCase };
  }

  @Patch(':id/details')
  @Roles(Role.PATIENT)
  async updateDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmergencyDetailsDto,
  ): Promise<{ emergencyCase: EmergencyCaseSummary }> {
    const emergencyCase = await this.emergencyService.updateDetails(user, id, dto);
    return { emergencyCase };
  }

  @Patch(':id/location')
  @Roles(Role.PATIENT)
  async shareLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ShareLocationDto,
  ): Promise<{ emergencyCase: EmergencyCaseSummary }> {
    const emergencyCase = await this.emergencyService.shareLocation(user, id, dto);
    return { emergencyCase };
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.DOCTOR, Role.STAFF)
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmergencyStatusDto,
  ): Promise<{ emergencyCase: EmergencyCaseSummary }> {
    const emergencyCase = await this.emergencyService.updateStatus(user, id, dto);
    return { emergencyCase };
  }

  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.DOCTOR)
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignEmergencyDto,
  ): Promise<{ emergencyCase: EmergencyCaseSummary }> {
    const emergencyCase = await this.emergencyService.assign(user, id, dto);
    return { emergencyCase };
  }

  @Patch(':id/priority')
  @Roles(Role.ADMIN, Role.DOCTOR)
  async updatePriority(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmergencyPriorityDto,
  ): Promise<{ emergencyCase: EmergencyCaseSummary }> {
    const emergencyCase = await this.emergencyService.updatePriority(user, id, dto);
    return { emergencyCase };
  }

  @Post(':id/notes')
  @Roles(Role.ADMIN, Role.DOCTOR, Role.STAFF)
  async addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddEmergencyNoteDto,
  ): Promise<{ emergencyCase: EmergencyCaseDetail }> {
    const emergencyCase = await this.emergencyService.addNote(user, id, dto);
    return { emergencyCase };
  }

  @Post(':id/cancel')
  @Roles(Role.PATIENT, Role.ADMIN)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelEmergencyDto,
  ): Promise<{ emergencyCase: EmergencyCaseSummary }> {
    const emergencyCase = await this.emergencyService.cancel(user, id, dto);
    return { emergencyCase };
  }
}
