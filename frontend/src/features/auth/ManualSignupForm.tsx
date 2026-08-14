import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { RoleSelector } from '@/features/auth/RoleSelector'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import { DEPARTMENTS } from '@/types/doctor'
import { AUTH_ROLES, type AuthRole } from '@/types/role'

const signupSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
    specialization: z.string().trim().optional(),
    department: z.string().trim().optional(),
    bio: z.string().trim().optional(),
    experienceYears: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type SignupFormValues = z.infer<typeof signupSchema>

export function ManualSignupForm() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<AuthRole>('patient')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) })

  async function onSubmit(values: SignupFormValues) {
    const experienceYears = values.experienceYears ? Number(values.experienceYears) : undefined

    if (
      role === 'doctor' &&
      (!values.specialization ||
        !values.department ||
        !values.bio ||
        experienceYears === undefined ||
        !Number.isFinite(experienceYears))
    ) {
      toast.error('Please complete your doctor profile fields')
      return
    }

    try {
      await signup({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        role,
        ...(role === 'doctor' && {
          specialization: values.specialization,
          department: values.department,
          bio: values.bio,
          experienceYears,
        }),
      })
      navigate(ROUTES.verifyEmail, { state: { email: values.email } })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    }
  }

  return (
    <form className="flex w-full flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <RoleSelector roles={AUTH_ROLES} value={role} onChange={setRole} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
        <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
      </div>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@hospital.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
      </div>
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
            placeholder="A short summary patients will see on your profile"
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
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Create account
      </Button>
    </form>
  )
}
