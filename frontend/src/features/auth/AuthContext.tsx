import { createContext, useEffect, useState, type ReactNode } from 'react'
import { API_BASE_URL, api, clearAccessToken, getAccessToken, onUnauthorized, setAccessToken } from '@/lib/apiClient'
import type { AuthRole, Role } from '@/types/role'
import type { StaffType } from '@/types/staffScheduling'

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  /** Derived as `${firstName} ${lastName}`, for components built around a single display name. */
  fullName: string
  phone: string | null
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
  /** Whether TOTP-based two-factor auth is currently turned on. */
  mfaEnabled: boolean
  /** Only meaningful for role === 'staff' -- the roster categorization of
   *  their linked Staff row (e.g. 'lab_technician'). Null when the role
   *  isn't 'staff', or when a self-signed-up staff account hasn't been
   *  linked to the scheduling roster by an admin yet. */
  staffType: StaffType | null
}

interface RawUser {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  picture: string | null
  role: Role
  roleSelected: boolean
  hasPassword: boolean
  emailVerified: boolean
  mustChangePassword: boolean
  mfaEnabled: boolean
}

/** Only STAFF-role accounts have a staffType, and only once an admin has
 *  linked them to the scheduling roster -- a 404 here just means "not
 *  linked yet", not an error worth surfacing. */
async function fetchStaffType(): Promise<StaffType | null> {
  try {
    const res = await api.get<{ profile: { staffType: StaffType } }>('/staff-portal/profile')
    return res.profile.staffType
  } catch {
    return null
  }
}

async function toAuthUser(raw: RawUser): Promise<AuthUser> {
  const staffType = raw.role === 'staff' ? await fetchStaffType() : null
  return {
    ...raw,
    fullName: `${raw.firstName} ${raw.lastName}`.trim() || raw.email,
    staffType,
  }
}

export interface LoginInput {
  email: string
  password: string
  role: Role
}

export interface UpdateProfileInput {
  firstName?: string
  lastName?: string
  phone?: string
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

/** What POST /auth/login actually returns -- either a real session, or (for
 *  an MFA-enabled account) a challenge to complete via verifyMfa instead. */
type LoginApiResponse = AuthResponse | { mfaRequired: true; mfaToken: string }

export type LoginResult = { mfaRequired: false } | { mfaRequired: true; mfaToken: string }

export interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  /** Manual email/password sign-in, with an explicit role claim. Resolves
   *  to `{ mfaRequired: true, mfaToken }` instead of signing in directly
   *  when the account has two-factor auth enabled -- call verifyMfa with
   *  that token next. */
  login: (input: LoginInput) => Promise<LoginResult>
  /** Completes an MFA-gated login: the challenge token from `login`, plus a
   *  TOTP or backup code. */
  verifyMfa: (mfaToken: string, code: string) => Promise<void>
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
  /** Requests a password-reset code by email. Always resolves the same way
   *  whether or not the address has an account — the server never reveals
   *  which, and this deliberately doesn't either. */
  forgotPassword: (email: string) => Promise<void>
  /** Submits the emailed reset code with a new password. Does not sign the
   *  user in — they sign in normally afterward with the new password. */
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>
  /** Navigates the browser to the backend's Google OAuth entry point. */
  loginWithGoogle: () => void
  /** Called by OAuthCallbackPage once Google redirects back with a token. */
  completeOAuthCallback: (token: string) => Promise<void>
  /** One-time role pick shown right after a user's first Google sign-in. */
  selectRole: (role: AuthRole) => Promise<void>
  /** Updates the caller's own name/phone. Fields omitted are left unchanged. */
  updateProfile: (input: UpdateProfileInput) => Promise<void>
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
      setUser(await toAuthUser(raw))
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

  // An expired/revoked token surfaces as a 401 from any authenticated
  // request, not just /users/me -- clearing the session here (rather than
  // only in refresh()) means ProtectedRoute redirects to login right away
  // instead of leaving the user on a page that just keeps failing.
  useEffect(() => {
    onUnauthorized(() => {
      clearAccessToken()
      setUser(null)
    })
  }, [])

  async function login(input: LoginInput): Promise<LoginResult> {
    const res = await api.post<LoginApiResponse>('/auth/login', input)

    if ('mfaRequired' in res) {
      return { mfaRequired: true, mfaToken: res.mfaToken }
    }

    setAccessToken(res.token)
    setUser(await toAuthUser(res.user))
    return { mfaRequired: false }
  }

  async function verifyMfa(mfaToken: string, code: string) {
    const res = await api.post<AuthResponse>('/auth/mfa/verify', { mfaToken, code })
    setAccessToken(res.token)
    setUser(await toAuthUser(res.user))
  }

  async function signup(input: SignupInput) {
    await api.post<{ email: string }>('/auth/signup', input)
  }

  async function verifyOtp(email: string, code: string) {
    const res = await api.post<AuthResponse>('/auth/verify-otp', { email, code })
    setAccessToken(res.token)
    setUser(await toAuthUser(res.user))
  }

  async function resendOtp(email: string) {
    await api.post<{ message: string }>('/auth/resend-otp', { email })
  }

  async function forgotPassword(email: string) {
    await api.post<{ message: string }>('/auth/forgot-password', { email })
  }

  async function resetPassword(email: string, code: string, newPassword: string) {
    await api.post<{ message: string }>('/auth/reset-password', { email, code, newPassword })
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
    setUser(await toAuthUser(raw))
  }

  async function updateProfile(input: UpdateProfileInput) {
    const raw = await api.patch<RawUser>('/users/me', input)
    setUser(await toAuthUser(raw))
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
        verifyMfa,
        signup,
        verifyOtp,
        resendOtp,
        forgotPassword,
        resetPassword,
        loginWithGoogle,
        completeOAuthCallback,
        selectRole,
        updateProfile,
        refresh,
        deleteAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
