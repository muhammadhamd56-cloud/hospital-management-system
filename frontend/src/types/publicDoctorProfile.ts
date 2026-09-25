import type { DirectoryDoctor } from '@/types/directoryDoctor'

/** What the unauthenticated, shareable profile link returns -- no email or phone. */
export type PublicDoctorProfile = Omit<DirectoryDoctor, 'email' | 'phone'>
