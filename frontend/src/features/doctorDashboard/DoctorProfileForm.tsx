import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { getDoctorProfile, upsertDoctorProfile } from '@/features/doctorDashboard/api'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'

const profileSchema = z.object({
  specialization: z.string().trim().min(1, 'Specialization is required'),
  department: z.string().trim().min(1, 'Department is required'),
  bio: z.string().trim().min(1, 'Bio is required'),
  experienceYears: z
    .string()
    .min(1, 'Years of experience is required')
    .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, {
      message: 'Enter a valid number of years',
    }),
})

type ProfileFormValues = z.infer<typeof profileSchema>

export function DoctorProfileForm() {
  const [isLoading, setIsLoading] = useState(true)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({ resolver: zodResolver(profileSchema) })

  useEffect(() => {
    getDoctorProfile()
      .then((res) => {
        if (res.profile) {
          reset({
            specialization: res.profile.specialization,
            department: res.profile.department,
            bio: res.profile.bio,
            experienceYears: String(res.profile.experienceYears),
          })
        }
      })
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load your profile'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [reset])

  async function onSubmit(values: ProfileFormValues) {
    try {
      await upsertDoctorProfile({
        specialization: values.specialization,
        department: values.department,
        bio: values.bio,
        experienceYears: Number(values.experienceYears),
      })
      toast.success('Profile saved')
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to save your profile'
      toast.error(message)
    }
  }

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading your profile…</p>
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
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
      <Button type="submit" isLoading={isSubmitting} className="w-fit">
        Save profile
      </Button>
    </form>
  )
}
