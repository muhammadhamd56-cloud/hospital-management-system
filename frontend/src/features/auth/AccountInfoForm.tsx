import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().trim().optional(),
})

type FormValues = z.infer<typeof schema>

/** Editable name/phone form shown in Settings, shared across patient/doctor roles. */
export function AccountInfoForm() {
  const { user, updateProfile } = useAuth()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  // Depend on the primitive fields, not the `user` object itself -- useAuth()
  // may return a new object reference on every render (it does under some
  // test mocks), which would otherwise re-run this effect -> reset() ->
  // re-render -> effect again, forever.
  useEffect(() => {
    if (user) {
      reset({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.firstName, user?.lastName, user?.phone, reset])

  async function onSubmit(values: FormValues) {
    try {
      await updateProfile(values)
      toast.success('Profile updated')
      reset(values)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update profile'
      toast.error(message)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex items-center gap-4">
        <Avatar name={user?.fullName ?? ''} src={user?.picture ?? undefined} size="lg" />
        <div className="text-sm text-ink-muted">{user?.email}</div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
        <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
      </div>
      <Input
        label="Phone number"
        type="tel"
        placeholder="Optional"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <div className="flex justify-end">
        <Button type="submit" isLoading={isSubmitting} disabled={!isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
