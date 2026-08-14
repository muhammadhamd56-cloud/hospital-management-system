import { createContext, useEffect, useState, type ReactNode } from 'react'
import { API_BASE_URL, api, clearAccessToken, getAccessToken, setAccessToken } from '@/lib/apiClient'
import type { AuthRole, Role } from '@/types/role'

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  /** Derived as `${firstName} ${lastName}`, for components built around a single display name. */
  fullName: string
  picture: string | null
  role: Role
  /** False until the user completes the one-time post-signup role picker. */
  roleSelected: boolean
  /** False for Google-only accounts — they can't sign in with email/password yet. */
  hasPassword: boolean
  /** False for local signups until they complete OTP email verification. Always true for Google accounts. */
  emailVerified: boolean
  /** True for admin-provisioned staff accounts until they set their own password. */
  mustChangePassword: boolean
}

interface RawUser {
  id: string
  email: string
  firstName: string
  lastName: string
  picture: string | null
  role: Role
  roleSelected: boolean
  hasPassword: boolean
  emailVerified: boolean
  mustChangePassword: boolean
}

function toAuthUser(raw: RawUser): AuthUser {
  return {
    ...raw,
    fullName: `${raw.firstName} ${raw.lastName}`.trim() || raw.email,
  }
}

export interface LoginInput {
  email: string
  password: string
  role: Role
}

export interface SignupInput {
  firstName: string
  lastName: string
  email: string
  password: string
  role: AuthRole
  specialization?: string
  department?: string
  bio?: string
  experienceYears?: number
}

interface AuthResponse {
  token: string
  user: RawUser
}

export interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  /** Manual email/password sign-in, with an explicit role claim. */
  login: (input: LoginInput) => Promise<void>
  /**
   * Manual email/password signup. Does NOT log the user in — the account
   * starts unverified and an OTP is emailed; call `verifyOtp` to complete
   * sign-in. Role is chosen explicitly here, so roleSelected is already
   * true once verified — no post-verify role picker needed.
   */
  signup: (input: SignupInput) => Promise<void>
  /** Submits the emailed OTP; on success this is the actual sign-in moment (stores the token). */
  verifyOtp: (email: string, code: string) => Promise<void>
  /** Requests a fresh OTP for an unverified account (subject to a server-side cooldown). */
  resendOtp: (email: string) => Promise<void>
  /** Navigates the browser to the backend's Google OAuth entry point. */
  loginWithGoogle: () => void
  /** Called by OAuthCallbackPage once Google redirects back with a token. */
  completeOAuthCallback: (token: string) => Promise<void>
  /** One-time role pick shown right after a user's first Google sign-in. */
  selectRole: (role: AuthRole) => Promise<void>
  /** Re-fetches the current user — call after a change the context doesn't already know about. */
  refresh: () => Promise<void>
  /** Permanently deletes the account, then clears the local session. Irreversible. */
  deleteAccount: () => Promise<void>
  /** Revokes the session server-side (so the current token can no longer reach the API), then clears it locally. */
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const GOOGLE_LOGIN_URL = `${API_BASE_URL}/api/auth/google`

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function refresh() {
    if (!getAccessToken()) {
      setUser(null)
      setIsLoading(false)
      return
    }

    try {
      const raw = await api.get<RawUser>('/users/me')
      setUser(toAuthUser(raw))
    } catch {
      clearAccessToken()
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(input: LoginInput) {
    const res = await api.post<AuthResponse>('/auth/login', input)
    setAccessToken(res.token)
    setUser(toAuthUser(res.user))
  }

  async function signup(input: SignupInput) {
    await api.post<{ email: string }>('/auth/signup', input)
  }

  async function verifyOtp(email: string, code: string) {
    const res = await api.post<AuthResponse>('/auth/verify-otp', { email, code })
    setAccessToken(res.token)
    setUser(toAuthUser(res.user))
  }

  async function resendOtp(email: string) {
    await api.post<{ message: string }>('/auth/resend-otp', { email })
  }

  function loginWithGoogle() {
    window.location.href = GOOGLE_LOGIN_URL
  }

  async function completeOAuthCallback(token: string) {
    setAccessToken(token)
    await refresh()
  }

  async function selectRole(role: AuthRole) {
    const raw = await api.patch<RawUser>('/users/me/role', { role })
    setUser(toAuthUser(raw))
  }

  async function deleteAccount() {
    await api.del<void>('/users/me')
    clearAccessToken()
    setUser(null)
  }

  async function logout() {
    try {
      await api.post<void>('/auth/logout')
    } catch {
      // Token may already be expired/revoked -- still proceed to clear the local session below.
    } finally {
      clearAccessToken()
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        signup,
        verifyOtp,
        resendOtp,
        loginWithGoogle,
        completeOAuthCallback,
        selectRole,
        refresh,
        deleteAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
