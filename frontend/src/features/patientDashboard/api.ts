import { api } from '@/lib/apiClient'
import type { DirectoryDoctor } from '@/types/directoryDoctor'
import type { PatientAppointment, SessionMode } from '@/types/patientSession'
import type { ChatMessage } from '@/types/chatMessage'

export interface ListDoctorsParams {
  q?: string
  department?: string
  limit?: number
}

export function listDoctors(params: ListDoctorsParams = {}): Promise<{ doctors: DirectoryDoctor[] }> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.department) query.set('department', params.department)
  if (params.limit) query.set('limit', String(params.limit))
  const qs = query.toString()

  return api.get(`/doctors${qs ? `?${qs}` : ''}`)
}

export function listMyAppointments(): Promise<{ appointments: PatientAppointment[] }> {
  return api.get('/appointments/me')
}

export interface BookAppointmentInput {
  doctorId: string
  scheduledAt: string
  mode: SessionMode
  reason: string
}

export function bookAppointment(
  input: BookAppointmentInput,
): Promise<{ appointment: PatientAppointment }> {
  return api.post('/appointments', input)
}

export function cancelAppointment(id: string): Promise<{ appointment: PatientAppointment }> {
  return api.patch(`/appointments/${id}/cancel`)
}

export function getChatThread(doctorId: string): Promise<{ thread: ChatMessage[] }> {
  return api.get(`/chat/${doctorId}`)
}

export function sendChatMessage(doctorId: string, body: string): Promise<{ thread: ChatMessage[] }> {
  return api.post(`/chat/${doctorId}`, { body })
}

export interface ChatInboxDoctor {
  doctorId: string
  doctorName: string
  specialization: string
}

/** Doctors the patient has an appointment or an existing message thread with. */
export function listChatInbox(): Promise<{ doctors: ChatInboxDoctor[] }> {
  return api.get('/chat')
}
