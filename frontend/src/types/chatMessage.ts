export type ChatSender = 'patient' | 'doctor'

export interface ChatMessage {
  id: string
  doctorId: string
  sender: ChatSender
  body: string
  createdAt: string
}
