import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignupDto } from './signup.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(SignupDto, payload);
  return validate(dto);
}

function fieldErrors(errors: Awaited<ReturnType<typeof errorsFor>>, property: string) {
  return errors.find((e) => e.property === property);
}

const VALID_PATIENT = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'longenough1',
  role: 'patient',
};

const VALID_DOCTOR = {
  ...VALID_PATIENT,
  role: 'doctor',
  specialization: 'Cardiology',
  department: 'Cardiology',
  bio: 'Heart stuff',
  experienceYears: 10,
};

describe('SignupDto', () => {
  it('accepts a fully valid patient signup', async () => {
    const errors = await errorsFor(VALID_PATIENT);
    expect(errors).toHaveLength(0);
  });

  it('accepts a fully valid doctor signup with all doctor fields', async () => {
    const errors = await errorsFor(VALID_DOCTOR);
    expect(errors).toHaveLength(0);
  });

  describe('email', () => {
    it.each(['', 'not-an-email', 'missing-domain@', '@missinglocal.com', 'spaces in@email.com'])(
      'rejects invalid email %p',
      async (email) => {
        const errors = await errorsFor({ ...VALID_PATIENT, email });
        expect(fieldErrors(errors, 'email')).toBeDefined();
      },
    );

    it('accepts a subdomain email', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, email: 'ada@mail.example.com' });
      expect(fieldErrors(errors, 'email')).toBeUndefined();
    });

    it('accepts an uppercase email (format-valid)', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, email: 'ADA@EXAMPLE.COM' });
      expect(fieldErrors(errors, 'email')).toBeUndefined();
    });

    describe('normalization (regression: case-mismatch previously caused a false "Invalid email or password" on login for an account that does exist)', () => {
      it('lowercases a mixed-case email so it matches how it will be looked up later', () => {
        const dto = plainToInstance(SignupDto, { ...VALID_PATIENT, email: 'Ada@Example.com' });
        expect(dto.email).toBe('ada@example.com');
      });

      it('trims surrounding whitespace', () => {
        const dto = plainToInstance(SignupDto, { ...VALID_PATIENT, email: '  ada@example.com  ' });
        expect(dto.email).toBe('ada@example.com');
      });
    });
  });

  describe('password', () => {
    it('rejects a password shorter than 8 characters', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, password: 'short1' });
      expect(fieldErrors(errors, 'password')).toBeDefined();
    });

    it('accepts a password exactly 8 characters (boundary)', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, password: 'exactly8' });
      expect(fieldErrors(errors, 'password')).toBeUndefined();
    });

    it('rejects an empty password', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, password: '' });
      expect(fieldErrors(errors, 'password')).toBeDefined();
    });
  });

  describe('firstName / lastName', () => {
    it('rejects an empty first name', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, firstName: '' });
      expect(fieldErrors(errors, 'firstName')).toBeDefined();
    });

    it('rejects an empty last name', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, lastName: '' });
      expect(fieldErrors(errors, 'lastName')).toBeDefined();
    });

    it('does NOT trim whitespace-only names — a single space passes MinLength(1) (documents an actual gap)', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, firstName: ' ' });
      expect(fieldErrors(errors, 'firstName')).toBeUndefined();
    });
  });

  describe('role', () => {
    it('rejects an unsupported role', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, role: 'superadmin' });
      expect(fieldErrors(errors, 'role')).toBeDefined();
    });

    it('rejects "admin" — self-signup can only create doctor/patient accounts', async () => {
      const errors = await errorsFor({ ...VALID_PATIENT, role: 'admin' });
      expect(fieldErrors(errors, 'role')).toBeDefined();
    });

    it.each(['doctor', 'patient'])('accepts role %p', async (role) => {
      const payload = role === 'doctor' ? { ...VALID_DOCTOR, role } : { ...VALID_PATIENT, role };
      const errors = await errorsFor(payload);
      expect(fieldErrors(errors, 'role')).toBeUndefined();
    });
  });

  describe('doctor-only fields (ValidateIf role===doctor)', () => {
    it('does not require specialization/department/bio/experienceYears for a patient', async () => {
      const errors = await errorsFor(VALID_PATIENT);
      expect(errors).toHaveLength(0);
    });

    it('requires specialization when role is doctor', async () => {
      const { specialization, ...rest } = VALID_DOCTOR;
      const errors = await errorsFor(rest);
      expect(fieldErrors(errors, 'specialization')).toBeDefined();
    });

    it('requires department when role is doctor', async () => {
      const { department, ...rest } = VALID_DOCTOR;
      const errors = await errorsFor(rest);
      expect(fieldErrors(errors, 'department')).toBeDefined();
    });

    it('requires bio when role is doctor', async () => {
      const { bio, ...rest } = VALID_DOCTOR;
      const errors = await errorsFor(rest);
      expect(fieldErrors(errors, 'bio')).toBeDefined();
    });

    it('requires experienceYears when role is doctor', async () => {
      const { experienceYears, ...rest } = VALID_DOCTOR;
      const errors = await errorsFor(rest);
      expect(fieldErrors(errors, 'experienceYears')).toBeDefined();
    });

    it('rejects a negative experienceYears', async () => {
      const errors = await errorsFor({ ...VALID_DOCTOR, experienceYears: -1 });
      expect(fieldErrors(errors, 'experienceYears')).toBeDefined();
    });

    it('rejects experienceYears above the 80-year max', async () => {
      const errors = await errorsFor({ ...VALID_DOCTOR, experienceYears: 81 });
      expect(fieldErrors(errors, 'experienceYears')).toBeDefined();
    });

    it('accepts experienceYears at the 0 and 80 boundaries', async () => {
      const low = await errorsFor({ ...VALID_DOCTOR, experienceYears: 0 });
      const high = await errorsFor({ ...VALID_DOCTOR, experienceYears: 80 });
      expect(fieldErrors(low, 'experienceYears')).toBeUndefined();
      expect(fieldErrors(high, 'experienceYears')).toBeUndefined();
    });

    it('coerces a numeric string experienceYears (via @Type(() => Number))', async () => {
      const errors = await errorsFor({ ...VALID_DOCTOR, experienceYears: '10' });
      expect(fieldErrors(errors, 'experienceYears')).toBeUndefined();
    });
  });
});
