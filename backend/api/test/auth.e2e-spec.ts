import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/email/email.service';

/**
 * Full-stack auth tests against a real Nest app + a dedicated test Postgres
 * database (see backend/api/.env.test) — never the dev/prod database.
 * Mirrors app bootstrap in src/main.ts (prefix, ValidationPipe, filter,
 * interceptor) since TestingModule doesn't pick those up automatically.
 *
 * EmailService is overridden with a spy that captures the OTP "sent" to
 * each address instead of calling Resend — real Resend delivery is
 * verified manually (see task in project notes), not from an automated
 * suite. Everything else (Postgres, AuthService, hashing, expiry, attempt
 * limits) runs for real.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let sentCodes: Map<string, string>;

  const mockEmailService = {
    sendOtpEmail: jest.fn(async (to: string, code: string) => {
      sentCodes.set(to, code);
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue(mockEmailService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await resetDb();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb();
    sentCodes = new Map();
    mockEmailService.sendOtpEmail.mockClear();
  });

  async function resetDb(): Promise<void> {
    await prisma.chatMessage.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.bed.deleteMany();
    await prisma.doctor.deleteMany();
    await prisma.user.deleteMany();
  }

  const server = () => app.getHttpServer();

  function tokenFor(userId: string, email: string, role: Role): string {
    return jwtService.sign({ sub: userId, email, role });
  }

  const validPatient = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    password: 'longenough1',
    role: 'patient',
  };

  const validDoctor = {
    firstName: 'Dana',
    lastName: 'Doctor',
    email: 'dana@example.test',
    password: 'longenough1',
    role: 'doctor',
    specialization: 'Cardiology',
    department: 'Cardiology',
    bio: 'Heart stuff',
    experienceYears: 10,
  };

  /** Signs up, retrieves the OTP the (mocked) email service "sent", and verifies it. */
  async function signupAndVerify(payload: Record<string, unknown>): Promise<{ token: string; email: string }> {
    const email = (payload.email as string).toLowerCase();
    await request(server()).post('/api/auth/signup').send(payload).expect(201);

    const code = sentCodes.get(email);
    if (!code) throw new Error(`No OTP captured for ${email}`);

    const res = await request(server())
      .post('/api/auth/verify-otp')
      .send({ email, code })
      .expect(201);

    return { token: res.body.data.token, email };
  }

  describe('POST /api/auth/signup', () => {
    it('creates an unverified account and emails an OTP, issuing no token yet', async () => {
      const res = await request(server()).post('/api/auth/signup').send(validPatient).expect(201);

      expect(res.body.data).toEqual({ email: validPatient.email });
      expect(res.body.data.token).toBeUndefined();
      expect(sentCodes.get(validPatient.email)).toMatch(/^\d{6}$/);
    });

    it('rejects a duplicate email with 409', async () => {
      await request(server()).post('/api/auth/signup').send(validPatient).expect(201);

      const res = await request(server()).post('/api/auth/signup').send(validPatient).expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('rejects a doctor signup missing required doctor fields with 400', async () => {
      const { specialization, ...incomplete } = validDoctor;
      const res = await request(server()).post('/api/auth/signup').send(incomplete).expect(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects an invalid email with 400 (global ValidationPipe)', async () => {
      await request(server())
        .post('/api/auth/signup')
        .send({ ...validPatient, email: 'not-an-email' })
        .expect(400);
    });

    it('rejects a request body containing unexpected fields (whitelist/forbidNonWhitelisted)', async () => {
      await request(server())
        .post('/api/auth/signup')
        .send({ ...validPatient, unexpectedField: 'nope' })
        .expect(400);
    });

    it('regression: still returns 201 when the OTP email fails to send — the account was already created and must not appear to have failed (previously returned 500 while silently creating an unrecoverable stuck account)', async () => {
      mockEmailService.sendOtpEmail.mockRejectedValueOnce(new Error('Resend rejected the recipient'));

      const res = await request(server()).post('/api/auth/signup').send(validPatient).expect(201);

      expect(res.body.data).toEqual({ email: validPatient.email });

      const created = await prisma.user.findUniqueOrThrow({ where: { email: validPatient.email } });
      expect(created.emailVerified).toBe(false);
      expect(created.otpCodeHash).not.toBeNull();

      // The account isn't stuck — resend-otp (with email delivery working
      // again) issues a fresh code that verifies normally.
      await prisma.user.update({
        where: { id: created.id },
        data: { otpLastSentAt: new Date(Date.now() - 61_000) },
      });
      await request(server())
        .post('/api/auth/resend-otp')
        .send({ email: validPatient.email })
        .expect(201);

      const newCode = sentCodes.get(validPatient.email)!;
      await request(server())
        .post('/api/auth/verify-otp')
        .send({ email: validPatient.email, code: newCode })
        .expect(201);
    });
  });

  describe('POST /api/auth/verify-otp', () => {
    it('verifies with the correct code, issues a token, and the account can then log in', async () => {
      const { token, email } = await signupAndVerify(validPatient);

      expect(token).toBeDefined();

      const loginRes = await request(server())
        .post('/api/auth/login')
        .send({ email, password: validPatient.password, role: 'patient' })
        .expect(201);

      expect(loginRes.body.data.token).toBeDefined();
      expect(loginRes.body.data.user.emailVerified).toBe(true);
    });

    it('rejects an incorrect code with 401', async () => {
      await request(server()).post('/api/auth/signup').send(validPatient).expect(201);

      await request(server())
        .post('/api/auth/verify-otp')
        .send({ email: validPatient.email, code: '000000' })
        .expect(401);
    });

    it('rejects an expired code with 400', async () => {
      await request(server()).post('/api/auth/signup').send(validPatient).expect(201);
      const code = sentCodes.get(validPatient.email)!;

      await prisma.user.update({
        where: { email: validPatient.email },
        data: { otpExpiresAt: new Date(Date.now() - 1000) },
      });

      await request(server())
        .post('/api/auth/verify-otp')
        .send({ email: validPatient.email, code })
        .expect(400);
    });

    it('rejects verifying an already-verified account with 400', async () => {
      const { email } = await signupAndVerify(validPatient);

      await request(server()).post('/api/auth/verify-otp').send({ email, code: '123456' }).expect(400);
    });

    it('locks out after 5 incorrect attempts with 403', async () => {
      await request(server()).post('/api/auth/signup').send(validPatient).expect(201);

      for (let i = 0; i < 5; i++) {
        await request(server())
          .post('/api/auth/verify-otp')
          .send({ email: validPatient.email, code: '000000' })
          .expect(401);
      }

      const code = sentCodes.get(validPatient.email)!;
      await request(server())
        .post('/api/auth/verify-otp')
        .send({ email: validPatient.email, code })
        .expect(403);
    });
  });

  describe('POST /api/auth/resend-otp', () => {
    it('rejects a resend within the cooldown window with 400', async () => {
      await request(server()).post('/api/auth/signup').send(validPatient).expect(201);

      await request(server())
        .post('/api/auth/resend-otp')
        .send({ email: validPatient.email })
        .expect(400);
    });

    it('sends a new code once the cooldown has elapsed, and the new code verifies', async () => {
      await request(server()).post('/api/auth/signup').send(validPatient).expect(201);

      await prisma.user.update({
        where: { email: validPatient.email },
        data: { otpLastSentAt: new Date(Date.now() - 61_000) },
      });

      await request(server()).post('/api/auth/resend-otp').send({ email: validPatient.email }).expect(201);

      const newCode = sentCodes.get(validPatient.email)!;
      await request(server())
        .post('/api/auth/verify-otp')
        .send({ email: validPatient.email, code: newCode })
        .expect(201);
    });

    it('rejects resending for an already-verified account with 400', async () => {
      const { email } = await signupAndVerify(validPatient);

      await request(server()).post('/api/auth/resend-otp').send({ email }).expect(400);
    });

    it('rejects resending for a nonexistent account with 404', async () => {
      await request(server())
        .post('/api/auth/resend-otp')
        .send({ email: 'nobody@example.test' })
        .expect(404);
    });
  });

  describe('POST /api/auth/login', () => {
    it('rejects a nonexistent email with 401 and a generic message', async () => {
      const res = await request(server())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.test', password: 'whatever1', role: 'patient' })
        .expect(401);

      expect(res.body.message).toMatch(/invalid email or password/i);
    });

    it('rejects login for an unverified account with 403', async () => {
      await request(server()).post('/api/auth/signup').send(validPatient).expect(201);

      const res = await request(server())
        .post('/api/auth/login')
        .send({ email: validPatient.email, password: validPatient.password, role: 'patient' })
        .expect(403);

      expect(res.body.message).toMatch(/verify your email/i);
    });

    it('rejects the wrong password with 401 even before checking verification', async () => {
      await request(server()).post('/api/auth/signup').send(validPatient).expect(201);

      await request(server())
        .post('/api/auth/login')
        .send({ email: validPatient.email, password: 'wrong-password', role: 'patient' })
        .expect(401);
    });

    it('rejects a role that does not match the account with 403', async () => {
      await signupAndVerify(validPatient);

      await request(server())
        .post('/api/auth/login')
        .send({ email: validPatient.email, password: validPatient.password, role: 'doctor' })
        .expect(403);
    });

    it('regression: logs in successfully when the email is typed with different casing than it was stored', async () => {
      await signupAndVerify(validPatient);

      await request(server())
        .post('/api/auth/login')
        .send({ email: 'Ada@Example.test', password: validPatient.password, role: 'patient' })
        .expect(201);
    });

    it('regression: a Google-only account gets the correct "use Google sign-in" message even when the email casing differs, instead of a false "Invalid email or password"', async () => {
      await prisma.user.create({
        data: {
          email: 'google-admin@example.test',
          googleId: 'g-admin',
          firstName: 'Google',
          lastName: 'Admin',
          role: Role.ADMIN,
          roleSelected: true,
          emailVerified: true,
          password: null,
        },
      });

      const res = await request(server())
        .post('/api/auth/login')
        .send({ email: 'Google-Admin@Example.test', password: 'anything', role: 'admin' })
        .expect(401);

      expect(res.body.message).toBe('This account uses Google sign-in. Use "Continue with Google" instead.');
    });

    it('rejects login for a Google-only account (no password) with the exact user-facing message', async () => {
      await prisma.user.create({
        data: {
          email: 'google-only@example.test',
          googleId: 'g-1',
          firstName: 'Goog',
          lastName: 'User',
          role: Role.PATIENT,
          roleSelected: true,
          emailVerified: true,
          password: null,
        },
      });

      const res = await request(server())
        .post('/api/auth/login')
        .send({ email: 'google-only@example.test', password: 'anything', role: 'patient' })
        .expect(401);

      expect(res.body.message).toBe('This account uses Google sign-in. Use "Continue with Google" instead.');
    });
  });

  describe('GET /api/users/me (JwtAuthGuard)', () => {
    it('rejects with 401 when no Authorization header is sent', async () => {
      await request(server()).get('/api/users/me').expect(401);
    });

    it('rejects with 401 for a malformed/invalid token', async () => {
      await request(server()).get('/api/users/me').set('Authorization', 'Bearer not-a-real-token').expect(401);
    });

    it('returns the current user for a valid token, including hasPassword and emailVerified', async () => {
      const { token, email } = await signupAndVerify(validPatient);

      const res = await request(server())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.email).toBe(email);
      expect(res.body.data.hasPassword).toBe(true);
      expect(res.body.data.emailVerified).toBe(true);
    });
  });

  describe('PATCH /api/users/me/role (one-time onboarding gate)', () => {
    it('lets a fresh Google-style user (roleSelected=false) pick a role once, then forbids a second change', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'fresh-google@example.test',
          googleId: 'g-2',
          firstName: 'Fresh',
          lastName: 'User',
          role: Role.PATIENT,
          roleSelected: false,
          emailVerified: true,
        },
      });
      const token = tokenFor(user.id, user.email, user.role);

      const first = await request(server())
        .patch('/api/users/me/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'doctor' })
        .expect(200);

      expect(first.body.data.role).toBe('doctor');
      expect(first.body.data.roleSelected).toBe(true);

      await request(server())
        .patch('/api/users/me/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'admin' })
        .expect(403);
    });
  });

  describe('PATCH /api/users/me/password', () => {
    it('sets a password with no currentPassword for a Google-only account, which can then log in locally', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'gpw@example.test',
          googleId: 'g-3',
          firstName: 'G',
          lastName: 'Pw',
          role: Role.PATIENT,
          roleSelected: true,
          emailVerified: true,
          password: null,
        },
      });
      const token = tokenFor(user.id, user.email, user.role);

      const meBefore = await request(server())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(meBefore.body.data.hasPassword).toBe(false);

      await request(server())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'brandnewpass123' })
        .expect(200);

      await request(server())
        .post('/api/auth/login')
        .send({ email: 'gpw@example.test', password: 'brandnewpass123', role: 'patient' })
        .expect(201);
    });

    it('requires currentPassword once one exists, rejects a wrong one, and accepts the correct one', async () => {
      const { token, email } = await signupAndVerify({ ...validPatient, email: 'pw2@example.test' });

      await request(server())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'irrelevant123' })
        .expect(400);

      await request(server())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrong-password', newPassword: 'irrelevant123' })
        .expect(401);

      await request(server())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: validPatient.password, newPassword: 'newpass456' })
        .expect(200);

      await request(server())
        .post('/api/auth/login')
        .send({ email, password: 'newpass456', role: 'patient' })
        .expect(201);
    });
  });

  describe('RolesGuard on a role-restricted route', () => {
    it('rejects a patient from a doctor-only route (403) and allows a doctor (200)', async () => {
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'roleguard-p@example.test' });

      await request(server())
        .get('/api/doctor-portal/profile')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(403);

      const { token: doctorToken } = await signupAndVerify({ ...validDoctor, email: 'roleguard-d@example.test' });

      await request(server())
        .get('/api/doctor-portal/profile')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
    });

    it('allows any authenticated role on the public doctor directory (JwtAuthGuard only, no role restriction)', async () => {
      const { token } = await signupAndVerify({ ...validPatient, email: 'directory-p@example.test' });

      await request(server()).get('/api/doctors').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('registers a doctor, verifies, and their profile appears in the directory', async () => {
      const { token } = await signupAndVerify({ ...validDoctor, email: 'dir-doc@example.test' });

      const directoryRes = await request(server())
        .get('/api/doctors')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(directoryRes.body.data.doctors).toHaveLength(1);
      expect(directoryRes.body.data.doctors[0]).toMatchObject({
        fullName: 'Dana Doctor',
        specialization: 'Cardiology',
      });
    });
  });

  describe('GET /api/chat (patient inbox)', () => {
    it('returns an empty list when the patient has no appointments or messages with anyone', async () => {
      const { token } = await signupAndVerify({ ...validPatient, email: 'inbox-empty@example.test' });

      const res = await request(server()).get('/api/chat').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.data.doctors).toEqual([]);
    });

    it('a patient can message a doctor directly with no prior appointment, and that doctor then appears in the inbox', async () => {
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'inbox-chat-p@example.test' });
      const { token: doctorToken } = await signupAndVerify({ ...validDoctor, email: 'inbox-chat-d@example.test' });

      const directoryRes = await request(server())
        .get('/api/doctors')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      const doctorId = directoryRes.body.data.doctors[0].id;

      await request(server())
        .post(`/api/chat/${doctorId}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ body: 'Hi, quick question' })
        .expect(201);

      const inboxRes = await request(server())
        .get('/api/chat')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(inboxRes.body.data.doctors).toEqual([
        { doctorId, doctorName: 'Dana Doctor', specialization: 'Cardiology' },
      ]);

      // And the doctor sees the patient in their own inbox, from the doctor's side.
      const doctorInboxRes = await request(server())
        .get('/api/doctor-portal/chat')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(doctorInboxRes.body.data.patients).toHaveLength(1);
    });

    it('a doctor booked via appointment (no chat yet) also appears in the inbox', async () => {
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'inbox-appt-p@example.test' });
      await signupAndVerify({ ...validDoctor, email: 'inbox-appt-d@example.test' });

      const directoryRes = await request(server())
        .get('/api/doctors')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      const doctorId = directoryRes.body.data.doctors[0].id;

      const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
      await request(server())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId, scheduledAt, mode: 'online', reason: 'Checkup' })
        .expect(201);

      const inboxRes = await request(server())
        .get('/api/chat')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(inboxRes.body.data.doctors).toEqual([
        { doctorId, doctorName: 'Dana Doctor', specialization: 'Cardiology' },
      ]);
    });
  });

  describe('GET /api/notifications', () => {
    it('rejects with 401 when not authenticated', async () => {
      await request(server()).get('/api/notifications').expect(401);
    });

    it('returns an empty list and zero unread count for a fresh account', async () => {
      const { token } = await signupAndVerify({ ...validPatient, email: 'notif-empty@example.test' });

      const res = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toEqual({ notifications: [], unreadCount: 0 });
    });

    it('notifies the doctor when a patient books an appointment, and the other party when either side cancels', async () => {
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'notif-book-p@example.test' });
      const { token: doctorToken } = await signupAndVerify({ ...validDoctor, email: 'notif-book-d@example.test' });

      const directoryRes = await request(server())
        .get('/api/doctors')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      const doctorId = directoryRes.body.data.doctors[0].id;

      const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
      const bookRes = await request(server())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId, scheduledAt, mode: 'online', reason: 'Checkup' })
        .expect(201);
      const appointmentId = bookRes.body.data.appointment.id;

      const doctorNotifs = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(doctorNotifs.body.data.unreadCount).toBe(1);
      expect(doctorNotifs.body.data.notifications[0]).toMatchObject({
        type: 'appointment_booked',
        isRead: false,
      });

      // Doctor cancels — the patient is notified.
      await request(server())
        .patch(`/api/doctor-portal/appointments/${appointmentId}/cancel`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const patientNotifs = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      expect(patientNotifs.body.data.unreadCount).toBe(1);
      expect(patientNotifs.body.data.notifications[0]).toMatchObject({
        type: 'appointment_cancelled',
        isRead: false,
      });
    });

    it('notifies the doctor when a patient sends a chat message with no prior appointment', async () => {
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'notif-chat-p@example.test' });
      const { token: doctorToken } = await signupAndVerify({ ...validDoctor, email: 'notif-chat-d@example.test' });

      const directoryRes = await request(server())
        .get('/api/doctors')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      const doctorId = directoryRes.body.data.doctors[0].id;

      await request(server())
        .post(`/api/chat/${doctorId}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ body: 'Hi, quick question' })
        .expect(201);

      const doctorNotifs = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(doctorNotifs.body.data.unreadCount).toBe(1);
      expect(doctorNotifs.body.data.notifications[0]).toMatchObject({
        type: 'chat_message',
        title: `New message from ${validPatient.firstName} ${validPatient.lastName}`,
        body: 'Hi, quick question',
        isRead: false,
      });
    });

    it('marks a single notification read, and mark-all-read clears the unread count', async () => {
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'notif-read-p@example.test' });
      const { token: doctorToken } = await signupAndVerify({ ...validDoctor, email: 'notif-read-d@example.test' });

      const directoryRes = await request(server())
        .get('/api/doctors')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      const doctorId = directoryRes.body.data.doctors[0].id;

      await request(server())
        .post(`/api/chat/${doctorId}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ body: 'First message' })
        .expect(201);
      await request(server())
        .post(`/api/chat/${doctorId}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ body: 'Second message' })
        .expect(201);

      const before = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(before.body.data.unreadCount).toBe(2);
      const firstId = before.body.data.notifications[0].id;

      const markOne = await request(server())
        .patch(`/api/notifications/${firstId}/read`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(markOne.body.data.notification.isRead).toBe(true);

      const afterOne = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(afterOne.body.data.unreadCount).toBe(1);

      await request(server())
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(204);

      const afterAll = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(afterAll.body.data.unreadCount).toBe(0);
    });

    it('rejects marking a notification that does not belong to the caller with 404', async () => {
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'notif-other-p@example.test' });
      const { token: doctorToken } = await signupAndVerify({ ...validDoctor, email: 'notif-other-d@example.test' });

      const directoryRes = await request(server())
        .get('/api/doctors')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      const doctorId = directoryRes.body.data.doctors[0].id;

      await request(server())
        .post(`/api/chat/${doctorId}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ body: 'Hi' })
        .expect(201);

      const doctorNotifs = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      const notificationId = doctorNotifs.body.data.notifications[0].id;

      await request(server())
        .patch(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(404);
    });
  });

  describe('DELETE /api/users/me (account deletion)', () => {
    it('rejects with 401 when not authenticated', async () => {
      await request(server()).delete('/api/users/me').expect(401);
    });

    it('deletes a patient account and the deleted account can no longer log in or use its token', async () => {
      const { token, email } = await signupAndVerify(validPatient);

      await request(server()).delete('/api/users/me').set('Authorization', `Bearer ${token}`).expect(204);

      await request(server())
        .post('/api/auth/login')
        .send({ email, password: validPatient.password, role: 'patient' })
        .expect(401);

      await request(server()).get('/api/users/me').set('Authorization', `Bearer ${token}`).expect(401);

      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it('regression: deletes a doctor with existing appointments and chat messages without a FK error, cascading their data but leaving the patient intact', async () => {
      const { token: doctorToken, email: doctorEmail } = await signupAndVerify(validDoctor);
      const { token: patientToken, email: patientEmail } = await signupAndVerify(validPatient);

      const doctor = await prisma.doctor.findFirstOrThrow({ where: { user: { email: doctorEmail } } });

      const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
      await request(server())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, scheduledAt, mode: 'online', reason: 'Checkup' })
        .expect(201);

      await request(server())
        .post(`/api/chat/${doctor.id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ body: 'Hello doctor' })
        .expect(201);

      await request(server()).delete('/api/users/me').set('Authorization', `Bearer ${doctorToken}`).expect(204);

      expect(await prisma.doctor.findUnique({ where: { id: doctor.id } })).toBeNull();
      expect(await prisma.appointment.findMany({ where: { doctorId: doctor.id } })).toHaveLength(0);
      expect(await prisma.chatMessage.findMany({ where: { doctorId: doctor.id } })).toHaveLength(0);

      // The patient account itself must survive the doctor's deletion.
      expect(await prisma.user.findUnique({ where: { email: patientEmail } })).not.toBeNull();
    });

    it('regression: deleting a patient who occupies a bed releases it back to available instead of leaving it stuck occupied', async () => {
      const { token: adminToken } = await signupAndVerify({
        ...validPatient,
        email: 'bed-admin@example.test',
        role: 'admin',
      });
      const { token: patientToken, email: patientEmail } = await signupAndVerify({
        ...validPatient,
        email: 'bed-patient@example.test',
      });

      const bed = await prisma.bed.create({
        data: { label: 'Ward 1 - Bed 1', department: 'General Medicine' },
      });
      const patient = await prisma.user.findUniqueOrThrow({ where: { email: patientEmail } });

      await request(server())
        .patch(`/api/beds/${bed.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patientId: patient.id })
        .expect(200);

      await request(server()).delete('/api/users/me').set('Authorization', `Bearer ${patientToken}`).expect(204);

      const bedAfter = await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } });
      expect(bedAfter.status).toBe('AVAILABLE');
      expect(bedAfter.patientId).toBeNull();
    });
  });
});
