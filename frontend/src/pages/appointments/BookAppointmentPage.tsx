import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { bookAppointment, listDoctors } from '@/features/patientDashboard/api'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

const bookSessionSchema = z.object({
  doctorId: z.string().min(1, 'Select a doctor'),
  date: z.string().min(1, 'Select a date'),
  time: z.string().min(1, 'Select a time'),
  mode: z.enum(['online', 'in-person']),
  reason: z.string().min(5, 'Describe the reason for the visit'),
})

type BookSessionFormValues = z.infer<typeof bookSessionSchema>

export function BookAppointmentPage() {
  const navigate = useNavigate()
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BookSessionFormValues>({
    resolver: zodResolver(bookSessionSchema),
    defaultValues: { mode: 'online' },
  })

  useEffect(() => {
    listDoctors({ limit: 100 })
      .then((res) => setDoctors(res.doctors))
      .catch(() => setDoctors([]))
  }, [])

  async function onSubmit(values: BookSessionFormValues) {
    const doctor = doctors.find((d) => d.id === values.doctorId)
    const scheduledAt = new Date(`${values.date}T${values.time}`)

    try {
      await bookAppointment({
        doctorId: values.doctorId,
        scheduledAt: scheduledAt.toISOString(),
        mode: values.mode,
        reason: values.reason,
      })
      toast.success(`Session booked${doctor ? ` with ${doctor.fullName}` : ''}`)
      navigate(ROUTES.myAppointments)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Book an Appointment</h1>
        <p className="text-sm text-ink-muted">Pick a doctor and a time that works for you.</p>
      </div>

      <Card className="animate-fade-in max-w-xl">
        <CardHeader>
          <CardTitle>New appointment</CardTitle>
          <CardDescription>Only doctors currently accepting bookings are listed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Select
              label="Doctor"
              error={errors.doctorId?.message}
              {...register('doctorId')}
              options={[
                { label: 'Select a doctor', value: '' },
                ...doctors
                  .filter((doctor) => doctor.isAvailable)
                  .map((doctor) => ({
                    label: `${doctor.fullName} — ${doctor.specialization}`,
                    value: doctor.id,
                  })),
              ]}
            />
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
            <Textarea label="Reason for visit" error={errors.reason?.message} {...register('reason')} />
            <div className="mt-2 flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>
                Book session
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
