import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BedListResponse, BedResponse, BedsService } from './beds.service';
import { AssignBedDto } from './dto/assign-bed.dto';

@Controller('beds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BedsController {
  constructor(private readonly bedsService: BedsService) {}

  @Get()
  findAll(): Promise<BedListResponse> {
    return this.bedsService.findAll();
  }

  @Patch(':id/assign')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignBedDto,
  ): Promise<{ bed: BedResponse }> {
    const bed = await this.bedsService.assign(id, dto.patientId);
    return { bed };
  }

  @Patch(':id/release')
  async release(@Param('id') id: string): Promise<{ bed: BedResponse }> {
    const bed = await this.bedsService.release(id);
    return { bed };
  }
}
