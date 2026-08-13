import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DirectoryDoctorResponse, DoctorsService } from './doctors.service';
import { ListDoctorsDto } from './dto/list-doctors.dto';

/** Public doctor directory — any authenticated role can browse it. */
@Controller('doctors')
@UseGuards(JwtAuthGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  async findAll(@Query() query: ListDoctorsDto): Promise<{ doctors: DirectoryDoctorResponse[] }> {
    const doctors = await this.doctorsService.listDoctors(query);
    return { doctors };
  }
}
