import { Injectable, NotFoundException } from '@nestjs/common';
import type { Department, Doctor, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListDoctorsDto } from './dto/list-doctors.dto';

export interface SocialLinks {
  website?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
}

export interface DirectoryDoctorResponse {
  id: string;
  fullName: string;
  specialization: string;
  qualifications: string | null;
  department: string;
  bio: string;
  experienceYears: number;
  rating: number;
  acceptsOnline: boolean;
  isAvailable: boolean;
  consultationFee: number;
  appointmentDurationMinutes: number;
  email: string | null;
  phone: string | null;
  socialLinks: SocialLinks | null;
}

/** The subset of a doctor's profile safe to expose on an unauthenticated, shareable link -- no email or phone. */
export type PublicDoctorProfileResponse = Omit<DirectoryDoctorResponse, 'email' | 'phone'>;

export type DoctorWithUser = Doctor & {
  user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>;
  department: Pick<Department, 'name'>;
};

function toSocialLinks(value: Doctor['socialLinks']): SocialLinks | null {
  return (value as SocialLinks | null) ?? null;
}

export function toDirectoryDoctor(doctor: DoctorWithUser): DirectoryDoctorResponse {
  return {
    id: doctor.id,
    fullName: `${doctor.user.firstName} ${doctor.user.lastName}`.trim(),
    specialization: doctor.specialization,
    qualifications: doctor.qualifications,
    department: doctor.department.name,
    bio: doctor.bio,
    experienceYears: doctor.experienceYears,
    rating: doctor.rating,
    acceptsOnline: doctor.acceptsOnline,
    isAvailable: doctor.isAvailable,
    consultationFee: doctor.consultationFee,
    appointmentDurationMinutes: doctor.appointmentDurationMinutes,
    email: doctor.user.email,
    phone: doctor.user.phone,
    socialLinks: toSocialLinks(doctor.socialLinks),
  };
}

export function toPublicDoctorProfile(doctor: DoctorWithUser): PublicDoctorProfileResponse {
  const directory = toDirectoryDoctor(doctor);
  return {
    id: directory.id,
    fullName: directory.fullName,
    specialization: directory.specialization,
    qualifications: directory.qualifications,
    department: directory.department,
    bio: directory.bio,
    experienceYears: directory.experienceYears,
    rating: directory.rating,
    acceptsOnline: directory.acceptsOnline,
    isAvailable: directory.isAvailable,
    consultationFee: directory.consultationFee,
    appointmentDurationMinutes: directory.appointmentDurationMinutes,
    socialLinks: directory.socialLinks,
  };
}

export const DOCTOR_USER_SELECT = { firstName: true, lastName: true, email: true, phone: true } as const;

/** Include shape for anywhere a Doctor is fetched and mapped via toDirectoryDoctor(). */
export const DOCTOR_PROFILE_INCLUDE = {
  user: { select: DOCTOR_USER_SELECT },
  department: { select: { name: true } },
} as const;

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDoctors(query: ListDoctorsDto): Promise<DirectoryDoctorResponse[]> {
    const doctors = await this.prisma.doctor.findMany({
      where: query.department ? { department: { name: query.department } } : undefined,
      include: DOCTOR_PROFILE_INCLUDE,
      orderBy: { rating: 'desc' },
    });

    const needle = query.q?.trim().toLowerCase();
    const filtered = needle
      ? doctors.filter((doctor) => {
          const fullName = `${doctor.user.firstName} ${doctor.user.lastName}`.toLowerCase();
          return (
            fullName.includes(needle) ||
            doctor.specialization.toLowerCase().includes(needle) ||
            doctor.user.email.toLowerCase().includes(needle)
          );
        })
      : doctors;

    return filtered.slice(0, query.limit ?? 20).map(toDirectoryDoctor);
  }

  /** Unauthenticated: backs the doctor's shareable public profile link. */
  async getPublicProfile(id: string): Promise<PublicDoctorProfileResponse> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: DOCTOR_PROFILE_INCLUDE,
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    return toPublicDoctorProfile(doctor);
  }
}
