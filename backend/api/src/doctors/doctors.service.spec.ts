import { Test, TestingModule } from '@nestjs/testing';
import { Role, type Department, type Doctor, type User } from '@prisma/client';
import { DoctorsService, DoctorWithUser, DOCTOR_PROFILE_INCLUDE } from './doctors.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ListDoctorsDto } from './dto/list-doctors.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

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
    socialLinks: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'user-1',
    departmentId: 'dept-1',
  };

  const user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'> = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: null,
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
    const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
    const patient: AuthenticatedUser = { id: 'patient-1', email: 'pat@example.com', role: Role.PATIENT };
    const insensitive = (word: string) => ({ contains: word, mode: 'insensitive' });

    it('queries with no filter, includes the profile shape, orders by rating desc and limits to 20 by default', async () => {
      prisma.doctor.findMany.mockResolvedValue([]);

      await service.listDoctors({}, admin);

      expect(prisma.doctor.findMany).toHaveBeenCalledWith({
        where: undefined,
        include: DOCTOR_PROFILE_INCLUDE,
        orderBy: { rating: 'desc' },
        take: 20,
      });
    });

    it('filters by department name and applies a custom limit in the database', async () => {
      prisma.doctor.findMany.mockResolvedValue([]);

      await service.listDoctors({ department: 'Cardiology', limit: 3 } as ListDoctorsDto, admin);

      expect(prisma.doctor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { department: { name: 'Cardiology' } }, take: 3 }),
      );
    });

    it('requires every search word to match a name, specialization or (for staff) email field', async () => {
      prisma.doctor.findMany.mockResolvedValue([]);

      await service.listDoctors({ q: '  ada   cardio ' } as ListDoctorsDto, admin);

      const fieldsFor = (word: string) => ({
        OR: [
          { user: { firstName: insensitive(word) } },
          { user: { lastName: insensitive(word) } },
          { specialization: insensitive(word) },
          { user: { email: insensitive(word) } },
        ],
      });
      expect(prisma.doctor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [fieldsFor('ada'), fieldsFor('cardio')] } }),
      );
    });

    it('combines a department filter with a search term', async () => {
      prisma.doctor.findMany.mockResolvedValue([]);

      await service.listDoctors({ department: 'Cardiology', q: 'ada' } as ListDoctorsDto, admin);

      const where = prisma.doctor.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(2);
      expect(where.AND[0]).toEqual({ department: { name: 'Cardiology' } });
    });

    it('maps each row into a DirectoryDoctorResponse with contact details for staff callers', async () => {
      prisma.doctor.findMany.mockResolvedValue([buildDoctor()]);

      const result = await service.listDoctors({}, admin);

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
          phone: null,
          socialLinks: null,
        },
      ]);
    });

    it("hides doctors' email and phone from patient callers", async () => {
      prisma.doctor.findMany.mockResolvedValue([
        buildDoctor({ user: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+15555550100' } }),
      ]);

      const [doctor] = await service.listDoctors({}, patient);

      expect(doctor).toMatchObject({ fullName: 'Ada Lovelace', email: null, phone: null });
    });

    it('does not let a patient search by email (no probing which addresses belong to staff)', async () => {
      prisma.doctor.findMany.mockResolvedValue([]);

      await service.listDoctors({ q: 'ada@example.com' } as ListDoctorsDto, patient);

      expect(JSON.stringify(prisma.doctor.findMany.mock.calls[0][0].where)).not.toContain('email');
    });
  });
});
