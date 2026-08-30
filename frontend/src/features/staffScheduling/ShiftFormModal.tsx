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
import { createShift, updateShift } from '@/features/staffScheduling/api'
import { buildShiftTimes, isoToDateAndTime, todayDateInputValue } from '@/features/staffScheduling/datetime'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'
import {
  SHIFT_TYPE_OPTIONS,
  STAFF_TYPE_LABELS,
  type Shift,
  type ShiftTemplate,
  type Staff,
} from '@/types/staffScheduling'

const schema = z.object({
  staffId: z.string().min(1, 'Staff member is required'),
  department: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  shiftType: z.enum(['morning', 'evening', 'night', 'custom']),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ShiftFormModalProps {
  isOpen: boolean
  onClose: () => void
  staff: Staff[]
  templates?: ShiftTemplate[]
  /** Present when editing an existing shift; absent when scheduling a new one. */
  shift?: Shift | null
  onSaved: (shift: Shift) => void
}

export function ShiftFormModal({ isOpen, onClose, staff, templates = [], shift, onSaved }: ShiftFormModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  function applyTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return

    setValue('shiftType', template.shiftType)
    setValue('startTime', template.startTime)
    setValue('endTime', template.endTime)
  }

  const activeStaff = staff.filter((member) => member.isActive)

  useEffect(() => {
    if (!isOpen) return

    if (shift) {
      const start = isoToDateAndTime(shift.startTime)
      const end = isoToDateAndTime(shift.endTime)
      reset({
        staffId: shift.staff.id,
        department: shift.department ?? '',
        date: start.date,
        startTime: start.time,
        endTime: end.time,
        shiftType: shift.shiftType,
        notes: shift.notes ?? '',
      })
    } else {
      reset({
        staffId: activeStaff[0]?.id ?? '',
        department: '',
        date: todayDateInputValue(),
        startTime: '08:00',
        endTime: '16:00',
        shiftType: 'morning',
        notes: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, shift])

  function handleClose() {
    onClose()
  }

  async function onSubmit(values: FormValues) {
    const { startTime, endTime } = buildShiftTimes(values.date, values.startTime, values.endTime)

    try {
      const result = shift
        ? await updateShift(shift.id, {
            staffId: values.staffId,
            department: values.department || undefined,
            startTime,
            endTime,
            date: values.date,
            localStartTime: values.startTime,
            shiftType: values.shiftType,
            notes: values.notes || undefined,
          })
        : await createShift({
            staffId: values.staffId,
            department: values.department || undefined,
            startTime,
            endTime,
            date: values.date,
            localStartTime: values.startTime,
            shiftType: values.shiftType,
            notes: values.notes || undefined,
          })
      onSaved(result.shift)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to save shift'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={shift ? 'Edit shift' : 'Schedule shift'}
      description="Conflicts are checked automatically -- an overlapping shift for the same staff member is rejected."
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
        <Input label="Date" type="date" error={errors.date?.message} {...register('date')} />
        {templates.length > 0 && (
          <Select
            label="Use template (optional)"
            onChange={(event) => applyTemplate(event.target.value)}
            options={[
              { label: 'Custom times', value: '' },
              ...templates.map((template) => ({ label: template.name, value: template.id })),
            ]}
          />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Start time" type="time" error={errors.startTime?.message} {...register('startTime')} />
          <Input label="End time" type="time" error={errors.endTime?.message} {...register('endTime')} />
        </div>
        <Select label="Shift type" {...register('shiftType')} options={SHIFT_TYPE_OPTIONS} />
        <Textarea label="Notes (optional)" {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={activeStaff.length === 0}>
            {shift ? 'Save changes' : 'Schedule shift'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
