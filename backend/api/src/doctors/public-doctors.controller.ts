import { Controller, Get, Param } from '@nestjs/common';
import { DoctorsService, PublicDoctorProfileResponse } from './doctors.service';

/** Unauthenticated: a doctor's own shareable profile link, so anyone with it can view a read-only summary. */
@Controller('public/doctors')
export class PublicDoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<{ doctor: PublicDoctorProfileResponse }> {
    const doctor = await this.doctorsService.getPublicProfile(id);
    return { doctor };
  }
}
