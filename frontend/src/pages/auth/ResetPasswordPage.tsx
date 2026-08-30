import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLocation, useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { KeyRound } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'

const RESEND_COOLDOWN_SECONDS = 60

const schema = z
  .object({
    code: z.string().length(6, 'Enter the 6-digit code'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export function ResetPasswordPage() {
  const { resetPassword, forgotPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const stateEmail = (location.state as { email?: string } | null)?.email
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const [isResending, setIsResending] = useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!stateEmail) {
      navigate(ROUTES.forgotPassword, { replace: true })
    }
  }, [stateEmail, navigate])

  useEffect(() => {
    if (cooldown === 0) return
    const timer = setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  if (!stateEmail) return null

  const email: string = stateEmail

  async function onSubmit(values: FormValues) {
    try {
      await resetPassword(email, values.code, values.newPassword)
      toast.success('Password updated. Please sign in.')
      navigate(ROUTES.login, { replace: true })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    }
  }

  async function handleResend() {
    setIsResending(true)
    try {
      await forgotPassword(email)
      toast.success('If an account exists for that email, a new code has been sent')
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setValue('code', '')
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to resend the code'
      toast.error(message)
    } finally {
      setIsResending(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-6">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <KeyRound className="size-6" aria-hidden="true" />
        </span>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">Reset your password</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Enter the 6-digit code sent to <span className="font-medium text-ink">{email}</span> and choose a new
            password.
          </p>
        </div>

        <form className="flex w-full flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Input
            label="Reset code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="text-center text-lg tracking-[0.5em]"
            error={errors.code?.message}
            {...register('code')}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Reset password
          </Button>
        </form>

        <p className="text-sm text-ink-muted">
          Didn&apos;t get it?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || isResending}
            className="font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline dark:text-brand-300"
          >
            {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
          </button>
        </p>
      </CardContent>
    </Card>
  )
}
