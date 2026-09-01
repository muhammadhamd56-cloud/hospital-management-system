import { Test, TestingModule } from '@nestjs/testing';
import type { Department, Doctor, User } from '@prisma/client';
import { DoctorsService, DoctorWithUser, DOCTOR_PROFILE_INCLUDE } from './doctors.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ListDoctorsDto } from './dto/list-doctors.dto';

function buildDoctor(overrides: Partial<DoctorWithUser> = {}): DoctorWithUser {
  const doctor: Doctor = {
    id: 'doctor-1',
    specialization: 'Cardiology',
    qualifications: null,
    bio: 'Heart specialist',
    experienceYears: 10,
    rating: 4.5,
    acceptsOnline: true,
    isAvailable: true,
    consultationFee: 0,
    appointmentDurationMinutes: 30,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'user-1',
    departmentId: 'dept-1',
  };

  const user: Pick<User, 'firstName' | 'lastName' | 'email'> = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
  };

  const department: Pick<Department, 'name'> = { name: 'Cardiology' };

  return {
    ...doctor,
    user,
    department,
    ...overrides,
  } as DoctorWithUser;
}

describe('DoctorsService', () => {
  let service: DoctorsService;
  let prisma: { doctor: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      doctor: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DoctorsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DoctorsService);
  });

  describe('listDoctors', () => {
    it('queries with no department filter, includes the profile shape, and orders by rating desc', async () => {
      prisma.doctor.findMany.mockResolvedValue([]);

      await service.listDoctors({});

      expect(prisma.doctor.findMany).toHaveBeenCalledWith({
        where: undefined,
        include: DOCTOR_PROFILE_INCLUDE,
        orderBy: { rating: 'desc' },
      });
    });

    it('filters by department name when department is provided', async () => {
      prisma.doctor.findMany.mockResolvedValue([]);

      await service.listDoctors({ department: 'Cardiology' } as ListDoctorsDto);

      expect(prisma.doctor.findMany).toHaveBeenCalledWith({
        where: { department: { name: 'Cardiology' } },
        include: DOCTOR_PROFILE_INCLUDE,
        orderBy: { rating: 'desc' },
      });
    });

    it('maps each Prisma doctor row into a DirectoryDoctorResponse', async () => {
      const doctor = buildDoctor();
      prisma.doctor.findMany.mockResolvedValue([doctor]);

      const result = await service.listDoctors({});

      expect(result).toEqual([
        {
          id: 'doctor-1',
          fullName: 'Ada Lovelace',
          specialization: 'Cardiology',
          qualifications: null,
          department: 'Cardiology',
          bio: 'Heart specialist',
          experienceYears: 10,
          rating: 4.5,
          acceptsOnline: true,
          isAvailable: true,
          consultationFee: 0,
          appointmentDurationMinutes: 30,
          email: 'ada@example.com',
        },
      ]);
    });

    it('defaults to a limit of 20 results when no limit is given', async () => {
      const doctors = Array.from({ length: 25 }, (_, i) =>
        buildDoctor({ id: `doctor-${i}`, userId: `user-${i}` }),
      );
      prisma.doctor.findMany.mockResolvedValue(doctors);

      const result = await service.listDoctors({});

      expect(result).toHaveLength(20);
    });

    it('respects a custom limit', async () => {
      const doctors = Array.from({ length: 10 }, (_, i) =>
        buildDoctor({ id: `doctor-${i}`, userId: `user-${i}` }),
      );
      prisma.doctor.findMany.mockResolvedValue(doctors);

      const result = await service.listDoctors({ limit: 3 } as ListDoctorsDto);

      expect(result).toHaveLength(3);
    });

    it('filters in-memory by full name matching the search term (case-insensitive)', async () => {
      const match = buildDoctor({
        id: 'doctor-match',
        user: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
      });
      const nonMatch = buildDoctor({
        id: 'doctor-nonmatch',
        userId: 'user-2',
        user: { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' },
      });
      prisma.doctor.findMany.mockResolvedValue([match, nonMatch]);

      const result = await service.listDoctors({ q: 'ada LOVELACE' } as ListDoctorsDto);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doctor-match');
    });

    it('filters in-memory by specialization matching the search term', async () => {
      const match = buildDoctor({ id: 'doctor-match', specialization: 'Neurology' });
      const nonMatch = buildDoctor({
        id: 'doctor-nonmatch',
        userId: 'user-2',
        specialization: 'Cardiology',
      });
      prisma.doctor.findMany.mockResolvedValue([match, nonMatch]);

      const result = await service.listDoctors({ q: 'neuro' } as ListDoctorsDto);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doctor-match');
    });

    it('filters in-memory by email matching the search term', async () => {
      const match = buildDoctor({
        id: 'doctor-match',
        user: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada.special@example.com' },
      });
      const nonMatch = buildDoctor({
        id: 'doctor-nonmatch',
        userId: 'user-2',
        user: { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' },
      });
      prisma.doctor.findMany.mockResolvedValue([match, nonMatch]);

      const result = await service.listDoctors({ q: 'ada.special' } as ListDoctorsDto);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doctor-match');
    });

    it('trims whitespace from the search term before filtering', async () => {
      const match = buildDoctor({ specialization: 'Cardiology' });
      prisma.doctor.findMany.mockResolvedValue([match]);

      const result = await service.listDoctors({ q: '  cardiology  ' } as ListDoctorsDto);

      expect(result).toHaveLength(1);
    });

    it('returns an empty array when the search term matches nothing', async () => {
      prisma.doctor.findMany.mockResolvedValue([buildDoctor()]);

      const result = await service.listDoctors({ q: 'no such doctor' } as ListDoctorsDto);

      expect(result).toEqual([]);
    });

    it('skips in-memory filtering entirely when q is not provided', async () => {
      const doctors = [buildDoctor(), buildDoctor({ id: 'doctor-2', userId: 'user-2' })];
      prisma.doctor.findMany.mockResolvedValue(doctors);

      const result = await service.listDoctors({});

      expect(result).toHaveLength(2);
    });

    it('combines a department filter, a search term, and a limit together', async () => {
      const match = buildDoctor({ id: 'doctor-match', specialization: 'Cardiology' });
      prisma.doctor.findMany.mockResolvedValue([match]);

      const result = await service.listDoctors({
        department: 'Cardiology',
        q: 'cardio',
        limit: 5,
      } as ListDoctorsDto);

      expect(prisma.doctor.findMany).toHaveBeenCalledWith({
        where: { department: { name: 'Cardiology' } },
        include: DOCTOR_PROFILE_INCLUDE,
        orderBy: { rating: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('returns an empty array when there are no doctors at all', async () => {
      prisma.doctor.findMany.mockResolvedValue([]);

      const result = await service.listDoctors({});

      expect(result).toEqual([]);
    });
  });
});
