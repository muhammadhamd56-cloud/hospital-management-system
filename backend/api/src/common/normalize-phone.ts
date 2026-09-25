import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Canonicalizes a phone number to E.164 (e.g. "+923001234567") whenever it
 * parses as a valid number. `IsE164PhoneNumber` only validates -- without
 * this, a value like "+1-555-0100" that still parses as valid would be
 * stored with its original punctuation instead of the canonical form.
 * Leaves the input untouched if it doesn't parse, so validation (not this
 * function) is what reports the error to the caller.
 */
export function normalizePhoneNumber(value: string): string {
  const parsed = parsePhoneNumberFromString(value);
  return parsed?.isValid() ? parsed.number : value;
}
