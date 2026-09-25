/**
 * Mirrors backend/api/src/auth/password-policy.ts rule-for-rule so the
 * live checklist never tells a user "looks good" for a password the
 * server is about to reject (or vice versa). The backend is still the
 * actual gate -- this is UX only.
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 64

export interface PasswordRule {
  id: string
  label: string
  test: (password: string) => boolean
}

/**
 * Small, well-known-weak-password blocklist -- same entries as
 * backend/api/src/auth/password-policy.ts's COMMON_PASSWORDS. Not
 * exhaustive; the backend is the real gate, this is just so a user isn't
 * surprised by a rejection the checklist gave no hint about.
 */
const COMMON_PASSWORDS = new Set(
  [
    'password',
    'password1',
    'password123',
    'passw0rd',
    '12345678',
    '123456789',
    '1234567890',
    'qwerty123',
    'qwertyuiop',
    'letmein123',
    'welcome123',
    'admin1234',
    'iloveyou1',
    'monkey123',
    'dragon123',
    'football1',
    'baseball1',
    'trustno1',
    'sunshine1',
    'princess1',
    'abc123456',
    '1q2w3e4r5t',
    'zaq12wsx',
    'starwars1',
    'superman1',
    'whatever1',
    'hospital1',
    'hospital123',
    'changeme1',
    'letmein!',
    'password!',
    'p@ssword1',
    'p@ssw0rd1',
    'qwerty1234',
    'administrator',
    'iloveyou123',
    '123456789a',
    'passw0rd!',
    'Password1!',
    'Welcome1!',
    'Admin@123',
    'Qwerty123!',
  ].map((p) => p.toLowerCase()),
)

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
  },
  { id: 'uppercase', label: 'One uppercase letter', test: (password) => /[A-Z]/.test(password) },
  { id: 'lowercase', label: 'One lowercase letter', test: (password) => /[a-z]/.test(password) },
  { id: 'number', label: 'One number', test: (password) => /[0-9]/.test(password) },
  { id: 'special', label: 'One special character', test: (password) => /[^A-Za-z0-9]/.test(password) },
  {
    id: 'notCommon',
    label: 'Not a commonly used password',
    test: (password) => !COMMON_PASSWORDS.has(password.trim().toLowerCase()),
  },
]

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}

/** Shared zod `.refine` message/predicate so every signup-style schema
 *  (create account, reset password, set password) enforces the same rule
 *  set instead of each hand-rolling its own `.regex()` chain. */
export const STRONG_PASSWORD_MESSAGE =
  'Password must be 8-64 characters and include an uppercase letter, a lowercase letter, a number, and a special character'
