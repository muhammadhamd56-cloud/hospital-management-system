import type { EmergencyTimelineEvent } from '@/types/emergency'

export function EmergencyTimeline({ events }: { events: EmergencyTimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-muted">No activity yet.</p>
  }

  return (
    <ol className="flex flex-col gap-3">
      {events.map((event, index) => (
        <li key={`${event.createdAt}-${index}`} className="flex gap-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ink">{event.label}</p>
            <p className="text-xs text-ink-muted">
              {new Date(event.createdAt).toLocaleString()}
              {event.actorName ? ` · ${event.actorName}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
