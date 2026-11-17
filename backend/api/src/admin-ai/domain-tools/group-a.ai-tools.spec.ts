import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AnnouncementsService } from '../../announcements/announcements.service';
import type { AppointmentsService } from '../../appointments/appointments.service';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import type { BedsService } from '../../beds/beds.service';
import type { BillingService } from '../../billing/billing.service';
import type { DoctorsService } from '../../doctors/doctors.service';
import type { EmergencyService } from '../../emergency/emergency.service';
import type { LaboratoryService } from '../../laboratory/laboratory.service';
import type { PatientsService } from '../../patients/patients.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ReportsService } from '../../reports/reports.service';
import { PhiMasker } from '../security/phi-masker';
import type { AiToolContext, AiToolProvider } from '../tools/ai-tool.types';
import { addDays, localDayKey, startOfLocalDay } from './ai-tool-helpers';
import { AnnouncementsAiTools } from './announcements.ai-tools';
import { AppointmentsAiTools } from './appointments.ai-tools';
import { DashboardAiTools } from './dashboard.ai-tools';
import { DoctorsAiTools } from './doctors.ai-tools';
import { EmergencyAiTools } from './emergency.ai-tools';
import { LaboratoryAiTools } from './laboratory.ai-tools';
import { PatientsAiTools } from './patients.ai-tools';

const user: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };

function ctx(allowPhi = false): AiToolContext {
  return { user, runId: 'run-1', conversationId: 'conv-1', phi: new PhiMasker(allowPhi), signal: new AbortController().signal };
}

/** Runs a tool the way the dispatcher does: validate input, execute, project through the output allowlist. */
async function run(provider: AiToolProvider, name: string, input: unknown = {}, allowPhi = false): Promise<any> {
  const tool = provider.tools().find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  const raw = await tool.execute(tool.input.parse(input), ctx(allowPhi));
  return tool.mode === 'propose' ? raw : tool.output.parse(raw);
}

const as = <T>(value: unknown) => value as T;
const pseudonym = (id: string) => `Patient ${PhiMasker.pseudonym(id)}`;

// Future base time on a whole hour, so tests don't depend on the current clock.
const base = new Date(startOfLocalDay(addDays(new Date(), 3)).getTime() + 10 * 3_600_000); // +3 days, 10:00 local
const at = (minutes: number) => new Date(base.getTime() + minutes * 60_000).toISOString();

function adminAppointment(id: string, scheduledAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    patientName: 'Jane Roe',
    doctorName: 'Ada Lovelace',
    specialization: 'Cardiology',
    department: 'Cardiology',
    scheduledAt,
    mode: 'in-person',
    status: 'scheduled',
    reason: 'Chest pain follow-up',
    consultationFee: 50,
    ...overrides,
  };
}

const appointmentList = [
  adminAppointment('a1', at(0)),
  adminAppointment('a2', at(15), { patientName: 'John Doe' }), // overlaps a1 (30-min slots)
  adminAppointment('a3', at(30), { patientName: 'John Doe' }), // back-to-back with a1 -- no overlap
  adminAppointment('a4', at(60), { status: 'cancelled' }),
  adminAppointment('a5', at(0), { doctorName: 'Grace Hopper', department: 'Neurology', specialization: 'Neurology', status: 'completed' }),
];
const appointmentLinks = [
  { id: 'a1', patientId: 'p1', doctorId: 'd1' },
  { id: 'a2', patientId: 'p2', doctorId: 'd1' },
  { id: 'a3', patientId: 'p2', doctorId: 'd1' },
  { id: 'a4', patientId: 'p1', doctorId: 'd1' },
  { id: 'a5', patientId: 'p3', doctorId: 'd2' },
];

function doctor(id: string, fullName: string, department: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    fullName,
    specialization: department,
    qualifications: null,
    department,
    bio: 'bio',
    experienceYears: 10,
    rating: 4.5,
    acceptsOnline: true,
    isAvailable: true,
    consultationFee: 50,
    appointmentDurationMinutes: 30,
    email: 'doc@example.com',
    phone: '555',
    socialLinks: null,
    ...overrides,
  };
}

function appointmentDeps() {
  const appointments = { findAllForAdmin: jest.fn().mockResolvedValue(appointmentList) };
  const doctors = {
    listDoctors: jest
      .fn()
      .mockResolvedValue([doctor('d1', 'Ada Lovelace', 'Cardiology'), doctor('d2', 'Grace Hopper', 'Neurology', { isAvailable: false })]),
  };
  const prisma = { appointment: { findMany: jest.fn().mockResolvedValue(appointmentLinks) } };
  return {
    appointments: as<AppointmentsService>(appointments),
    doctors: as<DoctorsService>(doctors),
    prisma: as<PrismaService>(prisma),
    mocks: { appointments, doctors, prisma },
  };
}

describe('AppointmentsAiTools', () => {
  const deps = appointmentDeps();
  const tools = new AppointmentsAiTools(deps.appointments, deps.doctors, deps.prisma);

  it('filters by status and doctor, pseudonymises patients and drops the visit reason with PHI off', async () => {
    const result = await run(tools, 'appointments.searchAppointments', { status: 'scheduled', doctor: 'ada', limit: 2 });
    expect(result.matching).toBe(3);
    expect(result.returned).toBe(2);
    expect(result.appointments[0]).toMatchObject({ id: 'a1', patientId: 'p1', patient: pseudonym('p1'), doctorId: 'd1' });
    expect(result.appointments[0].reason).toBeUndefined(); // dropped from the JSON sent to the model
    expect(JSON.stringify(result)).not.toMatch(/Jane|John|Chest/);
  });

  it('includes real names and reason when PHI is allowed', async () => {
    const result = await run(tools, 'appointments.searchAppointments', { doctor: 'd1', status: 'scheduled' }, true);
    expect(result.appointments[0]).toMatchObject({ patient: 'Jane Roe', reason: 'Chest pain follow-up' });
  });

  it('rejects date ranges longer than 366 days', async () => {
    await expect(run(tools, 'appointments.searchAppointments', { from: '2025-01-01', to: '2026-06-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('aggregates trends by status, department and day', async () => {
    const day = localDayKey(base);
    const result = await run(tools, 'appointments.getAppointmentTrends', { from: day, to: day });
    expect(result.total).toBe(5);
    expect(result.byStatus).toEqual({ scheduled: 3, cancelled: 1, completed: 1 });
    expect(result.byDepartment[0]).toEqual({ department: 'Cardiology', count: 4 });
    expect(result.byDay).toEqual([{ date: day, total: 5, scheduled: 3, completed: 1, cancelled: 1 }]);
  });

  it('finds the doctor overlap but not back-to-back or cancelled appointments', async () => {
    const result = await run(tools, 'appointments.findConflicts', { kind: 'doctor' });
    expect(result.total).toBe(2); // a1/a2 and a2/a3
    const pairs = result.conflicts.map((c: { first: { id: string }; second: { id: string } }) => `${c.first.id}-${c.second.id}`);
    expect(pairs).toEqual(expect.arrayContaining(['a1-a2', 'a2-a3']));
    expect(pairs).not.toContain('a1-a3');
    expect(result.conflicts[0].overlapMinutes).toBe(15);
  });

  it('reports patient double-bookings with pseudonyms', async () => {
    const result = await run(tools, 'appointments.findConflicts', { kind: 'patient' });
    // p2: a2 (10:15-10:45) overlaps a3 (10:30-11:00); p1's a4 is cancelled.
    expect(result.total).toBe(1);
    expect(result.conflicts[0]).toMatchObject({ kind: 'patient', patient: pseudonym('p2'), overlapMinutes: 15 });
    expect(result.conflicts[0].doctorName).toBeUndefined();
  });

  it('computes free slots around booked appointments', async () => {
    const result = await run(tools, 'appointments.findAvailableSlots', {
      doctorId: 'd1',
      date: localDayKey(base),
      dayStart: '10:00',
      dayEnd: '12:00',
    });
    // 10:00-12:00 in 30-min blocks; 10:00, 10:30 blocked by a1/a2/a3; 11:00 free (a4 cancelled), 11:30 free.
    expect(result.slots.map((s: { start: string }) => s.start)).toEqual([at(60), at(90)]);
    expect(result.bookedInWindow).toBe(3);
    expect(result.durationMinutes).toBe(30);
  });
});

describe('DoctorsAiTools', () => {
  const deps = appointmentDeps();
  const tools = new DoctorsAiTools(deps.doctors, deps.appointments, deps.prisma);

  it('lists doctors without contact details', async () => {
    const result = await run(tools, 'doctors.listDoctors', { limit: 1 });
    expect(result).toMatchObject({ matching: 2, returned: 1 });
    expect(result.doctors[0]).not.toHaveProperty('email');
    expect(result.doctors[0]).not.toHaveProperty('phone');
  });

  it('computes workload per doctor including booked hours', async () => {
    const day = localDayKey(base);
    const result = await run(tools, 'doctors.getWorkload', { from: day, to: day });
    expect(result.totalAppointments).toBe(5);
    expect(result.doctors[0]).toMatchObject({ doctorId: 'd1', total: 4, scheduled: 3, cancelled: 1, bookedHours: 1.5 });
    expect(result.doctors[1]).toMatchObject({ doctorId: 'd2', total: 1, completed: 1 });
  });

  it('reports availability flags and upcoming load', async () => {
    const result = await run(tools, 'doctors.getAvailability', { onlyAccepting: true });
    expect(result.matching).toBe(1);
    expect(result.doctors[0]).toMatchObject({ id: 'd1', upcomingScheduled: 3, nextScheduledAt: at(0) });
  });

  it('finds schedule conflicts for one doctor without leaking patient names', async () => {
    const result = await run(tools, 'doctors.findScheduleConflicts', { doctorId: 'd1' });
    expect(result.total).toBe(2);
    expect(result.conflicts[0]).toMatchObject({ kind: 'doctor', doctorName: 'Ada Lovelace' });
    expect(JSON.stringify(result)).not.toMatch(/Jane|John/);
  });
});

describe('PatientsAiTools', () => {
  const patientList = [
    {
      id: 'p1',
      fullName: 'Jane Roe',
      email: 'jane@example.com',
      phone: '555-1',
      picture: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
      appointmentCount: 2,
      lastVisit: null,
    },
    { id: 'p2', fullName: 'John Doe', email: 'john@example.com', phone: null, picture: null, joinedAt: '2026-02-01T00:00:00.000Z', appointmentCount: 0, lastVisit: null },
  ];
  const patients = {
    findAll: jest.fn().mockResolvedValue(patientList),
    findOne: jest.fn().mockResolvedValue({
      ...patientList[0],
      appointments: [
        { id: 'x1', doctorId: 'd1', scheduledAt: '2026-03-01T10:00:00.000Z', status: 'completed', reason: 'Diabetes review', department: 'Endocrinology' },
        { id: 'x2', doctorId: 'd2', scheduledAt: at(0), status: 'scheduled', reason: 'Oncology consult', department: 'Oncology' },
        { id: 'x3', doctorId: 'd1', scheduledAt: '2026-04-01T10:00:00.000Z', status: 'cancelled', reason: 'r', department: 'Endocrinology' },
      ],
    }),
  };
  const beds = { findAll: jest.fn().mockResolvedValue({ beds: [{ id: 'b1', label: 'W-1', department: 'Ward', status: 'occupied', patientId: 'p1', patientName: 'Jane Roe' }] }) };
  const billing = {
    findAll: jest.fn().mockResolvedValue([
      { id: 'i1', patientId: 'p1', status: 'paid', amount: 100, amountPaid: 100, remaining: 0 },
      { id: 'i2', patientId: 'p1', status: 'pending', amount: 50, amountPaid: 0, remaining: 50 },
      { id: 'i3', patientId: 'p1', status: 'cancelled', amount: 999, amountPaid: 0, remaining: 999 },
      { id: 'i4', patientId: 'p2', status: 'pending', amount: 70, amountPaid: 0, remaining: 70 },
    ]),
  };
  const laboratory = {
    findAll: jest.fn().mockResolvedValue([
      { id: 'l1', patientId: 'p1', status: 'completed', testName: 'HbA1c', resultSummary: 'High' },
      { id: 'l2', patientId: 'p2', status: 'pending', testName: 'CBC', resultSummary: null },
    ]),
  };
  const tools = new PatientsAiTools(
    as<PatientsService>(patients),
    as<BedsService>(beds),
    as<BillingService>(billing),
    as<LaboratoryService>(laboratory),
  );

  it('marks both tools as audited', () => {
    expect(tools.tools().every((t) => t.audit === true)).toBe(true);
  });

  it('searches by real name server-side but returns only the pseudonym with PHI off', async () => {
    const result = await run(tools, 'patients.searchPatients', { query: 'jane' });
    expect(result).toMatchObject({ total: 2, matching: 1, returned: 1 });
    expect(result.patients[0]).toEqual({
      id: 'p1',
      patient: pseudonym('p1'),
      registeredAt: '2026-01-01T00:00:00.000Z',
      appointmentCount: 2,
      lastVisit: null,
    });
  });

  it('searches by id substring', async () => {
    const result = await run(tools, 'patients.searchPatients', { query: 'p2' });
    expect(result.patients.map((p: { id: string }) => p.id)).toEqual(['p2']);
  });

  it('returns contact details only when PHI is allowed', async () => {
    const result = await run(tools, 'patients.searchPatients', { query: 'jane' }, true);
    expect(result.patients[0]).toMatchObject({ patient: 'Jane Roe', email: 'jane@example.com', phone: '555-1' });
  });

  it('builds an administrative summary with no clinical content', async () => {
    const result = await run(tools, 'patients.getAdministrativeSummary', { patientId: 'p1' });
    expect(result).toMatchObject({
      id: 'p1',
      patient: pseudonym('p1'),
      appointments: {
        total: 3,
        byStatus: { completed: 1, scheduled: 1, cancelled: 1 },
        lastVisit: '2026-03-01T10:00:00.000Z',
        nextScheduled: at(0),
        distinctDoctors: 2,
      },
      bed: { label: 'W-1', department: 'Ward' },
      invoices: { total: 3, billed: 150, paid: 100, outstanding: 50 },
      labTests: { total: 1, byStatus: { completed: 1 } },
    });
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/Jane|jane@|Diabetes|Oncology|Endocrinology|HbA1c|High/);
  });
});

describe('LaboratoryAiTools', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const lab = (id: string, status: string, category: string, requestedHoursAgo: number, extra: Record<string, unknown> = {}) => ({
    id,
    patientId: `p-${id}`,
    patientName: 'Jane Roe',
    doctorId: 'd1',
    doctorName: 'Ada Lovelace',
    department: 'Cardiology',
    assignedToId: null,
    assignedToName: null,
    testName: 'CBC',
    category,
    status,
    resultSummary: 'Abnormal values',
    requestedAt: hoursAgo(requestedHoursAgo),
    completedAt: null,
    ...extra,
  });
  const laboratory = {
    findAll: jest.fn().mockResolvedValue([
      lab('t1', 'pending', 'Hematology', 5),
      lab('t2', 'pending', 'Biochemistry', 50),
      lab('t3', 'in-progress', 'Hematology', 10, { assignedToId: 'u1', assignedToName: 'Tech One' }),
      lab('t4', 'completed', 'Hematology', 30, { completedAt: hoursAgo(20) }),
    ]),
  };
  const tools = new LaboratoryAiTools(as<LaboratoryService>(laboratory));

  it('summarises status, categories, oldest pending age and turnaround', async () => {
    const result = await run(tools, 'laboratory.getOperationalStatus');
    expect(result.byStatus).toEqual({ pending: 2, 'in-progress': 1, completed: 1 });
    expect(result.byCategory).toEqual([
      { category: 'Biochemistry', total: 1, pending: 1, inProgress: 0, completed: 0 },
      { category: 'Hematology', total: 3, pending: 1, inProgress: 1, completed: 1 },
    ]);
    expect(result.oldestPendingAgeHours).toBeCloseTo(50, 0);
    expect(result.openUnassigned).toBe(2);
    expect(result.completedLast7Days).toBe(1);
    expect(result.avgTurnaroundHoursLast30Days).toBeCloseTo(10, 0);
  });

  it('lists open tests oldest first, never results, with pseudonymised patients', async () => {
    const result = await run(tools, 'laboratory.getPendingTests', { minAgeHours: 6 });
    expect(result.matching).toBe(2);
    expect(result.tests.map((t: { id: string }) => t.id)).toEqual(['t2', 't3']);
    expect(result.tests[0].patient).toBe(pseudonym('p-t2'));
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/Abnormal|resultSummary|Jane/);
  });
});

describe('EmergencyAiTools', () => {
  const emergencyCase = (id: string, status: string, priority: string, createdMinutesAgo: number, extra: Record<string, unknown> = {}) => ({
    id,
    patientId: `p-${id}`,
    patientName: 'Jane Roe',
    emergencyType: 'medical',
    priority,
    status,
    locationShared: true,
    assignedDoctorName: null,
    assignedStaffName: null,
    assignedTeamName: null,
    createdAt: new Date(Date.now() - createdMinutesAgo * 60_000).toISOString(),
    acknowledgedAt: null,
    assignedAt: null,
    respondingAt: null,
    arrivedAt: null,
    resolvedAt: null,
    cancelledAt: null,
    ...extra,
  });
  const emergency = {
    listAll: jest.fn().mockResolvedValue([
      emergencyCase('e1', 'new', 'normal', 60),
      emergencyCase('e2', 'team_assigned', 'critical', 5, { assignedTeamName: 'Alpha', assignedAt: new Date().toISOString() }),
      emergencyCase('e3', 'resolved', 'critical', 500),
      emergencyCase('e4', 'acknowledged', 'normal', 90),
    ]),
    analytics: jest.fn().mockResolvedValue({
      totalCases: 4,
      byStatus: { NEW: 1, TEAM_ASSIGNED: 1, RESOLVED: 1, ACKNOWLEDGED: 1 },
      byPriority: { CRITICAL: 2, NORMAL: 2 },
      byType: { MEDICAL: 4 },
      avgAcknowledgeSeconds: 90,
      avgAssignSeconds: null,
      avgResponseSeconds: 600,
      avgResolutionSeconds: 3600,
      volumeByDay: [{ date: '2026-11-17', count: 4 }],
    }),
  };
  const tools = new EmergencyAiTools(as<EmergencyService>(emergency));

  it('returns only active cases, critical first then oldest, with operational fields only', async () => {
    const result = await run(tools, 'emergency.getActiveIncidents');
    expect(result.totalActive).toBe(3);
    expect(result.incidents.map((i: { id: string }) => i.id)).toEqual(['e2', 'e4', 'e1']);
    expect(result.incidents[0].teamAssigned).toBe(true);
    expect(result.incidents[2].minutesOpen).toBe(60);
    expect(result.byPriority).toEqual({ critical: 1, normal: 2 });
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/Jane|patientId|locationShared/);
  });

  it('summarises analytics in minutes with lower-case keys', async () => {
    const result = await run(tools, 'emergency.summarizeOperationalActivity');
    expect(result).toMatchObject({
      totalCases: 4,
      activeNow: 3,
      byStatus: { team_assigned: 1, resolved: 1 },
      avgMinutesToAcknowledge: 1.5,
      avgMinutesToAssign: null,
      avgMinutesToRespond: 10,
      avgMinutesToResolve: 60,
    });
  });

  it('offers no write actions', () => {
    expect(tools.tools().every((t) => t.mode === 'read')).toBe(true);
    expect((tools as AiToolProvider).actions).toBeUndefined();
  });
});

describe('AnnouncementsAiTools', () => {
  const announcements = {
    findAll: jest.fn().mockResolvedValue([
      { id: 'n1', title: 'Fire drill', description: 'Friday 3pm', priority: 'important', authorName: 'Admin', createdAt: '2026-11-10T00:00:00.000Z' },
      { id: 'n2', title: 'Parking', description: 'Lot B closed', priority: 'normal', authorName: null, createdAt: '2026-11-09T00:00:00.000Z' },
    ]),
    create: jest.fn().mockResolvedValue({
      id: 'n3',
      title: 'Flu shots',
      description: 'Available all week',
      priority: 'normal',
      authorName: 'Admin',
      createdAt: '2026-11-17T00:00:00.000Z',
    }),
  };
  const tools = new AnnouncementsAiTools(as<AnnouncementsService>(announcements));
  const publish = tools.actions().find((a) => a.type === 'announcements.publish');

  it('lists recent announcements filtered by priority', async () => {
    const result = await run(tools, 'announcements.listRecent', { priority: 'important' });
    expect(result).toMatchObject({ matching: 1, returned: 1 });
    expect(result.announcements[0].id).toBe('n1');
  });

  it('preparePublish returns an action draft and changes nothing', async () => {
    const draft = await run(tools, 'announcements.preparePublish', { title: 'Flu shots', description: 'Available all week' });
    expect(draft).toEqual({ actionType: 'announcements.publish', params: { title: 'Flu shots', description: 'Available all week' } });
    expect(announcements.create).not.toHaveBeenCalled();
  });

  it('action schema rejects input outside CreateAnnouncementDto rules', () => {
    expect(publish!.schema.safeParse({ title: 'x'.repeat(151), description: 'd' }).success).toBe(false);
    expect(publish!.schema.safeParse({ title: 't', description: 'd', priority: 'critical' }).success).toBe(false);
    expect(publish!.schema.safeParse({ title: 't', description: 'd', authorId: 'x' }).success).toBe(false);
  });

  it('preview re-validates with the DTO and rejects invalid input', async () => {
    await expect(publish!.preview({ title: '', description: 'd' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(publish!.preview({ title: 't', description: 'x'.repeat(2001) }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(publish!.preview({ title: 't', description: 'd', priority: 'critical' }, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(publish!.preview({ title: 'Flu shots', description: 'Available all week', priority: 'urgent' }, user)).resolves.toContain(
      'Flu shots',
    );
  });

  it('execute publishes through AnnouncementsService.create as the approving admin', async () => {
    const result = await publish!.execute({ title: 'Flu shots', description: 'Available all week' }, user);
    expect(announcements.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Flu shots', description: 'Available all week' }),
      'admin-1',
    );
    expect(result).toEqual({ announcementId: 'n3', title: 'Flu shots', priority: 'normal', createdAt: '2026-11-17T00:00:00.000Z' });
  });
});

describe('DashboardAiTools', () => {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const inToday = new Date(startOfLocalDay(now).getTime() + 60_000).toISOString();

  const billing = {
    overview: jest.fn().mockResolvedValue({ totalRevenue: 1000, paidAmount: 600, pendingAmount: 300, overdueAmount: 100, totalInvoices: 9 }),
    revenueThisMonth: jest.fn().mockResolvedValue({ amount: 250 }),
    monthlyRevenueTrend: jest.fn((months: number) =>
      Promise.resolve(Array.from({ length: months }, (_, i) => ({ month: `M${i}`, revenue: i === months - 1 ? 250 : i === months - 2 ? 200 : 10 }))),
    ),
  };
  const reports = {
    appointmentsByStatus: jest.fn().mockResolvedValue([{ status: 'Scheduled', count: 2 }]),
    appointmentsByDepartment: jest.fn().mockResolvedValue([{ department: 'Cardiology', count: 2 }]),
  };
  const beds = {
    findAll: jest.fn().mockResolvedValue({
      beds: [
        { id: 'b1', label: '1', department: 'W', status: 'occupied', patientId: 'p1', patientName: 'Jane Roe' },
        { id: 'b2', label: '2', department: 'W', status: 'available', patientId: null, patientName: null },
        { id: 'b3', label: '3', department: 'W', status: 'maintenance', patientId: null, patientName: null },
      ],
    }),
  };
  const emergency = {
    analytics: jest.fn().mockResolvedValue({ totalCases: 7, avgAcknowledgeSeconds: 120 }),
    listAll: jest.fn().mockResolvedValue([
      { status: 'new', createdAt: inToday },
      { status: 'resolved', createdAt: new Date(lastMonthStart.getTime() + 86_400_000).toISOString() },
    ]),
  };
  const appointments = {
    findAllForAdmin: jest.fn().mockResolvedValue([
      adminAppointment('x1', inToday),
      adminAppointment('x2', inToday, { status: 'completed' }),
      adminAppointment('x3', new Date(lastMonthStart.getTime() + 86_400_000).toISOString()),
    ]),
  };
  const patients = {
    findAll: jest.fn().mockResolvedValue([
      { id: 'p1', fullName: 'Jane Roe', joinedAt: new Date(thisMonthStart.getTime() + 1000).toISOString() },
      { id: 'p2', fullName: 'John Doe', joinedAt: new Date(lastMonthStart.getTime() + 1000).toISOString() },
    ]),
  };
  const laboratory = {
    findAll: jest.fn().mockResolvedValue([
      { status: 'pending', requestedAt: inToday, completedAt: null },
      { status: 'in-progress', requestedAt: inToday, completedAt: null },
    ]),
  };
  const tools = new DashboardAiTools(
    as<BillingService>(billing),
    as<ReportsService>(reports),
    as<BedsService>(beds),
    as<EmergencyService>(emergency),
    as<AppointmentsService>(appointments),
    as<PatientsService>(patients),
    as<LaboratoryService>(laboratory),
  );

  it('composes the overview from the domain services', async () => {
    const result = await run(tools, 'dashboard.getOverview', { revenueMonths: 3 });
    expect(billing.monthlyRevenueTrend).toHaveBeenCalledWith(3);
    expect(result.revenue).toMatchObject({ thisMonth: 250, allTime: { totalInvoices: 9 } });
    expect(result.appointments.today).toEqual({ total: 2, scheduled: 1, completed: 1, cancelled: 0 });
    expect(result.patients).toEqual({ total: 2, registeredThisMonth: 1 });
    expect(result.beds).toMatchObject({ total: 3, occupied: 1, maintenance: 1, occupancyRate: 50 });
    expect(result.emergency).toEqual({ activeNow: 1, casesLast30Days: 7, avgMinutesToAcknowledge: 2 });
    expect(result.laboratory).toEqual({ pending: 1, inProgress: 1 });
    expect(JSON.stringify(result)).not.toMatch(/Jane/);
  });

  it('compares counts for arbitrary periods and revenue only for whole calendar months', async () => {
    const result = await run(tools, 'dashboard.compareMetrics', {
      periodA: { from: localDayKey(lastMonthStart), to: localDayKey(lastMonthEnd) },
      periodB: { from: localDayKey(thisMonthStart), to: new Date(Date.now() + 60_000).toISOString() },
    });
    const byMetric = Object.fromEntries(result.comparisons.map((c: { metric: string }) => [c.metric, c]));
    expect(byMetric.appointments).toMatchObject({ periodA: 1, periodB: 2, change: 1, changePct: 100 });
    expect(byMetric.newPatients).toMatchObject({ periodA: 1, periodB: 1, change: 0 });
    expect(byMetric.emergencyCases).toMatchObject({ periodA: 1, periodB: 1 });
    // Period B ends now, not at a month boundary -> revenue is not comparable.
    expect(byMetric.revenue).toMatchObject({ periodA: 200, periodB: null, change: null });
    expect(byMetric.revenue.note).toBeDefined();
    expect(result.appointmentStatus.periodB).toEqual({ scheduled: 1, completed: 1 });
  });
});
