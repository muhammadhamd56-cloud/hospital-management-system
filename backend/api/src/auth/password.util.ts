import * as bcrypt from 'bcryptjs';

/**
 * bcrypt embeds its cost factor in the hash string itself (e.g. "$2b$12$..."),
 * so raising this never breaks verification of hashes created under the old
 * value -- compare() reads whatever cost the hash was made with. needsRehash
 * below is how existing users get migrated onto the new cost transparently:
 * checked on their next successful login, no bulk migration job needed.
 */
const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** True when `hash` was created with a lower cost factor than the current
 *  SALT_ROUNDS -- call after a successful verifyPassword to lazily upgrade
 *  the stored hash without forcing a mass password reset. */
export function needsRehash(hash: string): boolean {
  const rounds = bcrypt.getRounds(hash);
  return rounds > 0 && rounds < SALT_ROUNDS;
}
