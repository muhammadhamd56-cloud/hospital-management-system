import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { KeyRound } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
})

type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    try {
      await forgotPassword(values.email)
      toast.success('If an account exists for that email, a reset code has been sent')
      navigate(ROUTES.resetPassword, { state: { email: values.email } })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-6">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <KeyRound className="size-6" aria-hidden="true" />
        </span>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">Forgot your password?</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Enter your account email and we&apos;ll send you a code to reset it.
          </p>
        </div>

        <form className="flex w-full flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@hospital.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Send reset code
          </Button>
        </form>

        <p className="text-sm text-ink-muted">
          Remembered it?{' '}
          <button
            type="button"
            onClick={() => navigate(ROUTES.login)}
            className="font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            Back to sign in
          </button>
        </p>
      </CardContent>
    </Card>
  )
}
