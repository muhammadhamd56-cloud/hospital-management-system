import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentStatus } from '@prisma/client';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: { invoice: { findMany: jest.Mock }; appointment: { findMany: jest.Mock } };
  let billingService: { monthlyRevenueTrend: jest.Mock };

  beforeEach(async () => {
    prisma = {
      invoice: { findMany: jest.fn() },
      appointment: { findMany: jest.fn() },
    };
    billingService = { monthlyRevenueTrend: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BillingService, useValue: billingService },
      ],
    }).compile();

    service = module.get(ReportsService);

    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('revenueTrend', () => {
    it('delegates to BillingService.monthlyRevenueTrend for 6 months, so it can never disagree with the revenue cards', async () => {
      const trend = [
        { month: 'Jan', revenue: 0 },
        { month: 'Feb', revenue: 0 },
        { month: 'Mar', revenue: 150 },
        { month: 'Apr', revenue: 0 },
        { month: 'May', revenue: 0 },
        { month: 'Jun', revenue: 200 },
      ];
      billingService.monthlyRevenueTrend.mockResolvedValue(trend);

      const result = await service.revenueTrend();

      expect(billingService.monthlyRevenueTrend).toHaveBeenCalledWith(6);
      expect(result).toEqual(trend);
    });
  });

  describe('appointmentsByDepartment', () => {
    it('counts appointments per department, sorted descending', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        { doctor: { department: { name: 'Cardiology' } } },
        { doctor: { department: { name: 'Neurology' } } },
        { doctor: { department: { name: 'Cardiology' } } },
        { doctor: { department: { name: 'Cardiology' } } },
      ]);

      const result = await service.appointmentsByDepartment();

      expect(result).toEqual([
        { department: 'Cardiology', count: 3 },
        { department: 'Neurology', count: 1 },
      ]);
    });

    it('returns an empty array when there are no appointments', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      await expect(service.appointmentsByDepartment()).resolves.toEqual([]);
    });
  });

  describe('appointmentsByStatus', () => {
    it('counts appointments per status, with a capitalized client-facing label', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        { status: AppointmentStatus.SCHEDULED },
        { status: AppointmentStatus.COMPLETED },
        { status: AppointmentStatus.COMPLETED },
        { status: AppointmentStatus.CANCELLED },
      ]);

      const result = await service.appointmentsByStatus();

      expect(result).toEqual(
        expect.arrayContaining([
          { status: 'Scheduled', count: 1 },
          { status: 'Completed', count: 2 },
          { status: 'Cancelled', count: 1 },
        ]),
      );
    });

    it('returns an empty array when there are no appointments', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      await expect(service.appointmentsByStatus()).resolves.toEqual([]);
    });
  });
});
