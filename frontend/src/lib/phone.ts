import {
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js'

export type { CountryCode }

export interface PhoneValue {
  country: CountryCode
  /** Digits only -- the national-format part, without the country calling code. */
  nationalNumber: string
}

export interface CountryOption {
  code: CountryCode
  name: string
  /** e.g. "+92" */
  dialCode: string
  flag: string
  label: string
}

const DEFAULT_COUNTRY: CountryCode = 'US'

const regionDisplayNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

function countryName(code: CountryCode): string {
  return regionDisplayNames?.of(code) ?? code
}

/** Regional-indicator flag emoji, computed from the ISO 3166-1 alpha-2 code
 *  itself -- never a hand-maintained list, so it can't go stale or miss a
 *  country libphonenumber-js already supports. */
export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

let cachedOptions: CountryOption[] | null = null

/** Every country/territory libphonenumber-js has numbering metadata for --
 *  not a hard-coded subset. */
export function getCountryOptions(): CountryOption[] {
  if (cachedOptions) return cachedOptions

  cachedOptions = getCountries()
    .map((code) => {
      const dialCode = `+${getCountryCallingCode(code)}`
      const name = countryName(code)
      return { code, name, dialCode, flag: flagEmoji(code), label: `${flagEmoji(code)} ${name} (${dialCode})` }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return cachedOptions
}

export function detectDefaultCountry(): CountryCode {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const region = navigator.language.split('-')[1]?.toUpperCase()
    if (region && isSupportedCountry(region)) return region as CountryCode
  }
  return DEFAULT_COUNTRY
}

/** Parses a stored E.164 number (or legacy/loosely-formatted string) back
 *  into a `{country, nationalNumber}` pair for the form to edit. Falls back
 *  to an empty number in the default country when there's nothing to parse
 *  or the stored value doesn't parse as a phone number at all. */
export function fromE164(phone: string | null | undefined, fallbackCountry: CountryCode = DEFAULT_COUNTRY): PhoneValue {
  if (phone) {
    const parsed = parsePhoneNumberFromString(phone)
    if (parsed?.country) {
      return { country: parsed.country as CountryCode, nationalNumber: parsed.nationalNumber }
    }
  }
  return { country: fallbackCountry, nationalNumber: '' }
}

/** Converts a validated `{country, nationalNumber}` pair to E.164
 *  (e.g. "+923001234567"). Returns null if it isn't a valid number for that
 *  country -- callers should only use this after `validatePhone` passes. */
export function toE164(value: PhoneValue): string | null {
  if (!value.nationalNumber) return null
  const parsed = parsePhoneNumberFromString(value.nationalNumber, value.country)
  return parsed?.isValid() ? parsed.number : null
}

export type PhoneValidation =
  | { valid: true }
  | { valid: false; reason: 'required' | 'non-digit' | 'too-short' | 'too-long' | 'invalid' }

/** Validates against the selected country's actual numbering plan (length
 *  and pattern), not a generic min/max -- e.g. a 7-digit UK-shaped number
 *  fails even though 7 digits is fine for some other countries. */
export function validatePhone(value: PhoneValue, options: { required: boolean }): PhoneValidation {
  if (!value.nationalNumber) {
    return options.required ? { valid: false, reason: 'required' } : { valid: true }
  }

  if (/\D/.test(value.nationalNumber)) {
    return { valid: false, reason: 'non-digit' }
  }

  const lengthIssue = validatePhoneNumberLength(value.nationalNumber, value.country)
  if (lengthIssue === 'TOO_SHORT') return { valid: false, reason: 'too-short' }
  if (lengthIssue === 'TOO_LONG') return { valid: false, reason: 'too-long' }
  if (lengthIssue) return { valid: false, reason: 'invalid' }

  const parsed = parsePhoneNumberFromString(value.nationalNumber, value.country)
  if (!parsed?.isValid()) return { valid: false, reason: 'invalid' }

  return { valid: true }
}

export function phoneErrorMessage(value: PhoneValue, validation: PhoneValidation): string | undefined {
  if (validation.valid) return undefined
  if (validation.reason === 'required') return 'Phone number is required'
  if (validation.reason === 'non-digit') return 'Phone number can only contain digits'
  return `Enter a valid ${countryName(value.country)} phone number`
}
