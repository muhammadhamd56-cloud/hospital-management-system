import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { DEPARTMENTS } from '@/types/doctor'
import type { DirectoryDoctor } from '@/types/directoryDoctor'

const doctorSchema = z.object({
  fullName: z.string().min(2, 'Enter the doctor’s full name'),
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
  onAdd: (doctor: DirectoryDoctor) => void
}

export function AddDoctorModal({ isOpen, onClose, onAdd }: AddDoctorModalProps) {
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
    await new Promise((resolve) => setTimeout(resolve, 400))
    onAdd({
      id: `local-${crypto.randomUUID().slice(0, 8)}`,
      rating: 4.5,
      acceptsOnline: true,
      isAvailable: true,
      ...parsed,
    })
    toast.success(`${parsed.fullName} was added`)
    handleClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Doctor"
      description="Add a new doctor to the staff directory."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input label="Full name" error={errors.fullName?.message} {...register('fullName')} />
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
