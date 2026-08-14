import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentStatus, InvoiceStatus } from '@prisma/client';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: { invoice: { findMany: jest.Mock }; appointment: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      invoice: { findMany: jest.fn() },
      appointment: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ReportsService);

    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('revenueTrend', () => {
    it('queries paid invoices from the start of the 6-month window onward', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      await service.revenueTrend();

      expect(prisma.invoice.findMany).toHaveBeenCalledWith({
        where: { status: InvoiceStatus.PAID, paidAt: { gte: new Date(2026, 0, 1) } },
        select: { amount: true, paidAt: true },
      });
    });

    it('returns 6 months in chronological order, each with $0 when there are no invoices', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.revenueTrend();

      expect(result).toHaveLength(6);
      expect(result.map((r) => r.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
      expect(result.every((r) => r.revenue === 0)).toBe(true);
    });

    it('buckets invoice amounts into the correct month and ignores invoices outside the window', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { amount: 100, paidAt: new Date('2026-03-05T00:00:00.000Z') },
        { amount: 50, paidAt: new Date('2026-03-20T00:00:00.000Z') },
        { amount: 200, paidAt: new Date('2026-06-01T00:00:00.000Z') },
      ]);

      const result = await service.revenueTrend();

      expect(result.find((r) => r.month === 'Mar')?.revenue).toBe(150);
      expect(result.find((r) => r.month === 'Jun')?.revenue).toBe(200);
      expect(result.find((r) => r.month === 'Jan')?.revenue).toBe(0);
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
