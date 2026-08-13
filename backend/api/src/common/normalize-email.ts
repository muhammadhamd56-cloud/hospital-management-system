/**
 * Emails are matched by exact string equality against `User.email` (a plain
 * unique column, not a case-insensitive one), so two logically-identical
 * addresses that differ only in case would otherwise be treated as
 * different accounts — e.g. autocapitalized "Ada@example.com" failing to
 * find an account stored as "ada@example.com" and reporting a misleading
 * "Invalid email or password". Normalize at every entry point (signup,
 * login, Google OAuth) so lookups and storage are consistently lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
