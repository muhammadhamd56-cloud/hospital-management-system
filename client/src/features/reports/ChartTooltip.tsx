import type { TooltipContentProps } from 'recharts'

interface ChartTooltipProps extends Partial<TooltipContentProps<number, string>> {
  valueFormatter?: (value: number) => string
}

export function ChartTooltip({ active, payload, label, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm shadow-lg">
      {label && <p className="mb-1 font-medium text-ink">{label}</p>}
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-ink-muted">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          {entry.name}:{' '}
          <span className="font-medium text-ink">
            {valueFormatter && typeof entry.value === 'number'
              ? valueFormatter(entry.value)
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  )
}
