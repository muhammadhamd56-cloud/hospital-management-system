import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ApprovalStatus, NotificationType, Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { accessTokenFrom } from './session-cookies';

/**
 * Self-registered doctor and staff accounts must be approved by an admin
 * before they can reach anything beyond their own account. Runs the real
 * signup -> OTP -> session flow and the real JwtAuthGuard against the test
 * database, so the gate is proven end to end, not just in a mocked unit.
 */
describe('Account approvals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let sentCodes: Map<string, string>;

  const mockEmailService = {
    sendOtpEmail: jest.fn(async (to: string, code: string) => {
      sentCodes.set(to, code);
    }),
    sendAccountDecisionEmail: jest.fn(async () => undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
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
    jest.clearAllMocks();
  });

  async function resetDb(): Promise<void> {
    await prisma.appointment.deleteMany();
    await prisma.doctor.deleteMany();
    await prisma.user.deleteMany();
  }

  const server = () => app.getHttpServer();
  const auth = (token: string) => `Bearer ${token}`;

  async function createAdmin() {
    const admin = await prisma.user.create({
      data: { email: 'admin@approvals.test', firstName: 'Ada', lastName: 'Admin', role: Role.ADMIN, roleSelected: true, emailVerified: true },
    });
    return { ...admin, token: jwtService.sign({ sub: admin.id, email: admin.email, role: admin.role, tokenVersion: 0 }) };
  }

  async function signupAndVerify(payload: Record<string, unknown>): Promise<string> {
    const email = (payload.email as string).toLowerCase();
    await request(server()).post('/api/auth/signup').send(payload).expect(201);
    const res = await request(server())
      .post('/api/auth/verify-otp')
      .send({ email, code: sentCodes.get(email) })
      .expect(201);
    return accessTokenFrom(res) as string;
  }

  const doctorSignup = {
    firstName: 'Dana',
    lastName: 'Doctor',
    email: 'dana@approvals.test',
    password: 'Longenough1!',
    role: 'doctor',
    specialization: 'Cardiology',
    department: 'Cardiology',
    bio: 'Heart stuff',
    experienceYears: 10,
  };

  const patientSignup = {
    firstName: 'Pat',
    lastName: 'Patient',
    email: 'pat@approvals.test',
    password: 'Longenough1!',
    role: 'patient',
  };

  it('a self-registered doctor can sign in and see their own account, but nothing else, until approved', async () => {
    const doctorToken = await signupAndVerify(doctorSignup);

    const me = await request(server()).get('/api/users/me').set('Authorization', auth(doctorToken)).expect(200);
    expect(me.body.data.approvalStatus).toBe('pending');

    const blocked = await request(server())
      .get('/api/doctor-portal/profile')
      .set('Authorization', auth(doctorToken))
      .expect(403);
    expect(blocked.body.message).toBe('Your account is awaiting administrator approval');

    // Routes with no role restriction are gated too.
    await request(server()).get('/api/doctors').set('Authorization', auth(doctorToken)).expect(403);
    await request(server()).get('/api/notifications').set('Authorization', auth(doctorToken)).expect(403);
  });

  it('staff signups are gated the same way', async () => {
    const staffToken = await signupAndVerify({ ...patientSignup, email: 'sam@approvals.test', role: 'staff' });

    await request(server()).get('/api/staff-portal/profile').set('Authorization', auth(staffToken)).expect(403);
  });

  it('patients are approved at signup and unaffected', async () => {
    const patientToken = await signupAndVerify(patientSignup);

    await request(server()).get('/api/appointments/me').set('Authorization', auth(patientToken)).expect(200);
  });

  it('alerts admins only once the applicant has verified their email', async () => {
    const admin = await createAdmin();

    await request(server()).post('/api/auth/signup').send(doctorSignup).expect(201);
    expect(await prisma.notification.count({ where: { userId: admin.id } })).toBe(0);

    await request(server())
      .post('/api/auth/verify-otp')
      .send({ email: doctorSignup.email, code: sentCodes.get(doctorSignup.email) })
      .expect(201);

    const alerts = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: NotificationType.ACCOUNT_APPROVAL_REQUESTED, link: '/account-approvals' });
  });

  it('keeps a pending doctor out of the patient directory and unbookable', async () => {
    await signupAndVerify(doctorSignup);
    const patientToken = await signupAndVerify(patientSignup);
    const doctor = await prisma.doctor.findFirstOrThrow({ where: { user: { email: doctorSignup.email } } });

    const directory = await request(server()).get('/api/doctors').set('Authorization', auth(patientToken)).expect(200);
    expect(directory.body.data.doctors.map((d: { id: string }) => d.id)).not.toContain(doctor.id);

    await request(server()).get(`/api/public/doctors/${doctor.id}`).expect(404);

    await request(server())
      .post('/api/appointments')
      .set('Authorization', auth(patientToken))
      .send({ doctorId: doctor.id, scheduledAt: '2099-01-01T10:00:00.000Z', mode: 'in-person', reason: 'Checkup' })
      .expect(404);
  });

  it('an admin approves a doctor, who then gets full access, a notification and an email', async () => {
    const admin = await createAdmin();
    const doctorToken = await signupAndVerify(doctorSignup);
    const doctorUser = await prisma.user.findUniqueOrThrow({ where: { email: doctorSignup.email } });

    const queue = await request(server()).get('/api/account-approvals').set('Authorization', auth(admin.token)).expect(200);
    expect(queue.body.data.requests).toEqual([
      expect.objectContaining({ id: doctorUser.id, role: 'doctor', status: 'pending', specialization: 'Cardiology' }),
    ]);

    await request(server())
      .patch(`/api/account-approvals/${doctorUser.id}`)
      .set('Authorization', auth(admin.token))
      .send({ decision: 'approve' })
      .expect(200);

    // The same session works now -- the guard re-reads the status on every request.
    await request(server()).get('/api/doctor-portal/profile').set('Authorization', auth(doctorToken)).expect(200);
    expect(
      await prisma.notification.count({ where: { userId: doctorUser.id, type: NotificationType.ACCOUNT_APPROVED } }),
    ).toBe(1);
    expect(mockEmailService.sendAccountDecisionEmail).toHaveBeenCalledWith(
      doctorSignup.email,
      expect.objectContaining({ approved: true }),
    );

    // A second review of an already-approved account is refused.
    await request(server())
      .patch(`/api/account-approvals/${doctorUser.id}`)
      .set('Authorization', auth(admin.token))
      .send({ decision: 'reject' })
      .expect(400);
  });

  it('a rejected applicant sees the reason, stays locked out, and can still be approved later', async () => {
    const admin = await createAdmin();
    const doctorToken = await signupAndVerify(doctorSignup);
    const doctorUser = await prisma.user.findUniqueOrThrow({ where: { email: doctorSignup.email } });

    await request(server())
      .patch(`/api/account-approvals/${doctorUser.id}`)
      .set('Authorization', auth(admin.token))
      .send({ decision: 'reject', note: 'Could not verify your medical licence' })
      .expect(200);

    const me = await request(server()).get('/api/users/me').set('Authorization', auth(doctorToken)).expect(200);
    const meUser = me.body.data;
    expect(meUser).toMatchObject({ approvalStatus: 'rejected', approvalNote: 'Could not verify your medical licence' });

    const blocked = await request(server())
      .get('/api/doctor-portal/profile')
      .set('Authorization', auth(doctorToken))
      .expect(403);
    expect(blocked.body.message).toBe('Your account request was not approved');

    await request(server())
      .patch(`/api/account-approvals/${doctorUser.id}`)
      .set('Authorization', auth(admin.token))
      .send({ decision: 'approve' })
      .expect(200);
    await request(server()).get('/api/doctor-portal/profile').set('Authorization', auth(doctorToken)).expect(200);
  });

  it('only admins can see or act on the review queue', async () => {
    const patientToken = await signupAndVerify(patientSignup);

    await request(server()).get('/api/account-approvals').set('Authorization', auth(patientToken)).expect(403);
  });

  it('an existing account (created before approvals existed) keeps working via the APPROVED default', async () => {
    const legacyDoctor = await prisma.user.create({
      data: { email: 'legacy@approvals.test', firstName: 'Leg', lastName: 'Acy', role: Role.DOCTOR, roleSelected: true, emailVerified: true },
    });
    expect(legacyDoctor.approvalStatus).toBe(ApprovalStatus.APPROVED);
  });
});
