import { Injectable } from '@nestjs/common';
import { toClientStatus } from '../common/session.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService, type MonthlyRevenue } from '../billing/billing.service';

export type MonthlyRevenueResponse = MonthlyRevenue;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Delegates to BillingService.monthlyRevenueTrend -- the same billed-revenue
   * definition and computation used by Billing's and Dashboard's revenue
   * cards, so this chart can never disagree with them.
   */
  async revenueTrend(): Promise<MonthlyRevenueResponse[]> {
    return this.billingService.monthlyRevenueTrend(TREND_MONTHS);
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
