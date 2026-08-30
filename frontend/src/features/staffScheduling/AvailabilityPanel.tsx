import { useEffect, useState } from 'react'
import { CalendarOff, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  createLeave,
  deleteLeave,
  getAvailability,
  listLeave,
  saveAvailability,
} from '@/features/staffScheduling/api'
import { ApiError } from '@/lib/apiClient'
import { DAY_OF_WEEK_LABELS, DAYS_OF_WEEK, type DayAvailability, type Leave, type Staff } from '@/types/staffScheduling'

interface AvailabilityPanelProps {
  staff: Staff[]
}

function defaultAvailability(): DayAvailability[] {
  return DAYS_OF_WEEK.map((dayOfWeek) => ({ dayOfWeek, isAvailable: true, availableFrom: null, availableTo: null }))
}

export function AvailabilityPanel({ staff }: AvailabilityPanelProps) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? '')
  const [availability, setAvailability] = useState<DayAvailability[]>(defaultAvailability())
  const [leave, setLeave] = useState<Leave[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [leaveDate, setLeaveDate] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [leaveToRemove, setLeaveToRemove] = useState<Leave | null>(null)
  const [isRemovingLeave, setIsRemovingLeave] = useState(false)

  useEffect(() => {
    if (staff.length > 0 && !staff.some((member) => member.id === staffId)) {
      setStaffId(staff[0].id)
    }
  }, [staff, staffId])

  useEffect(() => {
    if (!staffId) return

    setIsLoading(true)
    Promise.all([getAvailability(staffId), listLeave(staffId)])
      .then(([availabilityRes, leaveRes]) => {
        setAvailability(availabilityRes.availability)
        setLeave(leaveRes.leave)
      })
      .catch((error) => toast.error(error instanceof ApiError ? error.message : 'Failed to load availability'))
      .finally(() => setIsLoading(false))
  }, [staffId])

  function updateDay(day: DayAvailability['dayOfWeek'], patch: Partial<DayAvailability>) {
    setAvailability((current) => current.map((entry) => (entry.dayOfWeek === day ? { ...entry, ...patch } : entry)))
  }

  async function handleSaveAvailability() {
    setIsSaving(true)
    try {
      const result = await saveAvailability(staffId, availability)
      setAvailability(result.availability)
      toast.success('Availability saved')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to save availability')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAddLeave() {
    if (!leaveDate) {
      toast.error('Select a date')
      return
    }

    try {
      const result = await createLeave(staffId, { date: leaveDate, reason: leaveReason || undefined })
      setLeave((current) => [...current, result.leave].sort((a, b) => a.date.localeCompare(b.date)))
      setLeaveDate('')
      setLeaveReason('')
      toast.success('Leave added')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to add leave')
    }
  }

  async function handleRemoveLeave() {
    if (!leaveToRemove) return

    setIsRemovingLeave(true)
    try {
      await deleteLeave(staffId, leaveToRemove.id)
      setLeave((current) => current.filter((entry) => entry.id !== leaveToRemove.id))
      toast.success('Leave removed')
      setLeaveToRemove(null)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to remove leave')
    } finally {
      setIsRemovingLeave(false)
    }
  }

  if (staff.length === 0) {
    return (
      <div className="rounded-card border border-surface-border bg-surface">
        <EmptyState icon={CalendarOff} title="No staff on the roster yet" description="Add a staff member first." />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="sm:w-72">
        <Select
          label="Staff member"
          value={staffId}
          onChange={(event) => setStaffId(event.target.value)}
          options={staff.map((member) => ({ label: member.fullName, value: member.id }))}
        />
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-card border border-surface-border bg-surface-alt" />
      ) : (
        <>
          <div className="rounded-card border border-surface-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold text-ink">Weekly availability</h2>
            <div className="divide-y divide-surface-border">
              {availability.map((day) => (
                <div key={day.dayOfWeek} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Fixed width so the toggle lands at the same x position on every
                      row regardless of day-name length ("Monday" vs "Wednesday"). */}
                  <div className="sm:w-40 sm:shrink-0">
                    <Switch
                      label={DAY_OF_WEEK_LABELS[day.dayOfWeek]}
                      checked={day.isAvailable}
                      onChange={(checked) =>
                        updateDay(day.dayOfWeek, {
                          isAvailable: checked,
                          availableFrom: checked ? day.availableFrom : null,
                          availableTo: checked ? day.availableTo : null,
                        })
                      }
                    />
                  </div>
                  {day.isAvailable && (
                    <div className="flex items-center gap-2">
                      <Input
                        label="From"
                        hideLabel
                        type="time"
                        value={day.availableFrom ?? ''}
                        onChange={(event) => updateDay(day.dayOfWeek, { availableFrom: event.target.value || null })}
                        className="w-32"
                      />
                      <span className="text-sm text-ink-muted">to</span>
                      <Input
                        label="To"
                        hideLabel
                        type="time"
                        value={day.availableTo ?? ''}
                        onChange={(event) => updateDay(day.dayOfWeek, { availableTo: event.target.value || null })}
                        className="w-32"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSaveAvailability} isLoading={isSaving}>
                Save availability
              </Button>
            </div>
          </div>

          <div className="rounded-card border border-surface-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">Leave / unavailable dates</h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Input label="Date" type="date" value={leaveDate} onChange={(event) => setLeaveDate(event.target.value)} />
              <Input
                label="Reason (optional)"
                placeholder="Annual leave"
                value={leaveReason}
                onChange={(event) => setLeaveReason(event.target.value)}
              />
              <Button onClick={handleAddLeave}>
                <Plus className="size-4" aria-hidden="true" />
                Add
              </Button>
            </div>

            {leave.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">No leave recorded.</p>
            ) : (
              <ul className="mt-4 divide-y divide-surface-border">
                {leave.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {new Date(entry.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </p>
                      {entry.reason && <p className="text-xs text-ink-muted">{entry.reason}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setLeaveToRemove(entry)}
                      aria-label="Remove leave"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={leaveToRemove !== null}
        onClose={() => setLeaveToRemove(null)}
        onConfirm={handleRemoveLeave}
        isLoading={isRemovingLeave}
        variant="danger"
        title="Remove leave?"
        confirmLabel="Remove"
      />
    </div>
  )
}
