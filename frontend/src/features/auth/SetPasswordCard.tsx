import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { PasswordRequirements } from '@/components/ui/PasswordRequirements'
import { Button } from '@/components/ui/Button'
import { setPassword } from '@/features/auth/api'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { isStrongPassword, STRONG_PASSWORD_MESSAGE } from '@/lib/passwordPolicy'

const schema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().refine(isStrongPassword, { message: STRONG_PASSWORD_MESSAGE }),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export interface SetPasswordCardProps {
  /** Called after a successful password change/set, once the refreshed user is available. */
  onSuccess?: () => void
}

/** Lets a Google-only account add a password (or an existing local account change one). */
export function SetPasswordCard({ onSuccess }: SetPasswordCardProps = {}) {
  const { user, refresh } = useAuth()
  const hasPassword = user?.hasPassword ?? false
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })
  const newPassword = watch('newPassword') ?? ''

  async function onSubmit(values: FormValues) {
    if (hasPassword && !values.currentPassword) {
      toast.error('Enter your current password')
      return
    }

    try {
      await setPassword({
        currentPassword: hasPassword ? values.currentPassword : undefined,
        newPassword: values.newPassword,
      })
      toast.success(
        hasPassword ? 'Password updated' : 'Password set — you can now sign in with email and password',
      )
      reset()
      await refresh()
      onSuccess?.()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update password'
      toast.error(message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasPassword ? 'Change password' : 'Set a password'}</CardTitle>
        <CardDescription>
          {hasPassword
            ? 'Update the password used for email/password sign-in.'
            : 'This account currently only supports "Continue with Google". Set a password to also sign in with email and password.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {hasPassword && (
            <PasswordInput
              label="Current password"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <PasswordInput
                label="New password"
                autoComplete="new-password"
                error={errors.newPassword?.message}
                {...register('newPassword')}
              />
              <PasswordRequirements password={newPassword} />
            </div>
            <PasswordInput
              label="Confirm new password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </div>
          <div className="mt-2 flex justify-end">
            <Button type="submit" isLoading={isSubmitting}>
              {hasPassword ? 'Update password' : 'Set password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
