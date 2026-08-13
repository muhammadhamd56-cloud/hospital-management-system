import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { bookAppointment } from '@/features/patientDashboard/api'
import { ApiError } from '@/lib/apiClient'
import type { DirectoryDoctor } from '@/types/directoryDoctor'
import type { PatientAppointment } from '@/types/patientSession'

const bookSessionSchema = z.object({
  date: z.string().min(1, 'Select a date'),
  time: z.string().min(1, 'Select a time'),
  mode: z.enum(['online', 'in-person']),
  reason: z.string().min(5, 'Describe the reason for the visit'),
})

type BookSessionFormValues = z.infer<typeof bookSessionSchema>

interface BookSessionModalProps {
  doctor: DirectoryDoctor | null
  onClose: () => void
  onBooked: (appointment: PatientAppointment) => void
}

export function BookSessionModal({ doctor, onClose, onBooked }: BookSessionModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookSessionFormValues>({
    resolver: zodResolver(bookSessionSchema),
    defaultValues: { mode: 'online' },
  })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: BookSessionFormValues) {
    if (!doctor) return

    const scheduledAt = new Date(`${values.date}T${values.time}`)

    try {
      const { appointment } = await bookAppointment({
        doctorId: doctor.id,
        scheduledAt: scheduledAt.toISOString(),
        mode: values.mode,
        reason: values.reason,
      })
      toast.success(`Session booked with ${doctor.fullName}`)
      onBooked(appointment)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={Boolean(doctor)}
      onClose={handleClose}
      title="Book a session"
      description={doctor ? `${doctor.fullName} — ${doctor.specialization}` : undefined}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Date" type="date" error={errors.date?.message} {...register('date')} />
          <Input label="Time" type="time" error={errors.time?.message} {...register('time')} />
        </div>
        <Select
          label="Session type"
          error={errors.mode?.message}
          {...register('mode')}
          options={[
            { label: 'Online', value: 'online' },
            { label: 'In-person', value: 'in-person' },
          ]}
        />
        <Textarea
          label="Reason for visit"
          error={errors.reason?.message}
          {...register('reason')}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Book session
          </Button>
        </div>
      </form>
    </Modal>
  )
}
