import { api } from '@/lib/apiClient'
import type { DoctorAppointment } from '@/types/doctorSession'
import type { DoctorInboxPatient } from '@/types/doctorChatInbox'
import type { ChatMessage } from '@/types/chatMessage'
import type { DirectoryDoctor } from '@/types/directoryDoctor'
import type { SocialLinks } from '@/types/socialLinks'

export function listDoctorAppointments(): Promise<{ appointments: DoctorAppointment[] }> {
  return api.get('/doctor-portal/appointments')
}

export function cancelDoctorAppointment(id: string): Promise<{ appointment: DoctorAppointment }> {
  return api.patch(`/doctor-portal/appointments/${id}/cancel`)
}

export function completeDoctorAppointment(id: string): Promise<{ appointment: DoctorAppointment }> {
  return api.patch(`/doctor-portal/appointments/${id}/complete`)
}

export function listInboxPatients(): Promise<{ patients: DoctorInboxPatient[] }> {
  return api.get('/doctor-portal/chat')
}

export function getDoctorChatThread(patientId: string): Promise<{ thread: ChatMessage[] }> {
  return api.get(`/doctor-portal/chat/${patientId}`)
}

export interface SendChatMessageInput {
  body?: string
  imageUrl?: string
}

export function sendDoctorChatMessage(
  patientId: string,
  input: SendChatMessageInput,
): Promise<{ thread: ChatMessage[] }> {
  return api.post(`/doctor-portal/chat/${patientId}`, input)
}

export function getDoctorProfile(): Promise<{ profile: DirectoryDoctor | null }> {
  return api.get('/doctor-portal/profile')
}

export interface DoctorProfileInput {
  specialization: string
  qualifications?: string
  department: string
  bio: string
  experienceYears: number
  consultationFee: number
  appointmentDurationMinutes: number
  socialLinks?: SocialLinks
}

export function upsertDoctorProfile(
  input: DoctorProfileInput,
): Promise<{ profile: DirectoryDoctor }> {
  return api.put('/doctor-portal/profile', input)
}

export function setDoctorAvailability(
  isAvailable: boolean,
): Promise<{ profile: DirectoryDoctor }> {
  return api.patch('/doctor-portal/availability', { isAvailable })
}
