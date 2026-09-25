export type ChatSender = 'patient' | 'doctor'

export interface ChatMessage {
  id: string
  doctorId: string
  sender: ChatSender
  body: string
  imageUrl: string | null
  createdAt: string
}
