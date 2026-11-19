import { randomBytes } from 'crypto';
import { mfaKeyErrors } from './env.validation';

describe('mfaKeyErrors (MFA_ENCRYPTION_KEY)', () => {
  const key = randomBytes(32);

  it('requires the key in production', () => {
    expect(mfaKeyErrors({ NODE_ENV: 'production' })).toEqual([expect.stringMatching(/required in production/)]);
    expect(mfaKeyErrors({ NODE_ENV: 'production', MFA_ENCRYPTION_KEY: '   ' })).toHaveLength(1);
  });

  it('allows it to be missing in development and test', () => {
    expect(mfaKeyErrors({ NODE_ENV: 'development' })).toEqual([]);
    expect(mfaKeyErrors({ NODE_ENV: 'test', MFA_ENCRYPTION_KEY: '' })).toEqual([]);
    expect(mfaKeyErrors({})).toEqual([]);
  });

  it('accepts 32 bytes as base64 or 64 hex characters', () => {
    expect(mfaKeyErrors({ NODE_ENV: 'production', MFA_ENCRYPTION_KEY: key.toString('base64') })).toEqual([]);
    expect(mfaKeyErrors({ NODE_ENV: 'production', MFA_ENCRYPTION_KEY: key.toString('hex') })).toEqual([]);
  });

  it('rejects a malformed key in any environment, without echoing it', () => {
    const bad = randomBytes(16).toString('base64');
    const errors = mfaKeyErrors({ NODE_ENV: 'development', MFA_ENCRYPTION_KEY: bad });

    expect(errors).toEqual([expect.stringMatching(/32 bytes/)]);
    expect(errors.join()).not.toContain(bad);
  });
});
