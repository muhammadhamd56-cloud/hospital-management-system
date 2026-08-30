/** Splits an ISO datetime into <input type="date">/<input type="time">
 *  values in the browser's local timezone -- matches how times are already
 *  displayed elsewhere in the app (toLocaleString with no explicit timeZone). */
export function isoToDateAndTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/** Builds start/end ISO timestamps from a shared date + two local times,
 *  rolling the end time to the next calendar day when it isn't after the
 *  start time -- e.g. a Night shift entered as 08:00 PM - 08:00 AM. */
export function buildShiftTimes(
  date: string,
  startTime: string,
  endTime: string,
): { startTime: string; endTime: string } {
  const start = new Date(`${date}T${startTime}:00`)
  let end = new Date(`${date}T${endTime}:00`)

  if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }

  return { startTime: start.toISOString(), endTime: end.toISOString() }
}

/** ISO datetime -> <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm"),
 *  in the browser's local timezone. */
export function isoToLocalDatetimeInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function todayDateInputValue(): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
