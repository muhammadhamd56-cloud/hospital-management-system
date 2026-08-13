import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLocation, useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { MailCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'

const RESEND_COOLDOWN_SECONDS = 60

const codeSchema = z.object({
  code: z.string().length(6, 'Enter the 6-digit code'),
})

type CodeFormValues = z.infer<typeof codeSchema>

export function VerifyEmailPage() {
  const { verifyOtp, resendOtp } = useAuth()
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
  } = useForm<CodeFormValues>({ resolver: zodResolver(codeSchema) })

  useEffect(() => {
    if (!stateEmail) {
      navigate(ROUTES.login, { replace: true })
    }
  }, [stateEmail, navigate])

  useEffect(() => {
    if (cooldown === 0) return
    const timer = setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  if (!stateEmail) return null

  const email: string = stateEmail

  async function onSubmit(values: CodeFormValues) {
    try {
      await verifyOtp(email, values.code)
      toast.success('Email verified')
      navigate(ROUTES.dashboard, { replace: true })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    }
  }

  async function handleResend() {
    setIsResending(true)
    try {
      await resendOtp(email)
      toast.success('A new code was sent')
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
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">Check your email</h1>
          <p className="mt-1 text-sm text-ink-muted">
            We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>.
          </p>
        </div>

        <form className="flex w-full flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Input
            label="Verification code"
            hideLabel
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="text-center text-lg tracking-[0.5em]"
            error={errors.code?.message}
            {...register('code')}
          />
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Verify
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
