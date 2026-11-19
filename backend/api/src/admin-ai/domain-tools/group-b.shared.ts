import { BadRequestException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { z } from 'zod';

/** Longest date window any group-B tool accepts (a leap year). */
export const MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` calendar date. */
export const isoDate = z.iso.date();

/** Inclusive day count between two `YYYY-MM-DD` dates (negative when `to` is before `from`). */
export function daysInRange(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1;
}

/** zod superRefine body: `from <= to` and at most MAX_RANGE_DAYS days, reported on `path`. */
export function checkRange(
  from: string | undefined,
  to: string | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[] = ['to'],
): void {
  if (!from || !to) return;
  const days = daysInRange(from, to);
  if (days < 1) {
    ctx.addIssue({ code: 'custom', message: '`to` must be on or after `from`', path });
  } else if (days > MAX_RANGE_DAYS) {
    ctx.addIssue({ code: 'custom', message: `Date range may span at most ${MAX_RANGE_DAYS} days`, path });
  }
}

/** True when the date part (first 10 chars) of an ISO string falls in [from, to], both inclusive. */
export function inRange(iso: string, from: string, to: string): boolean {
  const day = iso.slice(0, 10);
  return day >= from && day <= to;
}

/** Every `YYYY-MM-DD` date in [from, to] (caller guarantees the range is bounded). */
export function eachDay(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  return Array.from({ length: Math.max(0, daysInRange(from, to)) }, (_, i) =>
    new Date(start + i * DAY_MS).toISOString().slice(0, 10),
  );
}

function flattenErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...flattenErrors(error.children ?? []),
  ]);
}

/**
 * Runs a controller DTO's own class-validator rules (with the same
 * whitelist/forbidNonWhitelisted options as the global ValidationPipe) so an
 * AI action is validated exactly like the equivalent HTTP request. Returns
 * the transformed instance; throws 400 with the DTO's messages otherwise.
 */
export async function validateDto<T extends object>(cls: ClassConstructor<T>, plain: Record<string, unknown>): Promise<T> {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    throw new BadRequestException(flattenErrors(errors).join('; ') || 'Invalid parameters');
  }
  return instance;
}
