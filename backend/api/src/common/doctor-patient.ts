import type { PrismaService } from '../prisma/prisma.service';

/**
 * A doctor "has" a patient once there's an appointment or chat message
 * between them -- the same rule DoctorPortalService.assertRelationship,
 * PatientsService and BillingService apply. Doctor accounts can be
 * self-registered, so this relationship, not the DOCTOR role alone, is what
 * gates access to a patient's data and care actions.
 */
export async function doctorPatientIds(prisma: PrismaService, doctorId: string): Promise<string[]> {
  const [fromAppointments, fromMessages] = await Promise.all([
    prisma.appointment.findMany({ where: { doctorId }, select: { patientId: true }, distinct: ['patientId'] }),
    prisma.chatMessage.findMany({ where: { doctorId }, select: { patientId: true }, distinct: ['patientId'] }),
  ]);

  return [...new Set([...fromAppointments, ...fromMessages].map((row) => row.patientId))];
}

export async function doctorHasPatient(prisma: PrismaService, doctorId: string, patientId: string): Promise<boolean> {
  const [appointment, message] = await Promise.all([
    prisma.appointment.findFirst({ where: { doctorId, patientId }, select: { id: true } }),
    prisma.chatMessage.findFirst({ where: { doctorId, patientId }, select: { id: true } }),
  ]);

  return Boolean(appointment || message);
}
