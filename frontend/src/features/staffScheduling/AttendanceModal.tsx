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
import { createAttendance, updateAttendance } from '@/features/staffScheduling/api'
import { isoToLocalDatetimeInput } from '@/features/staffScheduling/datetime'
import { ApiError } from '@/lib/apiClient'
import { ATTENDANCE_STATUS_OPTIONS, type Attendance, type Shift } from '@/types/staffScheduling'

const schema = z.object({
  status: z.enum(['scheduled', 'present', 'late', 'absent', 'leave']),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface AttendanceModalProps {
  shift: Shift | null
  existing: Attendance | null
  onClose: () => void
  onSaved: (attendance: Attendance) => void
}

export function AttendanceModal({ shift, existing, onClose, onSaved }: AttendanceModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!shift) return

    reset({
      status: existing?.status ?? 'present',
      checkIn: existing?.checkIn ? isoToLocalDatetimeInput(existing.checkIn) : '',
      checkOut: existing?.checkOut ? isoToLocalDatetimeInput(existing.checkOut) : '',
      notes: existing?.notes ?? '',
    })
  }, [shift, existing, reset])

  if (!shift) return null

  async function onSubmit(values: FormValues) {
    const payload = {
      status: values.status,
      checkIn: values.checkIn ? new Date(values.checkIn).toISOString() : undefined,
      checkOut: values.checkOut ? new Date(values.checkOut).toISOString() : undefined,
      notes: values.notes || undefined,
    }

    try {
      const result = existing
        ? await updateAttendance(existing.id, payload)
        : await createAttendance({ shiftId: shift!.id, ...payload })
      onSaved(result.attendance)
      onClose()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to save attendance')
    }
  }

  return (
    <Modal
      isOpen={shift !== null}
      onClose={onClose}
      title={`Attendance — ${shift.staff.fullName}`}
      description={new Date(shift.startTime).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select label="Status" {...register('status')} options={ATTENDANCE_STATUS_OPTIONS} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Check-in" type="datetime-local" {...register('checkIn')} />
          <Input label="Check-out" type="datetime-local" {...register('checkOut')} />
        </div>
        <Textarea label="Notes (optional)" {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {existing ? 'Save changes' : 'Record attendance'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
