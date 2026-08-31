import { useMemo, useState } from 'react'
import { Search, User, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { formatPatientId } from '@/utils/patientId'
import type { PatientListItem } from '@/types/patientDirectory'

interface PatientPickerProps {
  patients: PatientListItem[]
  value: string
  onChange: (patientId: string) => void
  error?: string
}

export function PatientPicker({ patients, value, onChange, error }: PatientPickerProps) {
  const [query, setQuery] = useState('')

  const selected = useMemo(() => patients.find((patient) => patient.id === value) ?? null, [patients, value])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []

    return patients
      .filter(
        (patient) =>
          patient.fullName.toLowerCase().includes(needle) ||
          formatPatientId(patient.id).toLowerCase().includes(needle) ||
          patient.email.toLowerCase().includes(needle),
      )
      .slice(0, 8)
  }, [patients, query])

  if (selected) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Patient</span>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-alt px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={selected.fullName} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{selected.fullName}</p>
              <p className="truncate text-xs text-ink-muted">
                {formatPatientId(selected.id)}
                {selected.phone ? ` · ${selected.phone}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Change patient"
            className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-surface"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        label="Patient"
        icon={Search}
        placeholder="Search patient by name..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        error={error}
        hint={query.trim() && results.length === 0 ? 'No matching patients' : undefined}
      />
      {results.length > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-surface-border">
          {results.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(patient.id)
                  setQuery('')
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-alt"
              >
                <Avatar name={patient.fullName} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{patient.fullName}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {formatPatientId(patient.id)}
                    {patient.phone ? ` · ${patient.phone}` : ''}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!query.trim() && patients.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <User className="size-3.5" aria-hidden="true" />
          No patients yet.
        </p>
      )}
    </div>
  )
}
