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
  | 'payment_refunded'
  | 'invoice_overdue'
  | 'emergency_created'
  | 'emergency_acknowledged'
  | 'emergency_team_assigned'
  | 'emergency_status_updated'
  | 'emergency_resolved'
  | 'emergency_cancelled'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  link: string | null
  isRead: boolean
  createdAt: string
}
