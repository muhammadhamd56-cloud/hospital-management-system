export interface DateRange {
  start: Date;
  end: Date;
}

/** Local-calendar start of the month containing `date` (midnight local time, day 1). */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * `date`'s month shifted by `delta` months, anchored to day 1/midnight local
 * time -- always used instead of naively adding days, so shifting across
 * months of different lengths (or year boundaries) never drifts.
 */
export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** The current calendar month as a half-open [start, end) local-time window. */
export function currentMonthRange(now: Date = new Date()): DateRange {
  return { start: startOfMonth(now), end: addMonths(now, 1) };
}

/**
 * The last `count` calendar months up to and including the month containing
 * `now`, oldest first. Each range is a half-open [start, end) local-time
 * window, so a record dated exactly midnight on the 1st of a month is never
 * miscounted into the previous month.
 */
export function lastCalendarMonths(count: number, now: Date = new Date()): Array<DateRange & { label: string }> {
  return Array.from({ length: count }, (_, i) => {
    const offset = count - 1 - i;
    const start = addMonths(now, -offset);
    const end = addMonths(now, -offset + 1);
    return { label: start.toLocaleString('en-US', { month: 'short' }), start, end };
  });
}
