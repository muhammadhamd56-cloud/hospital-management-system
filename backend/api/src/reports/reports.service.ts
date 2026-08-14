import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { toClientStatus } from '../common/session.mapper';
import { PrismaService } from '../prisma/prisma.service';

export interface MonthlyRevenueResponse {
  month: string;
  revenue: number;
}

export interface DepartmentCountResponse {
  department: string;
  count: number;
}

export interface StatusCountResponse {
  status: string;
  count: number;
}

const TREND_MONTHS = 6;

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Last 6 calendar months of PAID invoices, reduced by month in JS -- same
   *  aggregate/date-window style as BillingService.revenueThisMonth, generalized to a range. */
  async revenueTrend(): Promise<MonthlyRevenueResponse[]> {
    const now = new Date();
    const months = Array.from({ length: TREND_MONTHS }, (_, i) => {
      const offset = TREND_MONTHS - 1 - i;
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
      return { label: start.toLocaleString('en-US', { month: 'short' }), start, end };
    });

    const invoices = await this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.PAID, paidAt: { gte: months[0].start } },
      select: { amount: true, paidAt: true },
    });

    return months.map(({ label, start, end }) => ({
      month: label,
      revenue: invoices
        .filter((invoice) => invoice.paidAt && invoice.paidAt >= start && invoice.paidAt < end)
        .reduce((sum, invoice) => sum + invoice.amount, 0),
    }));
  }

  async appointmentsByDepartment(): Promise<DepartmentCountResponse[]> {
    const appointments = await this.prisma.appointment.findMany({
      select: { doctor: { select: { department: { select: { name: true } } } } },
    });

    const counts = new Map<string, number>();

    for (const appointment of appointments) {
      const name = appointment.doctor.department.name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return Array.from(counts, ([department, count]) => ({ department, count })).sort(
      (a, b) => b.count - a.count,
    );
  }

  /** Replaces the old mock "patient status distribution" chart, which had no
   *  real backing field on User -- appointment status is genuinely meaningful. */
  async appointmentsByStatus(): Promise<StatusCountResponse[]> {
    const appointments = await this.prisma.appointment.findMany({ select: { status: true } });

    const counts = new Map<string, number>();

    for (const appointment of appointments) {
      const status = capitalize(toClientStatus(appointment.status));
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }

    return Array.from(counts, ([status, count]) => ({ status, count }));
  }
}
