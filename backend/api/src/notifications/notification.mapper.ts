import type { Notification } from '@prisma/client';

export type ClientNotificationType =
  | 'appointment_booked'
  | 'appointment_cancelled'
  | 'chat_message'
  | 'medical_record_added';

export interface NotificationResponse {
  id: string;
  type: ClientNotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_TO_CLIENT: Record<Notification['type'], ClientNotificationType> = {
  APPOINTMENT_BOOKED: 'appointment_booked',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  CHAT_MESSAGE: 'chat_message',
  MEDICAL_RECORD_ADDED: 'medical_record_added',
};

export function toNotificationResponse(notification: Notification): NotificationResponse {
  return {
    id: notification.id,
    type: TYPE_TO_CLIENT[notification.type],
    title: notification.title,
    body: notification.body,
    link: notification.link,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
  };
}
