export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function formatSessionDateTime(iso: string): string {
  return `${formatSessionDate(iso)}, ${formatSessionTime(iso)}`
}

export function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() >= Date.now()
}
