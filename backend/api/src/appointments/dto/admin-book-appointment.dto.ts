import { IsString, MinLength } from 'class-validator';
import { BookAppointmentDto } from './book-appointment.dto';

/** Same as BookAppointmentDto, plus the patient it's being booked for -- used
 *  by the admin-only booking endpoint (front-desk intake has no self-service
 *  patient session to infer the patient from). */
export class AdminBookAppointmentDto extends BookAppointmentDto {
  @IsString()
  @MinLength(1, { message: 'Patient is required' })
  patientId!: string;
}
