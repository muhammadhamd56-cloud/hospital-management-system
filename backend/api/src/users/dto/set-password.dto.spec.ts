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

describe('SetPasswordDto', () => {
  it('accepts a new password with no currentPassword (the Google-only-account case)', async () => {
    const errors = await errorsFor({ newPassword: 'brandnewpass123' });
    expect(errors).toHaveLength(0);
  });

  it('accepts a new password with a currentPassword provided', async () => {
    const errors = await errorsFor({ currentPassword: 'old', newPassword: 'brandnewpass123' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a newPassword shorter than 8 characters', async () => {
    const errors = await errorsFor({ newPassword: 'short1' });
    expect(fieldErrors(errors, 'newPassword')).toBeDefined();
  });

  it('rejects a missing newPassword', async () => {
    const errors = await errorsFor({ currentPassword: 'old' });
    expect(fieldErrors(errors, 'newPassword')).toBeDefined();
  });

  it('accepts a newPassword at the 8-character boundary', async () => {
    const errors = await errorsFor({ newPassword: 'exactly8' });
    expect(fieldErrors(errors, 'newPassword')).toBeUndefined();
  });
});
