import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResetPasswordDto } from './reset-password.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ResetPasswordDto, payload);
  return validate(dto);
}

function fieldErrors(errors: Awaited<ReturnType<typeof errorsFor>>, property: string) {
  return errors.find((e) => e.property === property);
}

const VALID_RESET = { email: 'ada@example.com', code: '123456', newPassword: 'Newpassword1!' };

describe('ResetPasswordDto', () => {
  it('accepts a fully valid reset payload', async () => {
    const errors = await errorsFor(VALID_RESET);
    expect(errors).toHaveLength(0);
  });

  it('rejects a code that is not 6 digits', async () => {
    const errors = await errorsFor({ ...VALID_RESET, code: '123' });
    expect(fieldErrors(errors, 'code')).toBeDefined();
  });

  describe('newPassword', () => {
    it('rejects a password shorter than 8 characters', async () => {
      const errors = await errorsFor({ ...VALID_RESET, newPassword: 'Sh0rt!' });
      expect(fieldErrors(errors, 'newPassword')).toBeDefined();
    });

    it('rejects a password longer than 64 characters', async () => {
      const errors = await errorsFor({ ...VALID_RESET, newPassword: `Aa1!${'a'.repeat(62)}` });
      expect(fieldErrors(errors, 'newPassword')).toBeDefined();
    });

    it('rejects a password missing an uppercase letter', async () => {
      const errors = await errorsFor({ ...VALID_RESET, newPassword: 'newpassword1!' });
      expect(fieldErrors(errors, 'newPassword')).toBeDefined();
    });

    it('rejects a password missing a lowercase letter', async () => {
      const errors = await errorsFor({ ...VALID_RESET, newPassword: 'NEWPASSWORD1!' });
      expect(fieldErrors(errors, 'newPassword')).toBeDefined();
    });

    it('rejects a password missing a number', async () => {
      const errors = await errorsFor({ ...VALID_RESET, newPassword: 'Newpassword!' });
      expect(fieldErrors(errors, 'newPassword')).toBeDefined();
    });

    it('rejects a password missing a special character', async () => {
      const errors = await errorsFor({ ...VALID_RESET, newPassword: 'Newpassword1' });
      expect(fieldErrors(errors, 'newPassword')).toBeDefined();
    });

    it('rejects a well-known common password', async () => {
      const errors = await errorsFor({ ...VALID_RESET, newPassword: 'Password1!' });
      expect(fieldErrors(errors, 'newPassword')).toBeDefined();
    });
  });
});
