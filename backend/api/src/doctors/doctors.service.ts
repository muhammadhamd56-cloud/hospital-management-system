import { Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, Role, type Department, type Doctor, type Prisma, type User } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
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

  /**
   * Staff roles get the internal directory, contact details included.
   * Patients get the same listing without doctors' email and phone -- the
   * same fields the public profile omits -- and can't search by email, so
   * the directory can't be used to harvest or probe staff contact details.
   * Filtering and the limit run in the database rather than over the
   * whole doctors table in memory.
   */
  async listDoctors(query: ListDoctorsDto, caller: AuthenticatedUser): Promise<DirectoryDoctorResponse[]> {
    const showContacts = caller.role !== Role.PATIENT;
    // Every word must match some field, so "ada cardio" finds Dr. Ada in Cardiology.
    const words = query.q?.trim().split(/\s+/).filter(Boolean) ?? [];
    const contains = (word: string) => ({ contains: word, mode: 'insensitive' as const });

    const filters: Prisma.DoctorWhereInput[] = [];
    // A doctor nobody has vetted yet isn't offered to anyone but admins.
    if (caller.role !== Role.ADMIN) {
      filters.push({ user: { approvalStatus: ApprovalStatus.APPROVED } });
    }
    if (query.department) {
      filters.push({ department: { name: query.department } });
    }
    for (const word of words) {
      filters.push({
        OR: [
          { user: { firstName: contains(word) } },
          { user: { lastName: contains(word) } },
          { specialization: contains(word) },
          ...(showContacts ? [{ user: { email: contains(word) } }] : []),
        ],
      });
    }

    const doctors = await this.prisma.doctor.findMany({
      where: filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { AND: filters },
      include: DOCTOR_PROFILE_INCLUDE,
      orderBy: { rating: 'desc' },
      take: query.limit ?? 20,
    });

    return doctors.map((doctor) => {
      const directory = toDirectoryDoctor(doctor);
      return showContacts ? directory : { ...directory, email: null, phone: null };
    });
  }

  /** Unauthenticated: backs the doctor's shareable public profile link. */
  async getPublicProfile(id: string): Promise<PublicDoctorProfileResponse> {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id, user: { approvalStatus: ApprovalStatus.APPROVED } },
      include: DOCTOR_PROFILE_INCLUDE,
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    return toPublicDoctorProfile(doctor);
  }
}
