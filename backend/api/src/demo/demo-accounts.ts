/**
 * Shared portfolio-demo logins, seeded by scripts/seed-demo.ts. Kept in one
 * place so the seed and any backend demo-mode logic agree on exactly which
 * accounts are the public demo ones. Emails are lowercase (matching how
 * normalizeEmail stores them).
 */
export const DEMO_ACCOUNT_EMAILS = [
  'admin@demo.hms',
  'doctor@demo.hms',
  'patient@demo.hms',
  'staff@demo.hms',
] as const;

export type DemoAccountEmail = (typeof DEMO_ACCOUNT_EMAILS)[number];

export const DEMO_PASSWORD = 'Demo@1234';

/** Every row the demo seed creates is tied to a user/staff email on this domain. */
export const DEMO_EMAIL_DOMAIN = '@demo.hms';
