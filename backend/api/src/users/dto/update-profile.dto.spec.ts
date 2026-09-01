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

  it('accepts a valid date of birth', async () => {
    const errors = await errorsFor({ dateOfBirth: '1990-05-12' });
    expect(fieldErrors(errors, 'dateOfBirth')).toBeUndefined();
  });

  it('accepts an empty string date of birth -- explicitly clearing it', async () => {
    const errors = await errorsFor({ dateOfBirth: '' });
    expect(fieldErrors(errors, 'dateOfBirth')).toBeUndefined();
  });

  it('rejects a malformed date of birth', async () => {
    const errors = await errorsFor({ dateOfBirth: 'not-a-date' });
    expect(fieldErrors(errors, 'dateOfBirth')).toBeDefined();
  });

  it('accepts a gender from the closed set', async () => {
    const errors = await errorsFor({ gender: 'female' });
    expect(fieldErrors(errors, 'gender')).toBeUndefined();
  });

  it('accepts an empty string gender -- explicitly clearing it', async () => {
    const errors = await errorsFor({ gender: '' });
    expect(fieldErrors(errors, 'gender')).toBeUndefined();
  });

  it('rejects a gender outside the closed set', async () => {
    const errors = await errorsFor({ gender: 'not-a-real-option' });
    expect(fieldErrors(errors, 'gender')).toBeDefined();
  });

  it('rejects an address over the length limit', async () => {
    const errors = await errorsFor({ address: 'x'.repeat(301) });
    expect(fieldErrors(errors, 'address')).toBeDefined();
  });

  it('accepts an address at the length limit', async () => {
    const errors = await errorsFor({ address: 'x'.repeat(300) });
    expect(fieldErrors(errors, 'address')).toBeUndefined();
  });

  it('rejects an emergency contact over the length limit', async () => {
    const errors = await errorsFor({ emergencyContact: 'x'.repeat(201) });
    expect(fieldErrors(errors, 'emergencyContact')).toBeDefined();
  });
});
