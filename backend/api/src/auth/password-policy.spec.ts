import { plainToInstance } from 'class-transformer';
import { IsString, validate } from 'class-validator';
import {
  evaluatePasswordRules,
  generateStrongTempPassword,
  isStrongPassword,
  IsStrongPassword,
} from './password-policy';

describe('isStrongPassword', () => {
  it('accepts a password satisfying every rule', () => {
    expect(isStrongPassword('Longenough1!')).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(isStrongPassword('Sh0rt!')).toBe(false);
  });

  it('rejects a password longer than 64 characters', () => {
    expect(isStrongPassword(`Aa1!${'a'.repeat(62)}`)).toBe(false);
  });

  it('accepts a password exactly 64 characters', () => {
    expect(isStrongPassword(`Aa1!${'a'.repeat(60)}`)).toBe(true);
  });

  it('rejects a password missing an uppercase letter', () => {
    expect(isStrongPassword('longenough1!')).toBe(false);
  });

  it('rejects a password missing a lowercase letter', () => {
    expect(isStrongPassword('LONGENOUGH1!')).toBe(false);
  });

  it('rejects a password missing a number', () => {
    expect(isStrongPassword('Longenough!')).toBe(false);
  });

  it('rejects a password missing a special character', () => {
    expect(isStrongPassword('Longenough1')).toBe(false);
  });

  it('rejects a well-known common password even when every character class is present', () => {
    expect(isStrongPassword('Password1!')).toBe(false);
  });

  it('is case-insensitive when matching the common-password blocklist', () => {
    expect(isStrongPassword('PASSWORD1!')).toBe(false);
  });

  it('accepts a passphrase containing spaces', () => {
    expect(isStrongPassword('Correct Horse 1!')).toBe(true);
  });

  it('accepts non-ASCII Unicode characters as part of the password', () => {
    expect(isStrongPassword('Contraseña1!')).toBe(true);
  });
});

describe('evaluatePasswordRules', () => {
  it('reports every rule as passed for a fully compliant password', () => {
    const results = evaluatePasswordRules('Longenough1!');
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('reports exactly which rules fail for a weak password', () => {
    const results = evaluatePasswordRules('short');
    const failed = results.filter((r) => !r.passed).map((r) => r.id);
    expect(failed).toEqual(expect.arrayContaining(['length', 'uppercase', 'number', 'special']));
    expect(failed).not.toContain('lowercase');
  });
});

describe('IsStrongPassword decorator', () => {
  class TestDto {
    @IsString()
    @IsStrongPassword()
    password!: string;
  }

  async function errorsFor(password: unknown) {
    const dto = plainToInstance(TestDto, { password });
    return validate(dto);
  }

  it('produces no validation errors for a compliant password', async () => {
    const errors = await errorsFor('Longenough1!');
    expect(errors).toHaveLength(0);
  });

  it('produces a validation error with a non-leaking message for a weak password', async () => {
    const errors = await errorsFor('weak');
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {})[0]).toMatch(/8-64 characters/);
  });
});

describe('generateStrongTempPassword', () => {
  it('always satisfies the strong-password policy it generates for', () => {
    for (let i = 0; i < 50; i++) {
      expect(isStrongPassword(generateStrongTempPassword())).toBe(true);
    }
  });

  it('generates a different password on each call', () => {
    const a = generateStrongTempPassword();
    const b = generateStrongTempPassword();
    expect(a).not.toBe(b);
  });
});
