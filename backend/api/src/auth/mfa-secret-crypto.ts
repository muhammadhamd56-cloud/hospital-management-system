import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * At-rest encryption for User.mfaSecret (AES-256-GCM).
 *
 * Stored format: `enc:v1:<iv>:<tag>:<ciphertext>`, each part base64url.
 * A value without the `enc:v1:` prefix is a legacy plain-text secret and is
 * passed through unchanged, so rows written before encryption keep working.
 *
 * The user id is bound in as additional authenticated data, so a ciphertext
 * copied onto another user's row fails to decrypt instead of granting that
 * user the copied second factor.
 *
 * Nothing in here logs; never put the secret or the key in an error message.
 */

export const MFA_SECRET_PREFIX = 'enc:v1:';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

const HEX_KEY = /^[0-9a-fA-F]{64}$/;
const BASE64_KEY = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * Parses MFA_ENCRYPTION_KEY: 32 bytes given either as 64 hex characters or
 * as base64 (standard or url-safe). Throws (without echoing the value) when
 * the input is not exactly 32 bytes in one of those encodings.
 */
export function parseMfaEncryptionKey(raw: string): Buffer {
  const value = raw.trim();

  if (HEX_KEY.test(value)) {
    return Buffer.from(value, 'hex');
  }

  if (BASE64_KEY.test(value)) {
    const key = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (key.length === KEY_BYTES) {
      return key;
    }
  }

  throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes, given as base64 or as 64 hex characters');
}

export function isEncryptedMfaSecret(stored: string): boolean {
  return stored.startsWith(MFA_SECRET_PREFIX);
}

/** Encrypts a base32 TOTP secret for storage. A fresh random IV per call. */
export function encryptMfaSecret(plain: string, key: Buffer, userId: string): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(userId, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${MFA_SECRET_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

/**
 * Returns the plain-text secret. Legacy (unprefixed) values are returned
 * as-is. Encrypted values need the key; a missing key, a wrong key, a
 * different user id or any tampering throws.
 */
export function decryptMfaSecret(stored: string, key: Buffer | null, userId: string): string {
  if (!isEncryptedMfaSecret(stored)) {
    return stored;
  }

  if (!key) {
    throw new Error('MFA secret is encrypted but no MFA_ENCRYPTION_KEY is configured');
  }
  assertKey(key);

  const parts = stored.slice(MFA_SECRET_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted MFA secret');
  }

  const [ivPart, tagPart, dataPart] = parts;
  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  const ciphertext = Buffer.from(dataPart, 'base64url');

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
    throw new Error('Malformed encrypted MFA secret');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(userId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Node's message is generic already; replace it so callers get one shape.
    throw new Error('MFA secret failed authentication (wrong key or tampered value)');
  }
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error('MFA encryption key must be 32 bytes');
  }
}
