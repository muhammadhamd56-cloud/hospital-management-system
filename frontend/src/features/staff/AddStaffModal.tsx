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
import { STAFF_ROLE_OPTIONS, type StaffRole } from '@/types/staff'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  role: z.enum(['doctor', 'staff']),
  specialization: z.string().trim().optional(),
  department: z.string().trim().optional(),
  bio: z.string().trim().optional(),
  experienceYears: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface AddStaffModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (result: CreateStaffResponse) => void
}

export function AddStaffModal({ isOpen, onClose, onCreated }: AddStaffModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { role: 'staff' } })
  const role = watch('role') as StaffRole

  function handleClose() {
    reset()
    onClose()
  }

  async function onSubmit(values: FormValues) {
    const experienceYears = values.experienceYears ? Number(values.experienceYears) : undefined

    if (
      values.role === 'doctor' &&
      (!values.specialization ||
        !values.department ||
        !values.bio ||
        experienceYears === undefined ||
        !Number.isFinite(experienceYears))
    ) {
      toast.error('Please complete the doctor profile fields')
      return
    }

    try {
      const result = await createStaff({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        role: values.role,
        ...(values.role === 'doctor' && {
          specialization: values.specialization,
          department: values.department,
          bio: values.bio,
          experienceYears,
        }),
      })
      onCreated(result)
      handleClose()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to create account'
      toast.error(message)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add staff account"
      description="Creates the account with a temporary password you'll relay to them."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Select
          label="Role"
          error={errors.role?.message}
          {...register('role')}
          options={STAFF_ROLE_OPTIONS}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
          <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="staff@hospital.com"
          error={errors.email?.message}
          {...register('email')}
        />
        {role === 'doctor' && (
          <>
            <Input
              label="Specialization"
              placeholder="Interventional Cardiologist"
              error={errors.specialization?.message}
              {...register('specialization')}
            />
            <Select
              label="Department"
              error={errors.department?.message}
              {...register('department')}
              options={[
                { label: 'Select a department', value: '' },
                ...DEPARTMENTS.map((dept) => ({ label: dept, value: dept })),
              ]}
            />
            <Textarea
              label="Bio"
              placeholder="A short summary patients will see on this doctor's profile"
              error={errors.bio?.message}
              {...register('bio')}
            />
            <Input
              label="Years of experience"
              type="number"
              min={0}
              error={errors.experienceYears?.message}
              {...register('experienceYears')}
            />
          </>
        )}
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create account
          </Button>
        </div>
      </form>
    </Modal>
  )
}
