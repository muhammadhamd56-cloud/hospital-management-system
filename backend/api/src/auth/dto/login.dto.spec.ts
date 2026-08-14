import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(LoginDto, payload);
  return validate(dto);
}

function fieldErrors(errors: Awaited<ReturnType<typeof errorsFor>>, property: string) {
  return errors.find((e) => e.property === property);
}

const VALID_LOGIN = { email: 'ada@example.com', password: 'anything', role: 'patient' };

describe('LoginDto', () => {
  it('accepts a valid login payload', async () => {
    const errors = await errorsFor(VALID_LOGIN);
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid email format', async () => {
    const errors = await errorsFor({ ...VALID_LOGIN, email: 'not-an-email' });
    expect(fieldErrors(errors, 'email')).toBeDefined();
  });

  it('rejects an empty email', async () => {
    const errors = await errorsFor({ ...VALID_LOGIN, email: '' });
    expect(fieldErrors(errors, 'email')).toBeDefined();
  });

  it('rejects an empty password', async () => {
    const errors = await errorsFor({ ...VALID_LOGIN, password: '' });
    expect(fieldErrors(errors, 'password')).toBeDefined();
  });

  it('does NOT enforce an 8-character minimum on login (only MinLength(1) — differs from signup by design: a short existing password must still be able to log in)', async () => {
    const errors = await errorsFor({ ...VALID_LOGIN, password: 'short' });
    expect(fieldErrors(errors, 'password')).toBeUndefined();
  });

  it('rejects an unsupported role', async () => {
    const errors = await errorsFor({ ...VALID_LOGIN, role: 'superadmin' });
    expect(fieldErrors(errors, 'role')).toBeDefined();
  });

  it.each(['admin', 'doctor', 'patient', 'receptionist', 'lab_staff', 'pharmacist'])('accepts role %p', async (role) => {
    const errors = await errorsFor({ ...VALID_LOGIN, role });
    expect(fieldErrors(errors, 'role')).toBeUndefined();
  });

  describe('email normalization (regression: case-mismatch previously caused a false "Invalid email or password")', () => {
    it('lowercases a mixed-case email', () => {
      const dto = plainToInstance(LoginDto, { ...VALID_LOGIN, email: 'Ada@Example.com' });
      expect(dto.email).toBe('ada@example.com');
    });

    it('trims surrounding whitespace', () => {
      const dto = plainToInstance(LoginDto, { ...VALID_LOGIN, email: '  ada@example.com  ' });
      expect(dto.email).toBe('ada@example.com');
    });
  });
});
