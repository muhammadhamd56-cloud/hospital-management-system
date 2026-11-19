import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BedListResponse, BedResponse, BedsService } from './beds.service';
import { AssignBedDto } from './dto/assign-bed.dto';

@Controller('beds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DOCTOR)
export class BedsController {
  constructor(private readonly bedsService: BedsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<BedListResponse> {
    return this.bedsService.findAll(user);
  }

  @Patch(':id/assign')
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignBedDto,
  ): Promise<{ bed: BedResponse }> {
    const bed = await this.bedsService.assign(user, id, dto.patientId);
    return { bed };
  }

  @Patch(':id/release')
  async release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<{ bed: BedResponse }> {
    const bed = await this.bedsService.release(user, id);
    return { bed };
  }
}
