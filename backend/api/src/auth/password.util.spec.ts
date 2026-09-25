import * as bcrypt from 'bcryptjs';
import { hashPassword, needsRehash, verifyPassword } from './password.util';

describe('hashPassword / verifyPassword', () => {
  it('never stores the password as plaintext', async () => {
    const hash = await hashPassword('correct-password');
    expect(hash).not.toBe('correct-password');
  });

  it('verifies a matching password against its own hash', async () => {
    const hash = await hashPassword('correct-password');
    await expect(verifyPassword('correct-password', hash)).resolves.toBe(true);
  });

  it('rejects a non-matching password', async () => {
    const hash = await hashPassword('correct-password');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces a hash still verifiable after the cost factor was raised (backward compatibility)', async () => {
    // Simulates an existing user's hash from before SALT_ROUNDS was raised --
    // bcrypt embeds the cost in the hash itself, so compare() must still work.
    const legacyHash = await bcrypt.hash('correct-password', 10);
    await expect(verifyPassword('correct-password', legacyHash)).resolves.toBe(true);
  });
});

describe('needsRehash', () => {
  it('is false for a hash created at the current cost factor', async () => {
    const hash = await hashPassword('correct-password');
    expect(needsRehash(hash)).toBe(false);
  });

  it('is true for a hash created under a lower, older cost factor', async () => {
    const legacyHash = await bcrypt.hash('correct-password', 10);
    expect(needsRehash(legacyHash)).toBe(true);
  });
});
