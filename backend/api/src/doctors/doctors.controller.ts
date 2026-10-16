import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DirectoryDoctorResponse, DoctorsService } from './doctors.service';
import { ListDoctorsDto } from './dto/list-doctors.dto';

/** Doctor directory — any authenticated role can browse it (patients without contact details). */
@Controller('doctors')
@UseGuards(JwtAuthGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDoctorsDto,
  ): Promise<{ doctors: DirectoryDoctorResponse[] }> {
    const doctors = await this.doctorsService.listDoctors(query, user);
    return { doctors };
  }
}
