import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { setPassword } from '@/features/auth/api'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'

const schema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Please confirm your new password'),
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
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

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
            <Input
              label="Current password"
              type="password"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="New password"
              type="password"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
            <Input
              label="Confirm new password"
              type="password"
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
