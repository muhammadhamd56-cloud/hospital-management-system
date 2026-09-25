import { api } from '@/lib/apiClient'
import type { PublicDoctorProfile } from '@/types/publicDoctorProfile'

/** Unauthenticated -- backs a doctor's shareable profile link. */
export function getPublicDoctorProfile(id: string): Promise<{ doctor: PublicDoctorProfile }> {
  return api.get(`/public/doctors/${id}`)
}
