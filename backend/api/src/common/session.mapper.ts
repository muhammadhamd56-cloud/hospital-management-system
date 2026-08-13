import { AppointmentMode, AppointmentStatus, ChatSender } from '@prisma/client';

export type ClientSessionMode = 'online' | 'in-person';
export type ClientSessionStatus = 'scheduled' | 'completed' | 'cancelled';
export type ClientChatSender = 'patient' | 'doctor';

export function toClientMode(mode: AppointmentMode): ClientSessionMode {
  return mode === AppointmentMode.ONLINE ? 'online' : 'in-person';
}

export function toPrismaMode(mode: ClientSessionMode): AppointmentMode {
  return mode === 'online' ? AppointmentMode.ONLINE : AppointmentMode.IN_PERSON;
}

export function toClientStatus(status: AppointmentStatus): ClientSessionStatus {
  return status.toLowerCase() as ClientSessionStatus;
}

export function toClientSender(sender: ChatSender): ClientChatSender {
  return sender === ChatSender.PATIENT ? 'patient' : 'doctor';
}
