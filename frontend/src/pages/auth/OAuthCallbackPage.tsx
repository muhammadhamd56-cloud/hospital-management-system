import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/features/auth/useAuth'
import { ROUTES } from '@/constants/routes'

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const { completeOAuthCallback } = useAuth()
  const navigate = useNavigate()
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    // On success the backend has already set the session cookies -- only a
    // failure carries anything in the URL.
    if (searchParams.get('error')) {
      toast.error('Google sign-in failed. Please try again.')
      navigate(ROUTES.login, { replace: true })
      return
    }

    completeOAuthCallback()
      .then(() => navigate(ROUTES.dashboard, { replace: true }))
      .catch(() => {
        toast.error('Could not complete sign-in')
        navigate(ROUTES.login, { replace: true })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-alt">
      <Loader2 className="size-6 animate-spin text-brand-600" aria-hidden="true" />
    </div>
  )
}
