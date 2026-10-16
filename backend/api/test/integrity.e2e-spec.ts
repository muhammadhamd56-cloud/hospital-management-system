import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PaymentMethod, Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { BillingService } from '../src/billing/billing.service';
import { StripeService } from '../src/billing/stripe.service';
import { ACCESS_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from '../src/auth/auth-cookies';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { csrfProtection } from '../src/common/middleware/csrf.middleware';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Race conditions and session handling that unit tests (with a mocked
 * Prisma) can't prove: these run concurrent requests through the real app
 * against the real test Postgres (backend/api/.env.test), so the row locks
 * and conditional writes are exercised for real. Unlike the other e2e
 * suites, this app also installs cookie-parser and the CSRF middleware,
 * mirroring src/main.ts, so the cookie session paths can be tested.
 */
describe('Data integrity & sessions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authService: AuthService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ sendOtpEmail: jest.fn(), sendPasswordResetEmail: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.use(csrfProtection);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await resetDb();
    await app.close();
  });

  beforeEach(resetDb);

  /** Users cascade to their invoices, payments and refunds (schema.prisma). */
  async function resetDb(): Promise<void> {
    await prisma.invoice.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.doctor.deleteMany();
    await prisma.department.deleteMany({ where: { name: 'Integrity Test Dept' } });
    await prisma.user.deleteMany();
  }

  const server = () => app.getHttpServer();

  async function createUser(email: string, role: Role) {
    return prisma.user.create({
      data: { email, firstName: 'Test', lastName: role, role, roleSelected: true, emailVerified: true },
    });
  }

  function bearer(user: { id: string; email: string; role: Role; tokenVersion: number }): string {
    return `Bearer ${jwtService.sign({ sub: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion })}`;
  }

  async function createInvoice(patientId: string, amount: number) {
    return prisma.invoice.create({
      data: {
        patientId,
        description: 'Consultation',
        amount,
        dueDate: new Date(Date.now() + 7 * 86_400_000),
        items: { create: [{ description: 'Consultation', quantity: 1, unitPrice: amount }] },
      },
    });
  }

  describe('billing under concurrent requests', () => {
    // Without a delay the check-then-insert window is a few milliseconds and
    // the requests rarely interleave, so the test would pass with or without
    // the fix. Each test widens the window at a point that runs between the
    // balance check and the insert, so unlocked requests reliably overlap.
    const WINDOW_MS = 300;
    const pause = () => new Promise<void>((resolve) => setTimeout(resolve, WINDOW_MS));

    afterEach(() => jest.restoreAllMocks());

    it('records exactly one of several simultaneous full payments -- the invoice is never overpaid', async () => {
      const patient = await createUser('patient@integrity.test', Role.PATIENT);
      const doctorUser = await createUser('doctor@integrity.test', Role.DOCTOR);
      const department = await prisma.department.create({ data: { name: 'Integrity Test Dept' } });
      const doctor = await prisma.doctor.create({
        data: { userId: doctorUser.id, departmentId: department.id, specialization: 'GP', bio: '', experienceYears: 1 },
      });
      await prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctor.id, scheduledAt: new Date(), mode: 'IN_PERSON', reason: 'Visit' },
      });
      const invoice = await createInvoice(patient.id, 100);

      // A doctor's payment runs the patient-relationship check inside the
      // window (after the balance is read, before the payment is inserted).
      const billing = app.get(BillingService) as unknown as { assertOwnPatient: () => Promise<void> };
      jest.spyOn(billing, 'assertOwnPatient').mockImplementation(pause);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(server())
            .post(`/api/billing/invoices/${invoice.id}/payments`)
            .set('Authorization', bearer(doctorUser))
            .send({ amount: 100, method: PaymentMethod.CASH }),
        ),
      );

      const statuses = responses.map((res) => res.status).sort();
      expect(statuses).toEqual([201, 400, 400, 400, 400]);

      const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(100);
    });

    it('refunds a payment at most once when the same full refund is submitted simultaneously', async () => {
      const admin = await createUser('admin@integrity.test', Role.ADMIN);
      const patient = await createUser('patient@integrity.test', Role.PATIENT);
      const invoice = await createInvoice(patient.id, 100);
      const payment = await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: 100,
          method: PaymentMethod.CARD,
          recordedById: null,
          stripePaymentIntentId: 'pi_integrity_test',
        },
      });

      // A Stripe payment's refund calls Stripe inside the window; stand in
      // for it (no real Stripe in tests) with a slow call returning a new id.
      let refundSeq = 0;
      jest.spyOn(app.get(StripeService), 'refundPayment').mockImplementation(async () => {
        await pause();
        return { id: `re_integrity_${(refundSeq += 1)}` } as Awaited<ReturnType<StripeService['refundPayment']>>;
      });

      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(server())
            .post(`/api/billing/invoices/${invoice.id}/payments/${payment.id}/refund`)
            .set('Authorization', bearer(admin))
            .send({ amount: 100 }),
        ),
      );

      expect(responses.filter((res) => res.status === 201)).toHaveLength(1);
      const refunds = await prisma.refund.findMany({ where: { paymentId: payment.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0].amount).toBe(100);
    });

    it('lets an admin cancel an invoice once its only payment has been fully refunded', async () => {
      const admin = await createUser('admin@integrity.test', Role.ADMIN);
      const patient = await createUser('patient@integrity.test', Role.PATIENT);
      const invoice = await createInvoice(patient.id, 100);
      const payment = await prisma.payment.create({
        data: { invoiceId: invoice.id, amount: 100, method: PaymentMethod.CASH, recordedById: admin.id },
      });

      await request(server())
        .patch(`/api/billing/invoices/${invoice.id}/cancel`)
        .set('Authorization', bearer(admin))
        .expect(400);

      await request(server())
        .post(`/api/billing/invoices/${invoice.id}/payments/${payment.id}/refund`)
        .set('Authorization', bearer(admin))
        .send({})
        .expect(201);

      const res = await request(server())
        .patch(`/api/billing/invoices/${invoice.id}/cancel`)
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(res.body.data.invoice.status).toBe('cancelled');
    });
  });

  describe('cookie sessions', () => {
    async function sessionFor(email: string) {
      const user = await createUser(email, Role.PATIENT);
      return { user, tokens: authService.issueTokens(user) };
    }

    it('logs out an idle user whose access cookie has expired, revoking the refresh cookie too', async () => {
      const { user, tokens } = await sessionFor('idle@integrity.test');

      // Only the refresh cookie -- the 15-minute access cookie is long gone.
      const res = await request(server())
        .post('/api/auth/logout')
        .set('Cookie', [`${REFRESH_COOKIE}=${tokens.refreshToken}`])
        .set(CSRF_HEADER, '1')
        .expect(204);

      const cleared = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cleared).toContain(`${ACCESS_COOKIE}=;`);
      expect(cleared).toContain(`${REFRESH_COOKIE}=;`);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.tokenVersion).toBe(user.tokenVersion + 1);

      // The old refresh token can no longer start a session.
      await request(server())
        .post('/api/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE}=${tokens.refreshToken}`])
        .set(CSRF_HEADER, '1')
        .expect(401);
    });

    it('still clears cookies (204) when there is no valid session at all', async () => {
      await request(server())
        .post('/api/auth/logout')
        .set('Cookie', [`${REFRESH_COOKIE}=not-a-real-token`])
        .set(CSRF_HEADER, '1')
        .expect(204);
    });

    it('refuses a cookie-authenticated write without the CSRF header', async () => {
      const { tokens } = await sessionFor('csrf@integrity.test');

      await request(server())
        .post('/api/auth/logout')
        .set('Cookie', [`${ACCESS_COOKIE}=${tokens.accessToken}`])
        .expect(403);
    });

    it('authenticates reads with the access cookie alone', async () => {
      const { user, tokens } = await sessionFor('reader@integrity.test');

      const res = await request(server())
        .get('/api/users/me')
        .set('Cookie', [`${ACCESS_COOKIE}=${tokens.accessToken}`])
        .expect(200);
      expect(JSON.stringify(res.body)).toContain(user.email);
    });
  });
});
