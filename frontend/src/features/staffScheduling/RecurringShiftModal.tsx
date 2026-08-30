import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createRecurringShifts } from '@/features/staffScheduling/api'
import { buildShiftTimes, todayDateInputValue } from '@/features/staffScheduling/datetime'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'
import {
  DAY_OF_WEEK_LABELS,
  DAYS_OF_WEEK,
  SHIFT_TYPE_OPTIONS,
  STAFF_TYPE_LABELS,
  type DayOfWeek,
  type Shift,
  type Staff,
} from '@/types/staffScheduling'
import { cn } from '@/utils/cn'

const WEEKDAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

const DAY_TO_JS_INDEX: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

/** Every local calendar date in [startDate, endDate] whose weekday is in
 *  daysOfWeek, each resolved to a UTC start/end ISO instant via the same
 *  local-time conversion (with overnight rollover) used for a one-off
 *  shift -- so "Monday 8am" means the admin's local Monday 8am, not UTC. */
function buildOccurrences(
  startDate: string,
  endDate: string,
  daysOfWeek: DayOfWeek[],
  startTime: string,
  endTime: string,
): { startTime: string; endTime: string; date: string; localStartTime: string }[] {
  const wanted = new Set(daysOfWeek.map((day) => DAY_TO_JS_INDEX[day]))
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const pad = (n: number) => String(n).padStart(2, '0')
  const occurrences: { startTime: string; endTime: string; date: string; localStartTime: string }[] = []

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (wanted.has(cursor.getDay())) {
      const dateStr = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
      occurrences.push({ ...buildShiftTimes(dateStr, startTime, endTime), date: dateStr, localStartTime: startTime })
    }
  }

  return occurrences
}

const schema = z.object({
  staffId: z.string().min(1, 'Staff member is required'),
  department: z.string().optional(),
  shiftType: z.enum(['morning', 'evening', 'night', 'custom']),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface RecurringShiftModalProps {
  isOpen: boolean
  onClose: () => void
  staff: Staff[]
  onSaved: (shifts: Shift[]) => void
}

export function RecurringShiftModal({ isOpen, onClose, staff, onSaved }: RecurringShiftModalProps) {
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(WEEKDAYS)
  const activeStaff = staff.filter((member) => member.isActive)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!isOpen) return

    setSelectedDays(WEEKDAYS)
    reset({
      staffId: activeStaff[0]?.id ?? '',
      department: '',
      shiftType: 'morning',
      startTime: '08:00',
      endTime: '16:00',
      startDate: todayDateInputValue(),
      endDate: todayDateInputValue(),
      notes: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  function toggleDay(day: DayOfWeek) {
    setSelectedDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]))
  }

  async function onSubmit(values: FormValues) {
    if (selectedDays.length === 0) {
      toast.error('Select at least one day of the week')
      return
    }

    const occurrences = buildOccurrences(values.startDate, values.endDate, selectedDays, values.startTime, values.endTime)

    if (occurrences.length === 0) {
      toast.error('No matching dates in the selected range')
      return
    }

    try {
      const result = await createRecurringShifts({
        staffId: values.staffId,
        department: values.department || undefined,
        shiftType: values.shiftType,
        occurrences,
        notes: values.notes || undefined,
      })
      onSaved(result.shifts)
      toast.success(`Created ${result.shifts.length} shift${result.shifts.length === 1 ? '' : 's'}`)
      onClose()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to create recurring shifts')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Recurring shift"
      description="Generates one shift per selected weekday in the date range. If any occurrence would conflict, none are created."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select
          label="Staff member"
          error={errors.staffId?.message}
          {...register('staffId')}
          options={
            activeStaff.length > 0
              ? activeStaff.map((member) => ({
                  label: `${member.fullName} (${STAFF_TYPE_LABELS[member.staffType]})`,
                  value: member.id,
                }))
              : [{ label: 'No active staff on roster', value: '' }]
          }
        />
        <Select
          label="Department (optional)"
          {...register('department')}
          options={[{ label: 'No department', value: '' }, ...DEPARTMENTS.map((dept) => ({ label: dept, value: dept }))]}
        />

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Days of week</p>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                  selectedDays.includes(day)
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'border-surface-border text-ink-muted hover:bg-surface-alt hover:text-ink',
                )}
              >
                {DAY_OF_WEEK_LABELS[day].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Start date" type="date" error={errors.startDate?.message} {...register('startDate')} />
          <Input label="End date" type="date" error={errors.endDate?.message} {...register('endDate')} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Start time" type="time" error={errors.startTime?.message} {...register('startTime')} />
          <Input label="End time" type="time" error={errors.endTime?.message} {...register('endTime')} />
        </div>
        <Select label="Shift type" {...register('shiftType')} options={SHIFT_TYPE_OPTIONS} />
        <Textarea label="Notes (optional)" {...register('notes')} />

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={activeStaff.length === 0}>
            Create recurring shifts
          </Button>
        </div>
      </form>
    </Modal>
  )
}
