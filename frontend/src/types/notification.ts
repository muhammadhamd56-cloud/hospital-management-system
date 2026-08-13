export type NotificationType =
  | 'appointment_booked'
  | 'appointment_cancelled'
  | 'chat_message'
  | 'medical_record_added'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  link: string | null
  isRead: boolean
  createdAt: string
}
