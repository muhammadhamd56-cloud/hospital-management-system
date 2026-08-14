import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AppointmentsService } from './appointments.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import type { AdminAppointmentResponse, PatientAppointmentResponse } from './appointment.mapper';

/** Patient-side booking. Doctor-side appointment management lives in doctor-portal/. */
@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /** Admin/front-desk-wide view across all doctors/patients — overrides the class-level PATIENT-only role. */
  @Get()
  @Roles(Role.ADMIN, Role.RECEPTIONIST)
  async findAllForAdmin(): Promise<{ appointments: AdminAppointmentResponse[] }> {
    const appointments = await this.appointmentsService.findAllForAdmin();
    return { appointments };
  }

  @Get('me')
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ appointments: PatientAppointmentResponse[] }> {
    const appointments = await this.appointmentsService.listMine(user.id);
    return { appointments };
  }

  @Post()
  async book(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BookAppointmentDto,
  ): Promise<{ appointment: PatientAppointmentResponse }> {
    const appointment = await this.appointmentsService.book(user.id, dto);
    return { appointment };
  }

  @Patch(':id/cancel')
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ appointment: PatientAppointmentResponse }> {
    const appointment = await this.appointmentsService.cancel(user.id, id);
    return { appointment };
  }
}
