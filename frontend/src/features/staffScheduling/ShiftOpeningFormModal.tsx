import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createShiftOpening, updateShiftOpening } from '@/features/staffScheduling/api'
import { buildShiftTimes, isoToDateAndTime, todayDateInputValue } from '@/features/staffScheduling/datetime'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'
import { SHIFT_TYPE_OPTIONS, STAFF_TYPE_OPTIONS } from '@/types/staffScheduling'
import type { ShiftOpening } from '@/types/staffPortal'

const schema = z.object({
  requiredStaffType: z.enum(['doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_technician', 'other']),
  department: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  shiftType: z.enum(['morning', 'evening', 'night', 'custom']),
  positions: z.coerce.number().int().min(1, 'At least one position is required').max(50),
  applicationDeadlineDate: z.string().min(1, 'Deadline is required'),
  applicationDeadlineTime: z.string().min(1, 'Deadline time is required'),
  notes: z.string().optional(),
})

type FormValues = z.input<typeof schema>

interface ShiftOpeningFormModalProps {
  isOpen: boolean
  onClose: () => void
  opening?: ShiftOpening | null
  onSaved: (opening: ShiftOpening) => void
}

export function ShiftOpeningFormModal({ isOpen, onClose, opening, onSaved }: ShiftOpeningFormModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!isOpen) return

    if (opening) {
      const start = isoToDateAndTime(opening.startTime)
      const end = isoToDateAndTime(opening.endTime)
      const deadline = isoToDateAndTime(opening.applicationDeadline)
      reset({
        requiredStaffType: opening.requiredStaffType,
        department: opening.department ?? '',
        date: start.date,
        startTime: start.time,
        endTime: end.time,
        shiftType: opening.shiftType,
        positions: opening.positions,
        applicationDeadlineDate: deadline.date,
        applicationDeadlineTime: deadline.time,
        notes: opening.notes ?? '',
      })
    } else {
      reset({
        requiredStaffType: 'nurse',
        department: '',
        date: todayDateInputValue(),
        startTime: '08:00',
        endTime: '16:00',
        shiftType: 'morning',
        positions: 1,
        applicationDeadlineDate: todayDateInputValue(),
        applicationDeadlineTime: '17:00',
        notes: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, opening])

  async function onSubmit(values: FormValues) {
    const parsed = schema.parse(values)
    const { startTime, endTime } = buildShiftTimes(parsed.date, parsed.startTime, parsed.endTime)
    const applicationDeadline = new Date(
      `${parsed.applicationDeadlineDate}T${parsed.applicationDeadlineTime}:00`,
    ).toISOString()

    try {
      const result = opening
        ? await updateShiftOpening(opening.id, {
            positions: parsed.positions,
            applicationDeadline,
            notes: parsed.notes || undefined,
          })
        : await createShiftOpening({
            requiredStaffType: parsed.requiredStaffType,
            department: parsed.department || undefined,
            date: parsed.date,
            startTime,
            endTime,
            shiftType: parsed.shiftType,
            positions: parsed.positions,
            applicationDeadline,
            notes: parsed.notes || undefined,
          })
      onSaved(result.opening)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to save shift opening')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={opening ? 'Edit opening' : 'Post shift opening'}
      description="Nurses matching the required role can apply once this is posted."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select
          label="Required staff type"
          disabled={Boolean(opening)}
          {...register('requiredStaffType')}
          options={STAFF_TYPE_OPTIONS}
        />
        <Select
          label="Department (optional)"
          disabled={Boolean(opening)}
          {...register('department')}
          options={[{ label: 'No department', value: '' }, ...DEPARTMENTS.map((dept) => ({ label: dept, value: dept }))]}
        />
        <Input label="Date" type="date" disabled={Boolean(opening)} error={errors.date?.message} {...register('date')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Start time" type="time" disabled={Boolean(opening)} error={errors.startTime?.message} {...register('startTime')} />
          <Input label="End time" type="time" disabled={Boolean(opening)} error={errors.endTime?.message} {...register('endTime')} />
        </div>
        <Select label="Shift type" disabled={Boolean(opening)} {...register('shiftType')} options={SHIFT_TYPE_OPTIONS} />
        <Input label="Positions" type="number" min={1} max={50} error={errors.positions?.message} {...register('positions')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Application deadline"
            type="date"
            error={errors.applicationDeadlineDate?.message}
            {...register('applicationDeadlineDate')}
          />
          <Input
            label="Deadline time"
            type="time"
            error={errors.applicationDeadlineTime?.message}
            {...register('applicationDeadlineTime')}
          />
        </div>
        <Textarea label="Notes (optional)" {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {opening ? 'Save changes' : 'Post opening'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
