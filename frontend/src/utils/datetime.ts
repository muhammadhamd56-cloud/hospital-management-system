/** Formats an ISO date string (YYYY-MM-DD) as "Aug 3, 2026". */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
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

/** Formats an ISO datetime string as "Aug 2, 7:45 AM". */
export function formatDateTime(isoDateTime: string): string {
  const [isoDate, time] = isoDateTime.split('T')
  const shortDate = new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `${shortDate}, ${formatTime(time.slice(0, 5))}`
}
