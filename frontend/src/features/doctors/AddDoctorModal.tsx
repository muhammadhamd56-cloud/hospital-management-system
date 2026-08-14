import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createStaff, type CreateStaffResponse } from '@/features/staff/api'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'

const doctorSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  specialization: z.string().min(2, 'Enter a specialization'),
  department: z.enum(DEPARTMENTS),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  bio: z.string().min(1, 'Bio is required'),
  experienceYears: z.coerce
    .number()
    .int()
    .min(0, 'Must be positive')
    .max(60, 'Enter a valid number of years'),
})

type DoctorFormInput = z.input<typeof doctorSchema>

interface AddDoctorModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called with the created account (and its one-time temp password) so the caller can refresh its list and relay the password. */
  onCreated: (result: CreateStaffResponse) => void
}

export function AddDoctorModal({ isOpen, onClose, onCreated }: AddDoctorModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DoctorFormInput>({
    resolver: zodResolver(doctorSchema),
    defaultValues: { department: DEPARTMENTS[0] },
  })

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: DoctorFormInput) {
    const parsed = doctorSchema.parse(values)

    try {
      const result = await createStaff({ ...parsed, role: 'doctor' })
      onCreated(result)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to add doctor'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Doctor"
      description="Creates the account with a temporary password you'll relay to them."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
          <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Specialization"
            error={errors.specialization?.message}
            {...register('specialization')}
          />
          <Select
            label="Department"
            options={DEPARTMENTS.map((department) => ({ label: department, value: department }))}
            {...register('department')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Years of experience"
            type="number"
            error={errors.experienceYears?.message}
            {...register('experienceYears')}
          />
        </div>
        <Textarea
          label="Bio"
          placeholder="A short summary patients will see on this doctor's profile"
          error={errors.bio?.message}
          {...register('bio')}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Add doctor
          </Button>
        </div>
      </form>
    </Modal>
  )
}
