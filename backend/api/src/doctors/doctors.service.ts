import { Injectable } from '@nestjs/common';
import type { Department, Doctor, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListDoctorsDto } from './dto/list-doctors.dto';

export interface DirectoryDoctorResponse {
  id: string;
  fullName: string;
  specialization: string;
  department: string;
  bio: string;
  experienceYears: number;
  rating: number;
  acceptsOnline: boolean;
  isAvailable: boolean;
  email: string | null;
}

export type DoctorWithUser = Doctor & {
  user: Pick<User, 'firstName' | 'lastName' | 'email'>;
  department: Pick<Department, 'name'>;
};

export function toDirectoryDoctor(doctor: DoctorWithUser): DirectoryDoctorResponse {
  return {
    id: doctor.id,
    fullName: `${doctor.user.firstName} ${doctor.user.lastName}`.trim(),
    specialization: doctor.specialization,
    department: doctor.department.name,
    bio: doctor.bio,
    experienceYears: doctor.experienceYears,
    rating: doctor.rating,
    acceptsOnline: doctor.acceptsOnline,
    isAvailable: doctor.isAvailable,
    email: doctor.user.email,
  };
}

export const DOCTOR_USER_SELECT = { firstName: true, lastName: true, email: true } as const;

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
}
