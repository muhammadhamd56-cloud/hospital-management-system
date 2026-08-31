import type { Notification } from '@prisma/client';

export type ClientNotificationType =
  | 'appointment_booked'
  | 'appointment_cancelled'
  | 'appointment_reminder'
  | 'chat_message'
  | 'medical_record_added'
  | 'lab_result_ready'
  | 'shift_scheduled'
  | 'shift_updated'
  | 'shift_cancelled'
  | 'shift_application_approved'
  | 'shift_application_rejected'
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_overdue'
  | 'announcement_published'
  | 'invoice_created'
  | 'payment_received';

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
  APPOINTMENT_REMINDER: 'appointment_reminder',
  CHAT_MESSAGE: 'chat_message',
  MEDICAL_RECORD_ADDED: 'medical_record_added',
  LAB_RESULT_READY: 'lab_result_ready',
  SHIFT_SCHEDULED: 'shift_scheduled',
  SHIFT_UPDATED: 'shift_updated',
  SHIFT_CANCELLED: 'shift_cancelled',
  SHIFT_APPLICATION_APPROVED: 'shift_application_approved',
  SHIFT_APPLICATION_REJECTED: 'shift_application_rejected',
  TASK_ASSIGNED: 'task_assigned',
  TASK_DUE_SOON: 'task_due_soon',
  TASK_OVERDUE: 'task_overdue',
  ANNOUNCEMENT_PUBLISHED: 'announcement_published',
  INVOICE_CREATED: 'invoice_created',
  PAYMENT_RECEIVED: 'payment_received',
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
