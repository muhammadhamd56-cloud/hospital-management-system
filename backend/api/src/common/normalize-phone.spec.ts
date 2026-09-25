import { normalizePhoneNumber } from './normalize-phone';

describe('normalizePhoneNumber', () => {
  it('canonicalizes a punctuated but valid number to E.164', () => {
    expect(normalizePhoneNumber('+1 (415) 555-2671')).toBe('+14155552671');
  });

  it('leaves an already-canonical E.164 number unchanged', () => {
    expect(normalizePhoneNumber('+923001234567')).toBe('+923001234567');
  });

  it('normalizes a number with dashes to E.164', () => {
    expect(normalizePhoneNumber('+92-300-1234567')).toBe('+923001234567');
  });

  it('returns the original string untouched when it does not parse as a phone number', () => {
    expect(normalizePhoneNumber('not-a-phone-number')).toBe('not-a-phone-number');
  });

  it('returns the original string untouched when it parses but is not a valid number (e.g. too short)', () => {
    expect(normalizePhoneNumber('+1-555-0100')).toBe('+1-555-0100');
  });

  it('returns the original string untouched for an empty string', () => {
    expect(normalizePhoneNumber('')).toBe('');
  });
});
