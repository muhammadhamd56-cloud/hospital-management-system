import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetPasswordDto } from './set-password.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(SetPasswordDto, payload);
  return validate(dto);
}

function fieldErrors(errors: Awaited<ReturnType<typeof errorsFor>>, property: string) {
  return errors.find((e) => e.property === property);
}

const VALID_PASSWORD = 'Brandnewpass1!';

describe('SetPasswordDto', () => {
  it('accepts a new password with no currentPassword (the Google-only-account case)', async () => {
    const errors = await errorsFor({ newPassword: VALID_PASSWORD });
    expect(errors).toHaveLength(0);
  });

  it('accepts a new password with a currentPassword provided', async () => {
    const errors = await errorsFor({ currentPassword: 'old', newPassword: VALID_PASSWORD });
    expect(errors).toHaveLength(0);
  });

  it('rejects a newPassword shorter than 8 characters', async () => {
    const errors = await errorsFor({ newPassword: 'Sh0rt!' });
    expect(fieldErrors(errors, 'newPassword')).toBeDefined();
  });

  it('rejects a newPassword longer than 64 characters', async () => {
    const errors = await errorsFor({ newPassword: `Aa1!${'a'.repeat(62)}` });
    expect(fieldErrors(errors, 'newPassword')).toBeDefined();
  });

  it('rejects a missing newPassword', async () => {
    const errors = await errorsFor({ currentPassword: 'old' });
    expect(fieldErrors(errors, 'newPassword')).toBeDefined();
  });

  it('accepts a newPassword at the 8-character boundary', async () => {
    const errors = await errorsFor({ newPassword: 'Aa1!aaaa' });
    expect(fieldErrors(errors, 'newPassword')).toBeUndefined();
  });

  it('rejects a newPassword missing a special character', async () => {
    const errors = await errorsFor({ newPassword: 'Brandnewpass1' });
    expect(fieldErrors(errors, 'newPassword')).toBeDefined();
  });

  it('rejects a well-known common password', async () => {
    const errors = await errorsFor({ newPassword: 'Password1!' });
    expect(fieldErrors(errors, 'newPassword')).toBeDefined();
  });
});
