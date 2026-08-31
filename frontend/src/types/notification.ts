export type NotificationType =
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
  | 'payment_received'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  link: string | null
  isRead: boolean
  createdAt: string
}
