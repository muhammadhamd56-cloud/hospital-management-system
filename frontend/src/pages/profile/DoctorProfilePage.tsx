import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { useAuth } from '@/features/auth/useAuth'
import { ProfileHeader } from '@/features/profile/ProfileHeader'
import { UnsavedChangesPrompt } from '@/features/profile/UnsavedChangesPrompt'
import { SetPasswordCard } from '@/features/auth/SetPasswordCard'
import { AvailabilityToggle } from '@/features/doctorDashboard/AvailabilityToggle'
import { getDoctorProfile, upsertDoctorProfile } from '@/features/doctorDashboard/api'
import { detectDefaultCountry, fromE164, phoneErrorMessage, toE164, validatePhone, type CountryCode } from '@/lib/phone'
import { ApiError } from '@/lib/apiClient'
import { DEPARTMENTS } from '@/types/doctor'

const schema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    phone: z.object({
      country: z.custom<CountryCode>(() => true),
      nationalNumber: z.string(),
    }),
    specialization: z.string().trim().min(1, 'Specialization is required'),
    qualifications: z.string().trim().max(300, 'Qualifications is too long').optional(),
    department: z.string().trim().min(1, 'Department is required'),
    experienceYears: z
      .string()
      .min(1, 'Years of experience is required')
      .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 80, {
        message: 'Enter a valid number of years (0-80)',
      }),
    bio: z.string().trim().min(1, 'Bio is required'),
    consultationFee: z
      .string()
      .min(1, 'Consultation fee is required')
      .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100_000, {
        message: 'Enter a valid amount, or 0 for no charge',
      }),
  })
  .superRefine((values, ctx) => {
    const result = validatePhone(values.phone, { required: false })
    if (!result.valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: phoneErrorMessage(values.phone, result) })
    }
  })

type FormValues = z.infer<typeof schema>

export function DoctorProfilePage() {
  const { user, updateProfile, refresh } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false)
  const [loadedValues, setLoadedValues] = useState<FormValues | null>(null)
  // Not shown in the UI (nothing in this feature's spec calls for it), but
  // DoctorProfileDto requires it on every save -- carried through unedited
  // from whatever was already loaded so saving Profile can't silently reset it.
  const [appointmentDurationMinutes, setAppointmentDurationMinutes] = useState(30)

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: { country: detectDefaultCountry(), nationalNumber: '' },
      specialization: '',
      qualifications: '',
      department: '',
      experienceYears: '',
      bio: '',
      consultationFee: '',
    },
  })

  useEffect(() => {
    if (!user) return

    getDoctorProfile()
      .then((res) => {
        const profile = res.profile
        if (profile) setAppointmentDurationMinutes(profile.appointmentDurationMinutes)

        const values: FormValues = {
          firstName: user.firstName,
          lastName: user.lastName,
          phone: fromE164(user.phone, detectDefaultCountry()),
          specialization: profile?.specialization ?? '',
          qualifications: profile?.qualifications ?? '',
          department: profile?.department ?? '',
          experienceYears: profile ? String(profile.experienceYears) : '',
          bio: profile?.bio ?? '',
          consultationFee: profile ? String(profile.consultationFee) : '',
        }
        reset(values)
        setLoadedValues(values)
      })
      .catch((error) => {
        const message = error instanceof ApiError ? error.message : 'Failed to load your profile'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function onSubmit(values: FormValues) {
    try {
      await Promise.all([
        updateProfile({
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone.nationalNumber ? toE164(values.phone) ?? '' : '',
        }),
        upsertDoctorProfile({
          specialization: values.specialization,
          qualifications: values.qualifications || undefined,
          department: values.department,
          bio: values.bio,
          experienceYears: Number(values.experienceYears),
          consultationFee: Number(values.consultationFee),
          appointmentDurationMinutes,
        }),
      ])
      toast.success('Profile updated successfully.')
      reset(values)
      setLoadedValues(values)
      await refresh()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update your profile'
      toast.error(message)
    }
  }

  function handleCancel() {
    if (isDirty) setIsCancelConfirmOpen(true)
  }

  function confirmDiscard() {
    if (loadedValues) reset(loadedValues)
    setIsCancelConfirmOpen(false)
  }

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading your profile…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-semibold text-ink">Profile</h1>
        <p className="text-sm text-ink-muted">Your personal and account information</p>
      </div>

      <Card className="animate-fade-in">
        <CardContent>
          <ProfileHeader name={user?.fullName ?? ''} email={user?.email ?? ''} role="doctor" picture={user?.picture} />
        </CardContent>
      </Card>

      <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Full name" error={errors.firstName?.message} {...register('firstName')} />
              <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
            </div>
            <Input label="Email" type="email" value={user?.email ?? ''} disabled hint="Email cannot be changed here." />
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  label="Phone number"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.phone?.message as string | undefined}
                />
              )}
            />
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <CardHeader>
            <CardTitle>Professional Information</CardTitle>
            <CardDescription>This is what patients see when they search for and book you.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input label="Specialization" error={errors.specialization?.message} {...register('specialization')} />
            <Input
              label="Qualifications"
              placeholder="MBBS, FCPS"
              hint="Optional"
              error={errors.qualifications?.message}
              {...register('qualifications')}
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
            <Input
              label="Experience (years)"
              type="number"
              min={0}
              max={80}
              error={errors.experienceYears?.message}
              {...register('experienceYears')}
            />
            <Textarea label="About / Bio" error={errors.bio?.message} {...register('bio')} />
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '90ms' }}>
          <CardHeader>
            <CardTitle>Consultation</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              label="Consultation fee (USD)"
              type="number"
              min={0}
              step="0.01"
              error={errors.consultationFee?.message}
              {...register('consultationFee')}
            />
          </CardContent>
        </Card>

        <div className="sticky bottom-0 -mx-4 animate-fade-in border-t border-surface-border bg-surface-alt/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-card sm:border sm:border-surface-border sm:bg-surface">
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={!isDirty || isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} disabled={!isDirty}>
              Save Changes
            </Button>
          </div>
        </div>
      </form>

      <Card className="animate-fade-in" style={{ animationDelay: '120ms' }}>
        <CardHeader>
          <CardTitle>Availability</CardTitle>
          <CardDescription>Whether patients currently see you as available to book.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityToggle labelClass="text-sm font-medium text-ink" />
        </CardContent>
      </Card>

      <div className="animate-fade-in" style={{ animationDelay: '150ms' }}>
        <SetPasswordCard />
      </div>

      <ConfirmDialog
        isOpen={isCancelConfirmOpen}
        onClose={() => setIsCancelConfirmOpen(false)}
        onConfirm={confirmDiscard}
        title="Discard your changes?"
        description="You have unsaved changes. Are you sure you want to leave?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        variant="danger"
      />

      <UnsavedChangesPrompt isDirty={isDirty} />
    </div>
  )
}
