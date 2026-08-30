import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { RoleSelector } from '@/features/auth/RoleSelector'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/apiClient'
import { ROUTES } from '@/constants/routes'
import { LOGIN_ROLES, type Role } from '@/types/role'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const mfaSchema = z.object({
  code: z.string().min(6, 'Enter the 6-digit code, or a backup code').max(10),
})

type MfaFormValues = z.infer<typeof mfaSchema>

export function ManualLoginForm() {
  const { login, verifyMfa } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>('patient')
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })
  const {
    register: registerMfa,
    handleSubmit: handleMfaSubmit,
    formState: { errors: mfaErrors, isSubmitting: isMfaSubmitting },
  } = useForm<MfaFormValues>({ resolver: zodResolver(mfaSchema) })

  async function onSubmit(values: LoginFormValues) {
    try {
      const result = await login({ ...values, role })
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken)
        return
      }
      toast.success('Signed in successfully')
      navigate(ROUTES.dashboard)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    }
  }

  async function onSubmitMfa(values: MfaFormValues) {
    if (!mfaToken) return
    try {
      await verifyMfa(mfaToken, values.code)
      toast.success('Signed in successfully')
      navigate(ROUTES.dashboard)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Something went wrong'
      toast.error(message)
    }
  }

  if (mfaToken) {
    return (
      <form key="mfa" className="flex w-full flex-col gap-4" onSubmit={handleMfaSubmit(onSubmitMfa)} noValidate>
        <p className="text-sm text-ink-muted">
          Enter the 6-digit code from your authenticator app, or one of your backup codes.
        </p>
        <Input
          label="Authentication code"
          autoComplete="one-time-code"
          placeholder="123456"
          error={mfaErrors.code?.message}
          {...registerMfa('code')}
        />
        <Button type="submit" isLoading={isMfaSubmitting} className="w-full">
          Verify
        </Button>
        <button
          type="button"
          onClick={() => setMfaToken(null)}
          className="self-center text-sm font-medium text-ink-muted hover:underline"
        >
          Back to sign in
        </button>
      </form>
    )
  }

  return (
    <form key="credentials" className="flex w-full flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <RoleSelector roles={LOGIN_ROLES} value={role} onChange={setRole} />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@hospital.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        error={errors.password?.message}
        {...register('password')}
      />
      <button
        type="button"
        onClick={() => navigate(ROUTES.forgotPassword)}
        className="-mt-2 self-end text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
      >
        Forgot password?
      </button>
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Sign in
      </Button>
    </form>
  )
}
