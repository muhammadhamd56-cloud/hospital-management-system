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
import { bookAppointmentForPatient } from '@/features/appointments/api'
import { listPatients } from '@/features/patients/api'
import { listDoctors } from '@/features/patientDashboard/api'
import { ApiError } from '@/lib/apiClient'
import type { PatientListItem } from '@/types/patientDirectory'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

const appointmentSchema = z.object({
  patientId: z.string().min(1, 'Select a patient'),
  doctorId: z.string().min(1, 'Select a doctor'),
  date: z.string().min(1, 'Select a date'),
  time: z.string().min(1, 'Select a time'),
  mode: z.enum(['online', 'in-person']),
  reason: z.string().min(5, 'Describe the reason for the visit'),
})

type AppointmentFormInput = z.input<typeof appointmentSchema>

interface BookAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  onBook: () => void
}

export function BookAppointmentModal({ isOpen, onClose, onBook }: BookAppointmentModalProps) {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([])
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentFormInput>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: { mode: 'in-person' },
  })

  useEffect(() => {
    if (!isOpen) return
    listPatients()
      .then((res) => setPatients(res.patients))
      .catch(() => setPatients([]))
    listDoctors({ limit: 100 })
      .then((res) => setDoctors(res.doctors))
      .catch(() => setDoctors([]))
  }, [isOpen])

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: AppointmentFormInput) {
    const parsed = appointmentSchema.parse(values)

    try {
      await bookAppointmentForPatient({
        patientId: parsed.patientId,
        doctorId: parsed.doctorId,
        scheduledAt: new Date(`${parsed.date}T${parsed.time}`).toISOString(),
        mode: parsed.mode,
        reason: parsed.reason,
      })
      const patient = patients.find((p) => p.id === parsed.patientId)
      toast.success(`Appointment booked for ${patient?.fullName ?? 'patient'}`)
      onBook()
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to book appointment'
      toast.error(message)
    }
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
            ...patients.map((patient) => ({ label: patient.fullName, value: patient.id })),
          ]}
        />
        <Select
          label="Doctor"
          error={errors.doctorId?.message}
          {...register('doctorId')}
          options={[
            { label: 'Select a doctor', value: '' },
            ...doctors.map((doctor) => ({
              label: `${doctor.fullName} — ${doctor.department}`,
              value: doctor.id,
            })),
          ]}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <Select
          label="Mode"
          error={errors.mode?.message}
          {...register('mode')}
          options={[
            { label: 'In-person', value: 'in-person' },
            { label: 'Online', value: 'online' },
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
            Book appointment
          </Button>
        </div>
      </form>
    </Modal>
  )
}
