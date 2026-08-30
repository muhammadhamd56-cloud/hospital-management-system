import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidPhoneNumber } from 'libphonenumber-js';

@ValidatorConstraint({ name: 'isE164PhoneNumber' })
class IsE164PhoneNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // Empty/absent means "no phone number" (or "clear it") -- @IsOptional()
    // on the DTO field covers undefined; an empty string is also accepted
    // here so a client can explicitly clear a previously-set number.
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') return false;

    return isValidPhoneNumber(value);
  }

  defaultMessage(): string {
    return 'Enter a valid phone number in international format, including the country code (e.g. +923001234567)';
  }
}

/**
 * Validates that a phone number is empty or a genuinely valid E.164 number
 * -- real per-country numbering-plan rules (length, pattern) via
 * libphonenumber-js, not a generic length check. The frontend validates the
 * same way before submitting; this is the server-side backstop so the API
 * never trusts client-side validation alone.
 */
export function IsE164PhoneNumber(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isE164PhoneNumber',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsE164PhoneNumberConstraint,
    });
  };
}
