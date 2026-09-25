import { registerDecorator, type ValidationOptions } from 'class-validator';
import { randomBytes, randomInt } from 'crypto';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

/**
 * Small, well-known-weak-password blocklist. Not exhaustive by design --
 * this catches the passwords that show up at the top of every breach
 * corpus (rockyou, etc.), not a full dictionary. Checked case-insensitively
 * against the whole password so "Password1!" is still rejected even though
 * it otherwise satisfies every character-class rule.
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
    // These four satisfy the character-class rules below on their own (one
    // of each: upper/lower/digit/special) -- exactly the shape a "complex"
    // password policy trains people to produce, and exactly why they're
    // some of the most common passwords in real breach corpora.
    'Password1!',
    'Welcome1!',
    'Admin@123',
    'Qwerty123!',
  ].map((p) => p.toLowerCase()),
);

export interface PasswordRuleResult {
  id: string;
  label: string;
  passed: boolean;
}

/**
 * Evaluated once and shared by both the class-validator decorator below and
 * anything (e.g. an admin tool) that wants the itemized pass/fail list
 * instead of a single boolean -- kept here rather than duplicated so the
 * frontend's live checklist and the backend's hard gate can never drift
 * apart on what "strong" means.
 */
export function evaluatePasswordRules(password: string): PasswordRuleResult[] {
  return [
    {
      id: 'length',
      label: `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`,
      passed: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { id: 'uppercase', label: 'One uppercase letter', passed: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'One lowercase letter', passed: /[a-z]/.test(password) },
    { id: 'number', label: 'One number', passed: /[0-9]/.test(password) },
    {
      id: 'special',
      label: 'One special character',
      passed: /[^A-Za-z0-9]/.test(password),
    },
    {
      id: 'notCommon',
      label: 'Not a commonly used password',
      passed: !COMMON_PASSWORDS.has(password.trim().toLowerCase()),
    },
  ];
}

export function isStrongPassword(password: string): boolean {
  return typeof password === 'string' && evaluatePasswordRules(password).every((rule) => rule.passed);
}

/**
 * Bundles length + character-class + common-password checks into one
 * decorator so every password-creating DTO enforces the identical policy
 * (rather than each hand-rolling its own MinLength/Matches combination and
 * risking the set drifting between signup, reset, and set-password).
 * Deliberately does NOT restrict which Unicode characters are allowed --
 * spaces and non-ASCII characters are fine as long as the class-count rules
 * are met, so a real passphrase isn't penalized for using them.
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'Password must be 8-64 characters and include an uppercase letter, a lowercase letter, a number, and a special character',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isStrongPassword(value);
        },
      },
    });
  };
}

/**
 * Server-generated temp password for admin-provisioned accounts (staff,
 * patient intake). Not run through IsStrongPassword itself since it never
 * passes through a DTO, but built to satisfy the same policy on the nose --
 * mustChangePassword forces a real one on first login regardless, this is
 * just defense in depth for the (short) window before that happens.
 */
export function generateStrongTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*_-+=';
  const all = upper + lower + digits + special;

  const pick = (charset: string) => charset[randomInt(0, charset.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  const rest = Array.from({ length: 12 }, () => pick(all));

  return [...required, ...rest]
    .sort(() => randomBytes(1)[0] - 128)
    .join('');
}
