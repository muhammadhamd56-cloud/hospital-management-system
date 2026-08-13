import type { ChatMessage } from '@prisma/client';
import { toClientSender } from '../common/session.mapper';

export interface ChatMessageResponse {
  id: string;
  doctorId: string;
  sender: 'patient' | 'doctor';
  body: string;
  createdAt: string;
}

export function toChatMessageResponse(message: ChatMessage): ChatMessageResponse {
  return {
    id: message.id,
    doctorId: message.doctorId,
    sender: toClientSender(message.sender),
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}
