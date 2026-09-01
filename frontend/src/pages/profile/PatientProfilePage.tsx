import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
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
import { detectDefaultCountry, fromE164, phoneErrorMessage, toE164, validatePhone, type CountryCode } from '@/lib/phone'
import { ApiError } from '@/lib/apiClient'

const GENDER_OPTIONS = [
  { label: 'Select gender', value: '' },
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
]

const schema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    phone: z.object({
      country: z.custom<CountryCode>(() => true),
      nationalNumber: z.string(),
    }),
    dateOfBirth: z
      .string()
      .refine((value) => value === '' || new Date(value) <= new Date(), { message: 'Date of birth cannot be in the future' }),
    gender: z.string(),
    address: z.string().trim().max(300, 'Address is too long'),
    emergencyContact: z.string().trim().max(200, 'Emergency contact is too long'),
  })
  .superRefine((values, ctx) => {
    const result = validatePhone(values.phone, { required: false })
    if (!result.valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: phoneErrorMessage(values.phone, result) })
    }
  })

type FormValues = z.infer<typeof schema>

export function PatientProfilePage() {
  const { user, updateProfile, refresh } = useAuth()
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false)
  const [loadedValues, setLoadedValues] = useState<FormValues | null>(null)

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
      dateOfBirth: '',
      gender: '',
      address: '',
      emergencyContact: '',
    },
  })

  useEffect(() => {
    if (!user) return

    const values: FormValues = {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: fromE164(user.phone, detectDefaultCountry()),
      dateOfBirth: user.dateOfBirth?.slice(0, 10) ?? '',
      gender: user.gender ?? '',
      address: user.address ?? '',
      emergencyContact: user.emergencyContact ?? '',
    }
    reset(values)
    setLoadedValues(values)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function onSubmit(values: FormValues) {
    try {
      await updateProfile({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone.nationalNumber ? toE164(values.phone) ?? '' : '',
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        address: values.address,
        emergencyContact: values.emergencyContact,
      })
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

  if (!user) {
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
          <ProfileHeader name={user.fullName} email={user.email} role="patient" picture={user.picture} />
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
            <Input label="Email" type="email" value={user.email} disabled hint="Email cannot be changed here." />
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Date of birth"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                error={errors.dateOfBirth?.message}
                {...register('dateOfBirth')}
              />
              <Select
                label="Gender"
                options={GENDER_OPTIONS}
                error={errors.gender?.message}
                {...register('gender')}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '60ms' }}>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Textarea
              label="Address"
              rows={2}
              error={errors.address?.message}
              {...register('address')}
            />
            <Input
              label="Emergency contact"
              placeholder="Name and phone number"
              error={errors.emergencyContact?.message}
              {...register('emergencyContact')}
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

      <div className="animate-fade-in" style={{ animationDelay: '90ms' }}>
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
