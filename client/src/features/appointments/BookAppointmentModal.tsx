import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { MOCK_PATIENTS } from '@/features/patients/mockPatients'
import { MOCK_DOCTORS } from '@/features/doctors/mockDoctors'
import type { Appointment } from '@/types/appointment'

const appointmentSchema = z.object({
  patientId: z.string().min(1, 'Select a patient'),
  doctorId: z.string().min(1, 'Select a doctor'),
  date: z.string().min(1, 'Select a date'),
  time: z.string().min(1, 'Select a time'),
  reason: z.string().min(5, 'Describe the reason for the visit'),
})

type AppointmentFormValues = z.infer<typeof appointmentSchema>

interface BookAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  onBook: (appointment: Appointment) => void
}

export function BookAppointmentModal({ isOpen, onClose, onBook }: BookAppointmentModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentFormValues>({ resolver: zodResolver(appointmentSchema) })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: AppointmentFormValues) {
    const patient = MOCK_PATIENTS.find((p) => p.id === values.patientId)
    const doctor = MOCK_DOCTORS.find((d) => d.id === values.doctorId)
    if (!patient || !doctor) return

    await new Promise((resolve) => setTimeout(resolve, 400))
    onBook({
      id: `A-${crypto.randomUUID().slice(0, 8)}`,
      patientId: patient.id,
      patientName: patient.name,
      doctorId: doctor.id,
      doctorName: doctor.name,
      department: doctor.department,
      date: values.date,
      time: values.time,
      reason: values.reason,
      status: 'scheduled',
    })
    toast.success(`Appointment booked for ${patient.name}`)
    handleClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Book Appointment"
      description="Schedule a new appointment for a patient."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select
          label="Patient"
          error={errors.patientId?.message}
          {...register('patientId')}
          options={[
            { label: 'Select a patient', value: '' },
            ...MOCK_PATIENTS.map((patient) => ({ label: patient.name, value: patient.id })),
          ]}
        />
        <Select
          label="Doctor"
          error={errors.doctorId?.message}
          {...register('doctorId')}
          options={[
            { label: 'Select a doctor', value: '' },
            ...MOCK_DOCTORS.map((doctor) => ({
              label: `${doctor.name} — ${doctor.department}`,
              value: doctor.id,
            })),
          ]}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            error={errors.date?.message}
            {...register('date')}
          />
          <Input
            label="Time"
            type="time"
            error={errors.time?.message}
            {...register('time')}
          />
        </div>
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
            Book appointment
          </Button>
        </div>
      </form>
    </Modal>
  )
}
