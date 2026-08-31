import { useForm, useWatch } from 'react-hook-form'
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
import { formatCurrency } from '@/utils/currency'
import { formatDate, formatTime } from '@/utils/datetime'
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
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookSessionFormValues>({
    resolver: zodResolver(bookSessionSchema),
    defaultValues: { mode: 'online' },
  })

  const date = useWatch({ control, name: 'date' })
  const time = useWatch({ control, name: 'time' })
  const mode = useWatch({ control, name: 'mode' })

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
      toast.success(
        doctor.consultationFee > 0
          ? `Appointment confirmed with ${doctor.fullName} — an invoice for ${formatCurrency(doctor.consultationFee)} is waiting in Billing`
          : `Appointment confirmed with ${doctor.fullName}`,
      )
      onBooked(appointment)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to book the appointment. Please try again.'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={Boolean(doctor)}
      onClose={handleClose}
      title="Book Appointment"
      description={doctor ? `${doctor.fullName} — ${doctor.specialization}` : undefined}
    >
      {doctor && (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="rounded-lg border border-surface-border bg-surface-alt px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Consultation Fee</span>
              <span className="font-semibold text-ink">
                {doctor.consultationFee > 0 ? formatCurrency(doctor.consultationFee) : 'Free'}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Appointment duration: {doctor.appointmentDurationMinutes} minutes
              {doctor.consultationFee > 0 && ' · An invoice will be added to your Billing page after booking.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Date" type="date" error={errors.date?.message} {...register('date')} />
            <Input label="Time" type="time" error={errors.time?.message} {...register('time')} />
          </div>
          <Select
            label="Appointment Type"
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

          {date && time && (
            <div className="flex flex-col gap-1 rounded-lg bg-surface-alt px-4 py-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Booking Summary</p>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Doctor</span>
                <span className="font-medium text-ink">{doctor.fullName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Specialization</span>
                <span className="font-medium text-ink">{doctor.specialization}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Date</span>
                <span className="font-medium text-ink">{formatDate(date)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Time</span>
                <span className="font-medium text-ink">{formatTime(time)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Appointment Type</span>
                <span className="font-medium text-ink">{mode === 'online' ? 'Online' : 'In-person'}</span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-surface-border pt-1 font-semibold text-ink">
                <span>Total consultation fee</span>
                <span>{doctor.consultationFee > 0 ? formatCurrency(doctor.consultationFee) : 'Free'}</span>
              </div>
            </div>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Back
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Confirm Appointment
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
