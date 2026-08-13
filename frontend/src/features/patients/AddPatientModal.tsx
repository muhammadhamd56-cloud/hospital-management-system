import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import type { Patient } from '@/types/patient'

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const patientSchema = z.object({
  name: z.string().min(2, 'Enter the patient’s full name'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z.string().min(7, 'Enter a valid phone number'),
  age: z.coerce.number().int().min(0, 'Age must be positive').max(120, 'Enter a valid age'),
  gender: z.enum(['male', 'female', 'other']),
  bloodGroup: z.enum(BLOOD_GROUPS as [string, ...string[]]),
})

type PatientFormInput = z.input<typeof patientSchema>

interface AddPatientModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (patient: Patient) => void
}

export function AddPatientModal({ isOpen, onClose, onAdd }: AddPatientModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormInput>({
    resolver: zodResolver(patientSchema),
    defaultValues: { gender: 'female', bloodGroup: 'O+' },
  })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: PatientFormInput) {
    const parsed = patientSchema.parse(values)
    await new Promise((resolve) => setTimeout(resolve, 400))
    onAdd({
      id: `P-${crypto.randomUUID().slice(0, 8)}`,
      lastVisit: new Date().toISOString().slice(0, 10),
      status: 'active',
      ...parsed,
    })
    toast.success(`${parsed.name} was added`)
    handleClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Patient"
      description="Register a new patient record."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input label="Full name" error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Age"
            type="number"
            error={errors.age?.message}
            {...register('age')}
          />
          <Select
            label="Gender"
            options={[
              { label: 'Female', value: 'female' },
              { label: 'Male', value: 'male' },
              { label: 'Other', value: 'other' },
            ]}
            {...register('gender')}
          />
          <Select
            label="Blood group"
            options={BLOOD_GROUPS.map((group) => ({ label: group, value: group }))}
            {...register('bloodGroup')}
          />
        </div>
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Add patient
          </Button>
        </div>
      </form>
    </Modal>
  )
}
