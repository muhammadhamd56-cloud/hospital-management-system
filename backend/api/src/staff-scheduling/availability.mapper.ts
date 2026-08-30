import { DayOfWeek } from '@prisma/client';
import type { StaffAvailability, StaffLeave } from '@prisma/client';
import type { ClientDayOfWeek } from './dto/day-of-week';

const CLIENT_TO_PRISMA_DAY: Record<ClientDayOfWeek, DayOfWeek> = {
  monday: DayOfWeek.MONDAY,
  tuesday: DayOfWeek.TUESDAY,
  wednesday: DayOfWeek.WEDNESDAY,
  thursday: DayOfWeek.THURSDAY,
  friday: DayOfWeek.FRIDAY,
  saturday: DayOfWeek.SATURDAY,
  sunday: DayOfWeek.SUNDAY,
};

const PRISMA_TO_CLIENT_DAY: Record<DayOfWeek, ClientDayOfWeek> = {
  [DayOfWeek.MONDAY]: 'monday',
  [DayOfWeek.TUESDAY]: 'tuesday',
  [DayOfWeek.WEDNESDAY]: 'wednesday',
  [DayOfWeek.THURSDAY]: 'thursday',
  [DayOfWeek.FRIDAY]: 'friday',
  [DayOfWeek.SATURDAY]: 'saturday',
  [DayOfWeek.SUNDAY]: 'sunday',
};

export function toClientDay(day: DayOfWeek): ClientDayOfWeek {
  return PRISMA_TO_CLIENT_DAY[day];
}

export function toPrismaDay(day: ClientDayOfWeek): DayOfWeek {
  return CLIENT_TO_PRISMA_DAY[day];
}

export interface AvailabilityResponse {
  dayOfWeek: ClientDayOfWeek;
  isAvailable: boolean;
  availableFrom: string | null;
  availableTo: string | null;
}

export function toAvailabilityResponse(row: StaffAvailability): AvailabilityResponse {
  return {
    dayOfWeek: toClientDay(row.dayOfWeek),
    isAvailable: row.isAvailable,
    availableFrom: row.availableFrom,
    availableTo: row.availableTo,
  };
}

export interface LeaveResponse {
  id: string;
  staffId: string;
  date: string;
  reason: string | null;
  createdAt: string;
}

export function toLeaveResponse(row: StaffLeave): LeaveResponse {
  return {
    id: row.id,
    staffId: row.staffId,
    date: row.date.toISOString(),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}
