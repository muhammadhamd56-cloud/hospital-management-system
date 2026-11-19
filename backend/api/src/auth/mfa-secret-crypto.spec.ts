import { randomBytes } from 'crypto';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  isEncryptedMfaSecret,
  MFA_SECRET_PREFIX,
  parseMfaEncryptionKey,
} from './mfa-secret-crypto';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe('mfa-secret-crypto', () => {
  const key = randomBytes(32);

  describe('parseMfaEncryptionKey', () => {
    it('accepts 64 hex characters', () => {
      expect(parseMfaEncryptionKey(key.toString('hex')).equals(key)).toBe(true);
    });

    it('accepts standard and url-safe base64', () => {
      expect(parseMfaEncryptionKey(key.toString('base64')).equals(key)).toBe(true);
      expect(parseMfaEncryptionKey(key.toString('base64url')).equals(key)).toBe(true);
    });

    it.each([
      ['too short', randomBytes(16).toString('base64')],
      ['too long', randomBytes(48).toString('base64')],
      ['63 hex characters', key.toString('hex').slice(1)],
      ['not an encoding', 'not a key at all!'],
      ['empty', ''],
    ])('rejects a key that is %s, without echoing it', (_label, raw) => {
      expect(() => parseMfaEncryptionKey(raw)).toThrow(/32 bytes/);
      if (raw) {
        expect(() => parseMfaEncryptionKey(raw)).not.toThrow(raw);
      }
    });
  });

  it('round-trips a secret and uses the versioned prefix', () => {
    const stored = encryptMfaSecret(SECRET, key, 'user-1');

    expect(stored.startsWith(MFA_SECRET_PREFIX)).toBe(true);
    expect(stored).not.toContain(SECRET);
    expect(stored.slice(MFA_SECRET_PREFIX.length).split(':')).toHaveLength(3);
    expect(isEncryptedMfaSecret(stored)).toBe(true);
    expect(decryptMfaSecret(stored, key, 'user-1')).toBe(SECRET);
  });

  it('uses a fresh IV for every encryption', () => {
    expect(encryptMfaSecret(SECRET, key, 'user-1')).not.toBe(encryptMfaSecret(SECRET, key, 'user-1'));
  });

  it('passes a legacy plain-text value through unchanged, with or without a key', () => {
    expect(isEncryptedMfaSecret(SECRET)).toBe(false);
    expect(decryptMfaSecret(SECRET, key, 'user-1')).toBe(SECRET);
    expect(decryptMfaSecret(SECRET, null, 'user-1')).toBe(SECRET);
  });

  it('detects a tampered ciphertext', () => {
    const stored = encryptMfaSecret(SECRET, key, 'user-1');
    const [iv, tag, data] = stored.slice(MFA_SECRET_PREFIX.length).split(':');
    const bytes = Buffer.from(data, 'base64url');
    bytes[0] ^= 0x01;
    const tampered = `${MFA_SECRET_PREFIX}${iv}:${tag}:${bytes.toString('base64url')}`;

    expect(() => decryptMfaSecret(tampered, key, 'user-1')).toThrow(/failed authentication/);
  });

  it('detects a tampered auth tag', () => {
    const stored = encryptMfaSecret(SECRET, key, 'user-1');
    const [iv, tag, data] = stored.slice(MFA_SECRET_PREFIX.length).split(':');
    const tagBytes = Buffer.from(tag, 'base64url');
    tagBytes[0] ^= 0x01;
    const tampered = `${MFA_SECRET_PREFIX}${iv}:${tagBytes.toString('base64url')}:${data}`;

    expect(() => decryptMfaSecret(tampered, key, 'user-1')).toThrow(/failed authentication/);
  });

  it('rejects a malformed encrypted value', () => {
    expect(() => decryptMfaSecret(`${MFA_SECRET_PREFIX}abc`, key, 'user-1')).toThrow(/Malformed/);
  });

  it('fails with the wrong key', () => {
    const stored = encryptMfaSecret(SECRET, key, 'user-1');
    expect(() => decryptMfaSecret(stored, randomBytes(32), 'user-1')).toThrow(/failed authentication/);
  });

  it('fails when the value is copied onto another user', () => {
    const stored = encryptMfaSecret(SECRET, key, 'user-1');
    expect(() => decryptMfaSecret(stored, key, 'user-2')).toThrow(/failed authentication/);
  });

  it('fails for an encrypted value when no key is configured', () => {
    const stored = encryptMfaSecret(SECRET, key, 'user-1');
    expect(() => decryptMfaSecret(stored, null, 'user-1')).toThrow(/no MFA_ENCRYPTION_KEY/);
  });

  it('never includes the secret or key in error messages', () => {
    const stored = encryptMfaSecret(SECRET, key, 'user-1');
    let message = '';
    try {
      decryptMfaSecret(stored, randomBytes(32), 'user-1');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/failed authentication/);
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain(key.toString('hex'));
    expect(message).not.toContain(key.toString('base64'));
  });
});
