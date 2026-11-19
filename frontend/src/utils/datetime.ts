const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
/** A real instant (has a "Z" or "+05:00"-style offset), not a wall-clock string. */
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i

/** Formats a date as "Aug 3, 2026". A bare "YYYY-MM-DD" is a calendar date
 *  (shown as-is, never shifted by timezone); a full ISO timestamp is shown in
 *  the viewer's local date. */
export function formatDate(isoDate: string): string {
  const date = DATE_ONLY.test(isoDate) ? new Date(`${isoDate}T00:00:00`) : new Date(isoDate)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Formats a 24-hour "HH:mm" string as "9:00 AM". */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

/** Formats a Date as "Sunday, August 2, 2026". */
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Formats an ISO datetime string as "Aug 2, 7:45 AM". Timestamps carrying a
 *  timezone (the API sends UTC "...Z") are converted to the viewer's local
 *  time; a zone-less "YYYY-MM-DDTHH:mm" is treated as already local. */
export function formatDateTime(isoDateTime: string): string {
  if (HAS_ZONE.test(isoDateTime)) {
    const date = new Date(isoDateTime)
    const shortDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${shortDate}, ${formatTime(`${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`)}`
  }
  const [isoDate, time] = isoDateTime.split('T')
  const shortDate = new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `${shortDate}, ${formatTime(time.slice(0, 5))}`
}

/** Today's date as a local "YYYY-MM-DD" string -- for a date input's `min`,
 *  so the browser's own picker UI blocks past dates before the form ever
 *  submits (the backend rejects them too; this is just earlier feedback). */
export function todayLocalDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Formats a date-only value the API stores as UTC midnight (e.g. a shift
 *  opening's `date`) as "Aug 3, 2026". Formatting it in local time would show
 *  the previous day anywhere west of UTC. */
export function formatCalendarDate(isoUtcMidnight: string): string {
  return new Date(isoUtcMidnight).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
