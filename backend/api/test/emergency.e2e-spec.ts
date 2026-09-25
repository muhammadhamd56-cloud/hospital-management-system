import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role, StaffType } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/email/email.service';

/**
 * Full-stack tests for the emergency response system against a real Nest
 * app + the dedicated test Postgres database -- see auth.e2e-spec.ts for the
 * conventions this mirrors (bootstrap, resetDb, tokenFor, signupAndVerify).
 */
describe('Emergency (e2e)', () => {
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

  /** Deleting users cascades to their EmergencyCase/EmergencyNote rows (see
   *  the onDelete: Cascade relations on schema.prisma), so nothing
   *  emergency-specific needs listing here. */
  async function resetDb(): Promise<void> {
    await prisma.staff.deleteMany();
    await prisma.doctor.deleteMany();
    await prisma.user.deleteMany();
  }

  const server = () => app.getHttpServer();

  function tokenFor(userId: string, email: string, role: Role): string {
    return jwtService.sign({ sub: userId, email, role, tokenVersion: 0 });
  }

  async function createAdmin(email: string): Promise<{ token: string; id: string }> {
    const user = await prisma.user.create({
      data: { email, firstName: 'Ada', lastName: 'Admin', role: Role.ADMIN, roleSelected: true, emailVerified: true },
    });
    return { token: tokenFor(user.id, user.email, user.role), id: user.id };
  }

  async function createNurse(email: string): Promise<{ token: string; userId: string; staffId: string }> {
    const user = await prisma.user.create({
      data: { email, firstName: 'Nora', lastName: 'Nurse', role: Role.STAFF, roleSelected: true, emailVerified: true },
    });
    const staff = await prisma.staff.create({
      data: { staffType: StaffType.NURSE, fullName: 'Nora Nurse', userId: user.id },
    });
    return { token: tokenFor(user.id, user.email, user.role), userId: user.id, staffId: staff.id };
  }

  async function createReceptionist(email: string): Promise<{ token: string }> {
    const user = await prisma.user.create({
      data: { email, firstName: 'Ray', lastName: 'Reception', role: Role.STAFF, roleSelected: true, emailVerified: true },
    });
    await prisma.staff.create({ data: { staffType: StaffType.RECEPTIONIST, fullName: 'Ray Reception', userId: user.id } });
    return { token: tokenFor(user.id, user.email, user.role) };
  }

  async function signupAndVerify(payload: Record<string, unknown>): Promise<{ token: string; email: string; id: string }> {
    const email = (payload.email as string).toLowerCase();
    await request(server()).post('/api/auth/signup').send(payload).expect(201);

    const code = sentCodes.get(email);
    if (!code) throw new Error(`No OTP captured for ${email}`);

    const res = await request(server()).post('/api/auth/verify-otp').send({ email, code }).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    return { token: res.body.data.token, email, id: user.id };
  }

  const validPatient = {
    firstName: 'Pat',
    lastName: 'Patient',
    email: 'pat@example.test',
    password: 'Longenough1!',
    role: 'patient',
  };

  const validDoctor = {
    firstName: 'Dana',
    lastName: 'Doctor',
    email: 'dana@example.test',
    password: 'Longenough1!',
    role: 'doctor',
    specialization: 'Emergency Medicine',
    department: 'Emergency',
    bio: 'Trauma care',
    experienceYears: 8,
  };

  describe('POST /api/emergency', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(server()).post('/api/emergency').send({}).expect(401);
    });

    it('rejects a non-patient caller with 403', async () => {
      const admin = await createAdmin('admin-create@example.test');

      await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({})
        .expect(403);
    });

    it('creates a bare case immediately with no body, defaulting to type "other"', async () => {
      const { token } = await signupAndVerify({ ...validPatient, email: 'create-bare@example.test' });

      const res = await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(201);

      expect(res.body.data.emergencyCase).toMatchObject({ status: 'new', emergencyType: 'other' });
    });

    it('rejects an unexpected field via the global whitelist ValidationPipe', async () => {
      const { token } = await signupAndVerify({ ...validPatient, email: 'create-whitelist@example.test' });

      await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${token}`)
        .send({ notAField: true })
        .expect(400);
    });

    it('rejects a second active request while one already exists, with 409', async () => {
      const { token } = await signupAndVerify({ ...validPatient, email: 'create-dup@example.test' });

      await request(server()).post('/api/emergency').set('Authorization', `Bearer ${token}`).send({}).expect(201);

      const res = await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(409);
      expect(res.body.message).toMatch(/already have an active emergency/i);
    });

    it('notifies admins and nurses, but not a plain receptionist or an uninvolved doctor', async () => {
      const admin = await createAdmin('admin-notif@example.test');
      const nurse = await createNurse('nurse-notif@example.test');
      const receptionist = await createReceptionist('reception-notif@example.test');
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'create-notif@example.test' });

      await request(server()).post('/api/emergency').set('Authorization', `Bearer ${patientToken}`).send({}).expect(201);

      const adminNotifs = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      expect(adminNotifs.body.data.notifications[0]).toMatchObject({ type: 'emergency_created' });

      const nurseNotifs = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${nurse.token}`)
        .expect(200);
      expect(nurseNotifs.body.data.notifications[0]).toMatchObject({ type: 'emergency_created' });

      const receptionistNotifs = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${receptionist.token}`)
        .expect(200);
      expect(receptionistNotifs.body.data.notifications).toEqual([]);
    });
  });

  describe('GET /api/emergency/:id (ownership + responder access)', () => {
    it('lets the owning patient view their own case', async () => {
      const { token } = await signupAndVerify({ ...validPatient, email: 'view-own@example.test' });
      const createRes = await request(server()).post('/api/emergency').set('Authorization', `Bearer ${token}`).send({});
      const id = createRes.body.data.emergencyCase.id;

      const res = await request(server()).get(`/api/emergency/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.data.emergencyCase.id).toBe(id);
    });

    it('404s a different patient trying to view someone else\'s case', async () => {
      const { token: ownerToken } = await signupAndVerify({ ...validPatient, email: 'view-owner@example.test' });
      const { token: otherToken } = await signupAndVerify({ ...validPatient, email: 'view-other@example.test' });
      const createRes = await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});
      const id = createRes.body.data.emergencyCase.id;

      await request(server()).get(`/api/emergency/${id}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
    });

    it('404s an unauthorized (receptionist) staff caller, and allows a nurse', async () => {
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'view-staff@example.test' });
      const createRes = await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({});
      const id = createRes.body.data.emergencyCase.id;

      const receptionist = await createReceptionist('reception-view@example.test');
      await request(server()).get(`/api/emergency/${id}`).set('Authorization', `Bearer ${receptionist.token}`).expect(404);

      const nurse = await createNurse('nurse-view@example.test');
      await request(server()).get(`/api/emergency/${id}`).set('Authorization', `Bearer ${nurse.token}`).expect(200);
    });

    it('returns 404 for a nonexistent id', async () => {
      const admin = await createAdmin('admin-missing@example.test');
      await request(server()).get('/api/emergency/does-not-exist').set('Authorization', `Bearer ${admin.token}`).expect(404);
    });
  });

  describe('full workflow: create -> acknowledge -> assign -> respond -> arrive -> resolve', () => {
    it('walks a case through every valid transition, rejects invalid ones, and notifies the patient at each step', async () => {
      const admin = await createAdmin('admin-flow@example.test');
      const nurse = await createNurse('nurse-flow@example.test');
      const { token: doctorToken, id: doctorUserId } = await signupAndVerify({ ...validDoctor, email: 'doctor-flow@example.test' });
      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctorUserId } });
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'patient-flow@example.test' });

      const createRes = await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({})
        .expect(201);
      const id = createRes.body.data.emergencyCase.id;

      // Invalid: can't jump straight to resolved.
      await request(server())
        .patch(`/api/emergency/${id}/status`)
        .set('Authorization', `Bearer ${nurse.token}`)
        .send({ status: 'resolved' })
        .expect(400);

      // Acknowledge.
      await request(server())
        .patch(`/api/emergency/${id}/status`)
        .set('Authorization', `Bearer ${nurse.token}`)
        .send({ status: 'acknowledged' })
        .expect(200);

      // A nurse cannot assign a team (assigner access is admin/doctor only).
      await request(server())
        .patch(`/api/emergency/${id}/assign`)
        .set('Authorization', `Bearer ${nurse.token}`)
        .send({ teamName: 'Team A' })
        .expect(403);

      // Doctor assigns the nurse + themselves.
      const assignRes = await request(server())
        .patch(`/api/emergency/${id}/assign`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ doctorId: doctor.id, staffId: nurse.staffId, teamName: 'Team A' })
        .expect(200);
      expect(assignRes.body.data.emergencyCase.status).toBe('team_assigned');

      // Responding, then arrived, then resolved.
      await request(server())
        .patch(`/api/emergency/${id}/status`)
        .set('Authorization', `Bearer ${nurse.token}`)
        .send({ status: 'responding' })
        .expect(200);
      await request(server())
        .patch(`/api/emergency/${id}/status`)
        .set('Authorization', `Bearer ${nurse.token}`)
        .send({ status: 'arrived' })
        .expect(200);

      await request(server())
        .post(`/api/emergency/${id}/notes`)
        .set('Authorization', `Bearer ${nurse.token}`)
        .send({ body: 'Patient stabilized on arrival.' })
        .expect(201);

      const resolveRes = await request(server())
        .patch(`/api/emergency/${id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'resolved' })
        .expect(200);
      expect(resolveRes.body.data.emergencyCase.status).toBe('resolved');

      // Once resolved, no further transitions are allowed.
      await request(server())
        .patch(`/api/emergency/${id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'acknowledged' })
        .expect(400);

      // The patient got a notification at each stage, and can see the note + timeline.
      const patientNotifs = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      const types = patientNotifs.body.data.notifications.map((n: { type: string }) => n.type);
      expect(types).toEqual(
        expect.arrayContaining(['emergency_acknowledged', 'emergency_team_assigned', 'emergency_status_updated', 'emergency_resolved']),
      );

      const detail = await request(server())
        .get(`/api/emergency/${id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      expect(detail.body.data.emergencyCase.notes).toHaveLength(1);
      expect(detail.body.data.emergencyCase.timeline.length).toBeGreaterThanOrEqual(6);
      // Regression: the acknowledge transition once showed a generic
      // "Update" label instead of "Acknowledged" (a metadata-key mismatch
      // caught during manual verification) -- every step must have a real,
      // human-readable label, not the raw enum fallback.
      const labels = detail.body.data.emergencyCase.timeline.map((event: { label: string }) => event.label);
      expect(labels).toEqual(
        expect.arrayContaining([
          'Emergency request created',
          'Acknowledged',
          'Team assigned',
          'Marked as responding',
          'Team arrived',
          'Note added',
          'Case resolved',
        ]),
      );
    });
  });

  describe('cancellation', () => {
    it('lets the patient cancel their own NEW case, but not once a team is responding', async () => {
      const nurse = await createNurse('nurse-cancel@example.test');
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'patient-cancel@example.test' });

      const createRes = await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({})
        .expect(201);
      const id = createRes.body.data.emergencyCase.id;

      await request(server())
        .post(`/api/emergency/${id}/cancel`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({})
        .expect(201);

      // A second, fresh request can be created once the first is cancelled.
      const secondRes = await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({})
        .expect(201);
      const secondId = secondRes.body.data.emergencyCase.id;

      await request(server())
        .patch(`/api/emergency/${secondId}/status`)
        .set('Authorization', `Bearer ${nurse.token}`)
        .send({ status: 'acknowledged' })
        .expect(200);

      await request(server())
        .patch(`/api/emergency/${secondId}/assign`)
        .set('Authorization', `Bearer ${nurse.token}`)
        .send({ teamName: 'Team A' })
        .expect(403); // still nurse -- confirms assign stays admin/doctor-only mid-flow too
    });

    it('rejects cancelling another patient\'s case with 404', async () => {
      const { token: ownerToken } = await signupAndVerify({ ...validPatient, email: 'cancel-owner@example.test' });
      const { token: otherToken } = await signupAndVerify({ ...validPatient, email: 'cancel-other@example.test' });
      const createRes = await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});
      const id = createRes.body.data.emergencyCase.id;

      await request(server())
        .post(`/api/emergency/${id}/cancel`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({})
        .expect(404);
    });
  });

  describe('GET /api/emergency (Emergency Center list)', () => {
    it('rejects a patient and a non-nurse staff caller with 403', async () => {
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'list-patient@example.test' });
      await request(server()).get('/api/emergency').set('Authorization', `Bearer ${patientToken}`).expect(403);

      const receptionist = await createReceptionist('reception-list@example.test');
      await request(server()).get('/api/emergency').set('Authorization', `Bearer ${receptionist.token}`).expect(403);
    });

    it('never includes raw location coordinates in the list payload, even when shared', async () => {
      const nurse = await createNurse('nurse-list@example.test');
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'patient-list@example.test' });

      const createRes = await request(server())
        .post('/api/emergency')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({})
        .expect(201);
      const id = createRes.body.data.emergencyCase.id;

      await request(server())
        .patch(`/api/emergency/${id}/location`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ lat: 40.7128, lng: -74.006 })
        .expect(200);

      const listRes = await request(server()).get('/api/emergency').set('Authorization', `Bearer ${nurse.token}`).expect(200);
      const raw = JSON.stringify(listRes.body.data.emergencyCases);
      expect(raw).not.toContain('40.7128');
      expect(listRes.body.data.emergencyCases[0]).toMatchObject({ locationShared: true });
      expect(listRes.body.data.emergencyCases[0].location).toBeUndefined();
      expect(listRes.body.data.emergencyCases[0].lat).toBeUndefined();
    });
  });

  describe('GET /api/emergency/analytics', () => {
    it('rejects a non-admin caller with 403', async () => {
      const nurse = await createNurse('nurse-analytics@example.test');
      await request(server()).get('/api/emergency/analytics').set('Authorization', `Bearer ${nurse.token}`).expect(403);
    });

    it('returns counts for an admin caller', async () => {
      const admin = await createAdmin('admin-analytics@example.test');
      const { token: patientToken } = await signupAndVerify({ ...validPatient, email: 'patient-analytics@example.test' });
      await request(server()).post('/api/emergency').set('Authorization', `Bearer ${patientToken}`).send({}).expect(201);

      const res = await request(server())
        .get('/api/emergency/analytics')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      expect(res.body.data.totalCases).toBe(1);
    });
  });
});
