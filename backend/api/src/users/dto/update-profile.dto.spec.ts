import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateProfileDto, payload);
  return validate(dto);
}

function fieldErrors(errors: Awaited<ReturnType<typeof errorsFor>>, property: string) {
  return errors.find((e) => e.property === property);
}

describe('UpdateProfileDto', () => {
  it('accepts a payload with no phone number at all', async () => {
    const errors = await errorsFor({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(errors).toHaveLength(0);
  });

  it('accepts an empty string phone number -- explicitly clearing it', async () => {
    const errors = await errorsFor({ phone: '' });
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['+923001234567', 'Pakistan'],
    ['+14155552671', 'US'],
    ['+442071838750', 'UK'],
  ])('accepts a genuinely valid E.164 number (%s, %s)', async (phone) => {
    const errors = await errorsFor({ phone });
    expect(errors).toHaveLength(0);
  });

  it('rejects a phone number missing the country code / leading +', async () => {
    const errors = await errorsFor({ phone: '3001234567' });
    expect(fieldErrors(errors, 'phone')).toBeDefined();
  });

  it('rejects a phone number that is too short for its country', async () => {
    const errors = await errorsFor({ phone: '+9230012' });
    expect(fieldErrors(errors, 'phone')).toBeDefined();
  });

  it('rejects a phone number that is too long for its country', async () => {
    const errors = await errorsFor({ phone: '+923001234567890123' });
    expect(fieldErrors(errors, 'phone')).toBeDefined();
  });

  it('rejects a phone number containing letters', async () => {
    const errors = await errorsFor({ phone: '+923001CALLME' });
    expect(fieldErrors(errors, 'phone')).toBeDefined();
  });

  it('rejects a non-string phone value', async () => {
    const errors = await errorsFor({ phone: 12345 });
    expect(fieldErrors(errors, 'phone')).toBeDefined();
  });
});
