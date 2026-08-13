import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { SendMessageDto } from '../chat/dto/send-message.dto';
import { CreateMedicalRecordDto } from '../medical-records/dto/create-medical-record.dto';
import { DoctorPortalService } from './doctor-portal.service';
import { DoctorAvailabilityDto } from './dto/doctor-availability.dto';
import { DoctorProfileDto } from './dto/doctor-profile.dto';

/** Self-service endpoints for the logged-in doctor: profile, availability, their appointments, their inbox. */
@Controller('doctor-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
export class DoctorPortalController {
  constructor(private readonly doctorPortalService: DoctorPortalService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.doctorPortalService.getProfile(user.id);
    return { profile };
  }

  @Put('profile')
  async upsertProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: DoctorProfileDto) {
    const profile = await this.doctorPortalService.upsertProfile(user.id, dto);
    return { profile };
  }

  @Patch('availability')
  async setAvailability(@CurrentUser() user: AuthenticatedUser, @Body() dto: DoctorAvailabilityDto) {
    const profile = await this.doctorPortalService.setAvailability(user.id, dto.isAvailable);
    return { profile };
  }

  @Get('appointments')
  async listAppointments(@CurrentUser() user: AuthenticatedUser) {
    const appointments = await this.doctorPortalService.listAppointments(user.id);
    return { appointments };
  }

  @Patch('appointments/:id/cancel')
  async cancelAppointment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const appointment = await this.doctorPortalService.cancelAppointment(user.id, id);
    return { appointment };
  }

  @Patch('appointments/:id/complete')
  async completeAppointment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const appointment = await this.doctorPortalService.completeAppointment(user.id, id);
    return { appointment };
  }

  @Get('chat')
  async listInbox(@CurrentUser() user: AuthenticatedUser) {
    const patients = await this.doctorPortalService.listInboxPatients(user.id);
    return { patients };
  }

  @Get('chat/:patientId')
  async getThread(@CurrentUser() user: AuthenticatedUser, @Param('patientId') patientId: string) {
    const thread = await this.doctorPortalService.getThread(user.id, patientId);
    return { thread };
  }

  @Post('chat/:patientId')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Body() dto: SendMessageDto,
  ) {
    const thread = await this.doctorPortalService.sendMessage(user.id, patientId, dto.body);
    return { thread };
  }

  @Get('patients/:patientId/medical-records')
  async listPatientMedicalRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
  ) {
    const records = await this.doctorPortalService.listPatientMedicalRecords(user.id, patientId);
    return { records };
  }

  @Post('patients/:patientId/medical-records')
  async addMedicalRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Body() dto: CreateMedicalRecordDto,
  ) {
    const record = await this.doctorPortalService.addMedicalRecord(user.id, patientId, dto);
    return { record };
  }
}
