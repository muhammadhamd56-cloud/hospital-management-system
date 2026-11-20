import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { PhiMasker } from '../security/phi-masker';
import type { AiActionHandler } from '../tools/ai-action.types';
import type { AiToolContext, AiToolDefinition, AiToolProvider } from '../tools/ai-tool.types';
import { ApprovalsAiTools } from './approvals.ai-tools';
import { BillingAiTools } from './billing.ai-tools';
import { ProfileAiTools } from './profile.ai-tools';
import { ReportsAiTools } from './reports.ai-tools';
import { SchedulingAiTools } from './scheduling.ai-tools';
import { SettingsAiTools } from './settings.ai-tools';
import { StaffAiTools } from './staff.ai-tools';
import { ToolRegistryService } from '../tools/tool-registry.service';

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };

const ctx: AiToolContext = {
  user: admin,
  runId: 'run-1',
  conversationId: 'conv-1',
  phi: new PhiMasker(false),
  signal: new AbortController().signal,
};

function tool(provider: AiToolProvider, name: string): AiToolDefinition {
  const found = provider.tools().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function action(provider: AiToolProvider, type: string): AiActionHandler {
  const found = provider.actions?.().find((candidate) => candidate.type === type);
  if (!found) throw new Error(`missing action ${type}`);
  return found;
}

/** Same steps as ToolDispatcherService: validate input, execute, project through the output allowlist. */
async function run(provider: AiToolProvider, name: string, args: unknown = {}): Promise<any> {
  const definition = tool(provider, name);
  const input = definition.input.parse(args);
  const raw = await definition.execute(input, ctx);
  return definition.mode === 'propose' ? raw : definition.output.parse(raw);
}

/** Same steps as AiProposalService: schema parse, then preview. */
async function preview(provider: AiToolProvider, type: string, params: unknown): Promise<string> {
  const handler = action(provider, type);
  return handler.preview(handler.schema.parse(params), admin);
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function invoice(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-0001',
    patientId: 'pat-1',
    patientName: 'Jane Secret',
    description: 'Consultation',
    subtotal: 100,
    discount: 0,
    tax: 0,
    amount: 100,
    amountPaid: 0,
    remaining: 100,
    issueDate: daysFromNow(-10),
    dueDate: daysFromNow(5),
    status: 'pending',
    items: [{ id: 'it-1', description: 'x', quantity: 1, unitPrice: 100, discount: 0, lineTotal: 100 }],
    payments: [],
    ...overrides,
  };
}

function rosterMember(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'st-1',
    staffType: 'nurse',
    fullName: 'Nina Nurse',
    email: null,
    isActive: true,
    userId: null,
    department: 'ICU',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function shift(overrides: Record<string, unknown> = {}, staff: any = rosterMember()): any {
  return {
    id: 'sh-1',
    staff,
    department: 'ICU',
    date: '2026-12-01T00:00:00.000Z',
    startTime: '2026-12-01T08:00:00.000Z',
    endTime: '2026-12-01T16:00:00.000Z',
    shiftType: 'morning',
    status: 'scheduled',
    notes: 'patient Jane Secret in bed 4',
    groupId: null,
    createdById: 'admin-1',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BillingAiTools', () => {
  const invoices = [
    invoice({ id: 'a', remaining: 100 }),
    invoice({ id: 'b', remaining: 40, amountPaid: 60, status: 'overdue', dueDate: daysFromNow(-3) }),
    invoice({ id: 'c', remaining: 0, amountPaid: 100, status: 'paid' }),
    invoice({
      id: 'd',
      status: 'cancelled',
      remaining: 100,
      amountPaid: 30,
      payments: [{ id: 'p1', amount: 30, method: 'CASH', refundedAmount: 0, createdAt: new Date().toISOString() }],
    }),
    invoice({ id: 'e', status: 'paid', amountPaid: 150, remaining: 0 }),
  ];
  const billing = {
    findAll: jest.fn().mockResolvedValue(invoices),
    overview: jest.fn().mockResolvedValue({ totalRevenue: 1, paidAmount: 1, pendingAmount: 0, overdueAmount: 0, totalInvoices: 1 }),
    revenueThisMonth: jest.fn().mockResolvedValue({ amount: 5 }),
    monthlyRevenueTrend: jest.fn().mockResolvedValue([{ month: 'Nov', revenue: 5 }]),
  };
  const provider = new BillingAiTools(billing as any);

  it('exposes no write actions', () => {
    expect((provider as AiToolProvider).actions).toBeUndefined();
    expect(provider.tools().every((definition) => definition.mode === 'read')).toBe(true);
  });

  it('lists only non-cancelled invoices with a balance, masks patient names', async () => {
    const result = await run(provider, 'billing.getOutstandingInvoices', {});
    expect(result.invoices.map((row: any) => row.id)).toEqual(['a', 'b']);
    expect(result.total).toBe(2);
    expect(result.totalOutstanding).toBe(140);
    expect(result.overdueCount).toBe(1);
    expect(result.totalOverdue).toBe(40);
    expect(result.invoices[1]).toMatchObject({ overdue: true, daysOverdue: 3 });
    expect(JSON.stringify(result)).not.toContain('Jane');
    expect(result.invoices[0].patient).toBe(`Patient ${PhiMasker.pseudonym('pat-1')}`);
    expect(result.invoices[0]).not.toHaveProperty('description');
  });

  it('honours overdueOnly and limit', async () => {
    const result = await run(provider, 'billing.getOutstandingInvoices', { overdueOnly: true, limit: 1 });
    expect(result).toMatchObject({ total: 1, returned: 1 });
    expect(result.invoices[0].id).toBe('b');
  });

  it('flags cancelled-with-payments and overpayment', async () => {
    const result = await run(provider, 'billing.findDiscrepancies', {});
    const issues = result.issues.map((row: any) => `${row.invoiceId}:${row.issue}`);
    expect(issues.some((entry: string) => entry.startsWith('d:Cancelled but still holds'))).toBe(true);
    expect(issues.some((entry: string) => entry.startsWith('e:Overpaid by 50.00'))).toBe(true);
    expect(result.totalIssues).toBe(2);
    expect(JSON.stringify(result)).not.toContain('Jane');
  });

  it('compares periods and rejects ranges over 366 days', async () => {
    const today = daysFromNow(0);
    const result = await run(provider, 'billing.comparePeriods', {
      periodA: { from: daysFromNow(-60), to: daysFromNow(-30) },
      periodB: { from: daysFromNow(-20), to: today },
    });
    expect(result.periodA.invoiced).toBe(0);
    expect(result.periodB.invoiceCount).toBe(4);
    expect(result.periodB.invoiced).toBe(400);
    expect(result.periodB.cancelledCount).toBe(1);
    expect(result.periodB.collected).toBe(30);
    expect(result.change.invoiced).toEqual({ absolute: 400, percent: null });

    const definition = tool(provider, 'billing.comparePeriods');
    expect(
      definition.input.safeParse({ periodA: { from: '2024-01-01', to: '2025-06-01' }, periodB: { from: '2025-01-01', to: '2025-01-02' } })
        .success,
    ).toBe(false);
  });

  it('returns the financial summary from the service', async () => {
    const result = await run(provider, 'billing.getFinancialSummary', { trendMonths: 3 });
    expect(billing.monthlyRevenueTrend).toHaveBeenCalledWith(3);
    expect(result.revenueThisMonth).toBe(5);
  });
});

describe('ReportsAiTools', () => {
  const reports = {
    revenueTrend: jest.fn().mockResolvedValue([{ month: 'Nov', revenue: 10 }]),
    appointmentsByDepartment: jest.fn().mockResolvedValue([{ department: 'ICU', count: 3 }]),
    appointmentsByStatus: jest.fn().mockResolvedValue([{ status: 'Completed', count: 2 }]),
  };
  const billing = { findAll: jest.fn().mockResolvedValue([invoice()]) };
  const shifts = { findAll: jest.fn().mockResolvedValue([shift()]) };
  const roster = { findAll: jest.fn().mockResolvedValue([rosterMember()]) };
  const tasks = { findAll: jest.fn().mockResolvedValue([]) };
  const provider = new ReportsAiTools(reports as any, billing as any, shifts as any, roster as any, tasks as any);

  it('builds a financial report with sections and no patient identifiers', async () => {
    const result = await run(provider, 'reports.prepareReport', {
      reportType: 'financial',
      from: daysFromNow(-30),
      to: daysFromNow(0),
    });
    expect(result.period.applied).toBe(true);
    const summary = result.sections.find((section: any) => section.title === 'Summary');
    expect(summary.rows).toContainEqual(['Billed revenue', 100]);
    expect(JSON.stringify(result)).not.toMatch(/Jane|pat-1/);
  });

  it('marks the date range as not applied for appointments', async () => {
    const result = await run(provider, 'reports.prepareReport', { reportType: 'appointments', from: '2026-11-01', to: '2026-11-30' });
    expect(result.period.applied).toBe(false);
    expect(result.sections[0].rows).toEqual([['ICU', 3]]);
  });

  it('builds a staffing report with shift hours', async () => {
    const result = await run(provider, 'reports.prepareReport', { reportType: 'staffing', from: '2026-12-01', to: '2026-12-31' });
    const shiftsSection = result.sections.find((section: any) => section.title === 'Shifts by department and type');
    expect(shiftsSection.rows).toEqual([['ICU', 'morning', 1, 8, 1]]);
  });

  it('lists report types', async () => {
    const result = await run(provider, 'reports.listReportTypes');
    expect(result.reportTypes.map((entry: any) => entry.type)).toEqual(['financial', 'appointments', 'staffing']);
  });
});

describe('StaffAiTools', () => {
  const accounts = {
    findAll: jest.fn().mockResolvedValue([
      { id: 'u1', fullName: 'Doc', email: 'd@x', role: 'doctor', createdAt: '' },
      { id: 'u2', fullName: 'Stf', email: 's@x', role: 'staff', createdAt: '' },
      { id: 'u3', fullName: 'Doc2', email: 'd2@x', role: 'doctor', createdAt: '' },
    ]),
  };
  const members = [
    rosterMember(),
    rosterMember({ id: 'st-2', staffType: 'doctor', isActive: false, userId: 'u1' }),
    rosterMember({ id: 'st-3', department: null }),
  ];
  const roster = { findAll: jest.fn().mockResolvedValue(members) };
  const shifts = {
    findAll: jest.fn().mockResolvedValue([
      shift(),
      shift({ id: 'sh-2', status: 'cancelled' }),
      shift({ id: 'sh-3', staff: members[1], startTime: '2026-12-02T08:00:00.000Z', endTime: '2026-12-02T20:00:00.000Z', date: '2026-12-02T00:00:00.000Z' }),
    ]),
  };
  const tasks = {
    findAll: jest.fn().mockResolvedValue([
      { id: 't1', dueAt: '2026-12-03T10:00:00.000Z', status: 'completed', assignedTo: members[0] },
      { id: 't2', dueAt: '2026-12-04T10:00:00.000Z', status: 'overdue', assignedTo: members[0] },
      { id: 't3', dueAt: '2027-03-01T10:00:00.000Z', status: 'pending', assignedTo: members[0] },
    ]),
  };
  const provider = new StaffAiTools(accounts as any, roster as any, shifts as any, tasks as any);

  it('counts accounts and roster by type/department/active', async () => {
    const result = await run(provider, 'staff.getStaffOverview');
    expect(result.accounts.byRole).toContainEqual({ role: 'doctor', count: 2 });
    expect(result.roster).toMatchObject({ total: 3, active: 2, inactive: 1, linkedToAccount: 1 });
    expect(result.roster.byDepartment).toContainEqual({ name: 'Unassigned', total: 1, active: 1 });
  });

  it('summarises workload per staff member in range', async () => {
    const result = await run(provider, 'staff.getWorkloadSummary', { from: '2026-12-01', to: '2026-12-31' });
    expect(shifts.findAll).toHaveBeenCalledWith({ dateFrom: '2026-12-01', dateTo: '2026-12-31', department: undefined });
    expect(result.staff[0]).toMatchObject({ staffId: 'st-2', shifts: 1, shiftHours: 12 });
    expect(result.staff[1]).toMatchObject({
      staffId: 'st-1',
      shifts: 1,
      shiftHours: 8,
      cancelledShifts: 1,
      tasksDue: 2,
      tasksOpen: 1,
      tasksOverdue: 1,
      tasksCompleted: 1,
    });
    expect(result).toMatchObject({ staffWithWork: 2, totalShifts: 2, totalShiftHours: 20, totalTasks: 2 });
    expect(result.staff[0]).not.toHaveProperty('email');
  });

  it('lists departments derived from the roster', async () => {
    const result = await run(provider, 'staff.listDepartments');
    expect(result.departments).toEqual([{ name: 'ICU', total: 2, active: 1, doctors: 1 }]);
    expect(result.unassignedStaff).toBe(1);
  });
});

describe('ApprovalsAiTools', () => {
  const pending = [
    {
      id: 'u-doc',
      fullName: 'Dr Who',
      email: 'who@example.com',
      role: 'doctor',
      status: 'pending',
      specialization: null,
      department: 'ER',
      requestedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      reviewedAt: null,
      note: null,
    },
    {
      id: 'u-staff',
      fullName: 'Sam Staff',
      email: 'sam@example.com',
      role: 'staff',
      status: 'pending',
      specialization: null,
      department: null,
      requestedAt: new Date().toISOString(),
      reviewedAt: null,
      note: null,
    },
  ];
  const approvals = {
    list: jest.fn().mockResolvedValue(pending),
    review: jest.fn().mockResolvedValue({ ...pending[0], status: 'approved' }),
  };
  const provider = new ApprovalsAiTools(approvals as any);

  beforeEach(() => approvals.review.mockClear());

  it('lists pending applications with waiting days', async () => {
    const result = await run(provider, 'approvals.getPendingApplications', { role: 'doctor' });
    expect(approvals.list).toHaveBeenCalledWith('pending');
    expect(result).toMatchObject({ total: 1, returned: 1, oldestWaitingDays: 3 });
  });

  it('reports missing doctor fields only', async () => {
    const result = await run(provider, 'approvals.findMissingInformation');
    expect(result).toMatchObject({ checked: 2, complete: 1, incomplete: 1 });
    expect(result.applications[0]).toEqual({ id: 'u-doc', fullName: 'Dr Who', role: 'doctor', missing: ['specialization'] });
  });

  it('proposes a review action', async () => {
    const draft = await run(provider, 'approvals.prepareDecision', { userId: 'u-doc', decision: 'reject', note: 'Missing licence' });
    expect(draft).toEqual({ actionType: 'approvals.review', params: { userId: 'u-doc', decision: 'reject', note: 'Missing licence' } });
  });

  it('preview refuses an account that is no longer pending and invalid notes', async () => {
    await expect(preview(provider, 'approvals.review', { userId: 'gone', decision: 'approve' })).rejects.toThrow(
      'no longer pending',
    );
    expect(() => action(provider, 'approvals.review').schema.parse({ userId: 'u-doc', decision: 'reject', note: 'x'.repeat(501) })).toThrow();
    expect(() => action(provider, 'approvals.review').schema.parse({ userId: 'u-doc', decision: 'maybe' })).toThrow();
    await expect(preview(provider, 'approvals.review', { userId: 'u-doc', decision: 'approve' })).resolves.toContain('Approve');
  });

  it('execute calls AccountApprovalsService.review with the caller', async () => {
    const handler = action(provider, 'approvals.review');
    const result = await handler.execute({ userId: 'u-doc', decision: 'approve' }, admin);
    expect(approvals.review).toHaveBeenCalledWith(admin, 'u-doc', expect.objectContaining({ decision: 'approve' }));
    expect(result).toEqual({ userId: 'u-doc', status: 'approved' });
  });
});

describe('SchedulingAiTools', () => {
  const inactive = rosterMember({ id: 'st-9', fullName: 'Old Timer', isActive: false });
  const shiftList = [
    shift(),
    shift({ id: 'sh-2', startTime: '2026-12-01T15:00:00.000Z', endTime: '2026-12-01T23:00:00.000Z', shiftType: 'evening' }),
    shift({ id: 'sh-3', status: 'cancelled', startTime: '2026-12-01T09:00:00.000Z' }),
    shift({ id: 'sh-4', date: '2026-12-02T00:00:00.000Z', startTime: '2026-12-02T08:00:00.000Z', endTime: '2026-12-02T16:00:00.000Z' }, inactive),
  ];
  const shifts = {
    findAll: jest.fn().mockResolvedValue(shiftList),
    assertNoSchedulingConflict: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(shift({ id: 'new-shift' })),
  };
  const availability = {
    listLeave: jest.fn(async (staffId: string) =>
      staffId === 'st-1' ? [{ id: 'l1', staffId, date: '2026-12-01T00:00:00.000Z', reason: 'sick', createdAt: '' }] : [],
    ),
    findForStaff: jest.fn(async () => [{ dayOfWeek: 'wednesday', isAvailable: false, availableFrom: null, availableTo: null }]),
  };
  const roster = { findAll: jest.fn().mockResolvedValue([rosterMember(), inactive]) };
  const provider = new SchedulingAiTools(shifts as any, availability as any, roster as any);

  beforeEach(() => {
    shifts.assertNoSchedulingConflict.mockClear();
    shifts.create.mockClear();
  });

  it('lists shifts without notes', async () => {
    const result = await run(provider, 'scheduling.listShifts', { from: '2026-12-01', to: '2026-12-31', limit: 2 });
    expect(result).toMatchObject({ total: 4, returned: 2 });
    expect(JSON.stringify(result)).not.toContain('Jane');
    expect(result.shifts[0]).toMatchObject({ staffName: 'Nina Nurse', date: '2026-12-01' });
  });

  it('detects overlap, leave, unavailable weekday and inactive staff', async () => {
    const result = await run(provider, 'scheduling.detectConflicts', { from: '2026-12-01', to: '2026-12-31' });
    // 2026-12-01 is a Tuesday (no unavailability); 2026-12-02 is a Wednesday (unavailable).
    expect(result.byType).toEqual({ overlap: 1, on_leave: 2, unavailable_day: 1, inactive_staff: 1 });
    expect(result.issues.find((issue: any) => issue.type === 'overlap').shiftIds).toEqual(['sh-1', 'sh-2']);
    expect(result.shiftsChecked).toBe(3);
  });

  it('finds coverage gaps below the threshold', async () => {
    const result = await run(provider, 'scheduling.findCoverageGaps', {
      from: '2026-12-01',
      to: '2026-12-02',
      minStaff: 1,
      shiftTypes: ['morning', 'night'],
    });
    expect(result.slotsChecked).toBe(4);
    expect(result.gaps).toEqual([
      { date: '2026-12-01', shiftType: 'night', assigned: 0, required: 1, shortfall: 1 },
      { date: '2026-12-02', shiftType: 'night', assigned: 0, required: 1, shortfall: 1 },
    ]);
  });

  const valid = {
    staffId: 'st-1',
    startTime: '2027-01-05T08:00:00+05:00',
    endTime: '2027-01-05T16:00:00+05:00',
    shiftType: 'morning',
  };

  it('preview validates the DTO, staff state and runs the service conflict check', async () => {
    const summary = await preview(provider, 'scheduling.createShift', valid);
    expect(summary).toContain('Nina Nurse');
    expect(shifts.assertNoSchedulingConflict).toHaveBeenCalledWith({
      staffId: 'st-1',
      startTime: new Date('2027-01-05T03:00:00.000Z'),
      endTime: new Date('2027-01-05T11:00:00.000Z'),
      date: new Date('2027-01-05T00:00:00.000Z'),
      localStartMinutes: 480,
    });
  });

  it('preview rejects bad timing, inactive staff and service conflicts', async () => {
    await expect(preview(provider, 'scheduling.createShift', { ...valid, endTime: '2027-01-05T07:00:00+05:00' })).rejects.toThrow(
      'end time must be after',
    );
    await expect(
      preview(provider, 'scheduling.createShift', { ...valid, startTime: '2020-01-05T08:00:00+05:00', endTime: '2020-01-05T10:00:00+05:00' }),
    ).rejects.toThrow('in the past');
    await expect(preview(provider, 'scheduling.createShift', { ...valid, staffId: 'st-9' })).rejects.toThrow('not active');
    expect(() => action(provider, 'scheduling.createShift').schema.parse({ ...valid, startTime: '2027-01-05 08:00' })).toThrow();
    shifts.assertNoSchedulingConflict.mockRejectedValueOnce(new Error("You're already assigned to a shift during this time."));
    await expect(preview(provider, 'scheduling.createShift', valid)).rejects.toThrow('already assigned');
  });

  it('execute creates through ShiftsService.create with the caller id', async () => {
    const handler = action(provider, 'scheduling.createShift');
    const result = await handler.execute(handler.schema.parse(valid), admin);
    expect(shifts.create).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'st-1', date: '2027-01-05', localStartTime: '08:00', startTime: '2027-01-05T03:00:00.000Z' }),
      'admin-1',
    );
    expect(result).toMatchObject({ shiftId: 'new-shift' });
  });
});

describe('ProfileAiTools', () => {
  const user = {
    id: 'admin-1',
    email: 'admin@example.com',
    firstName: 'Ada',
    lastName: 'Admin',
    phone: '+923001234567',
    role: Role.ADMIN,
    mfaEnabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    password: '$2b$10$hash',
    mfaSecret: 'JBSWY3DPEHPK3PXP',
    mfaBackupCodeHashes: ['h1'],
    otpCodeHash: 'otp',
    passwordResetCodeHash: 'reset',
    tokenVersion: 3,
    googleId: 'g-1',
  };
  const users = {
    findById: jest.fn().mockResolvedValue(user),
    updateProfile: jest.fn().mockResolvedValue({ ...user, firstName: 'Ava' }),
  };
  const provider = new ProfileAiTools(users as any);

  it('returns only allowlisted fields of the caller', async () => {
    const result = await run(provider, 'profile.getAdminProfile');
    expect(users.findById).toHaveBeenCalledWith('admin-1');
    expect(Object.keys(result).sort()).toEqual(['createdAt', 'email', 'firstName', 'lastName', 'mfaEnabled', 'phone', 'role']);
    const json = JSON.stringify(result);
    for (const secret of ['hash', 'JBSWY3DPEHPK3PXP', 'otp', 'reset', 'g-1', 'password', 'mfaSecret']) {
      expect(json).not.toContain(secret);
    }
    expect(result.role).toBe('admin');
  });

  it('the action schema cannot target another user', () => {
    expect(() => action(provider, 'profile.update').schema.parse({ userId: 'someone-else', firstName: 'X' })).toThrow();
    expect(() => action(provider, 'profile.update').schema.parse({})).toThrow();
  });

  it('preview validates via UpdateProfileDto and rejects no-op changes', async () => {
    await expect(preview(provider, 'profile.update', { phone: '12345' })).rejects.toThrow();
    await expect(preview(provider, 'profile.update', { firstName: 'Ada' })).rejects.toThrow('Nothing to change');
    await expect(preview(provider, 'profile.update', { firstName: 'Ava' })).resolves.toContain('"Ada" -> "Ava"');
  });

  it('execute updates only the caller', async () => {
    const handler = action(provider, 'profile.update');
    const result = await handler.execute({ firstName: 'Ava' }, admin);
    expect(users.updateProfile).toHaveBeenCalledWith('admin-1', expect.objectContaining({ firstName: 'Ava' }));
    expect(result).toEqual({ userId: 'admin-1', updatedFields: ['firstName'] });
  });
});

describe('SettingsAiTools', () => {
  const aiConfig = {
    enabled: true,
    provider: 'ollama',
    model: 'llama3.1:8b',
    baseUrl: 'http://gpu-box.internal:11434',
    apiKey: 'proxy-supersecretvalue123',
    allowPhi: false,
    enableWrites: true,
    ragEnabled: false,
    maxOutputTokens: 1,
  };
  const config = { get: jest.fn(() => aiConfig) };
  const platform = {
    getSettings: jest.fn().mockResolvedValue({ consultationMargin: 10 }),
    updateConsultationMargin: jest.fn().mockResolvedValue({ consultationMargin: 12.5 }),
  };
  const provider = new SettingsAiTools(platform as any, config as any);

  it('returns settings and AI flags without the API key or server URL', async () => {
    const result = await run(provider, 'settings.getConfiguration');
    expect(result.adminAi).toEqual({
      enabled: true,
      provider: 'ollama',
      model: 'llama3.1:8b',
      writesEnabled: true,
      allowPhi: false,
      ragEnabled: false,
      modelServerConfigured: true,
    });
    expect(JSON.stringify(result)).not.toContain('supersecret');
    expect(JSON.stringify(result)).not.toContain('gpu-box');
    expect(result.platform.consultationMargin).toBe(10);
  });

  it('finds inconsistencies', async () => {
    platform.getSettings.mockResolvedValueOnce({ consultationMargin: -1.234 });
    config.get.mockReturnValueOnce({ ...aiConfig, baseUrl: undefined as any, ragEnabled: true });
    const result = await run(provider, 'settings.findInconsistencies');
    const settings = result.issues.map((issue: any) => issue.setting);
    expect(settings).toEqual(
      expect.arrayContaining(['consultationMargin', 'AI_BASE_URL', 'AI_ENABLE_WRITES', 'AI_RAG_ENABLED']),
    );
    expect(result.issues.filter((issue: any) => issue.setting === 'consultationMargin')).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('supersecret');
  });

  it('preview enforces DTO bounds and rejects a no-op', async () => {
    expect(() => action(provider, 'settings.updateConsultationMargin').schema.parse({ consultationMargin: -5 })).toThrow();
    await expect(preview(provider, 'settings.updateConsultationMargin', { consultationMargin: 10 })).rejects.toThrow('already');
    await expect(preview(provider, 'settings.updateConsultationMargin', { consultationMargin: 12.5 })).resolves.toContain(
      'from 10.00 to 12.50',
    );
  });

  it('execute calls PlatformSettingsService with the caller id', async () => {
    const handler = action(provider, 'settings.updateConsultationMargin');
    const result = await handler.execute({ consultationMargin: 12.5 }, admin);
    expect(platform.updateConsultationMargin).toHaveBeenCalledWith(12.5, 'admin-1');
    expect(result).toEqual({ consultationMargin: 12.5 });
  });
});

describe('group B registration', () => {
  it('all providers pass ToolRegistryService validation (names, permissions, JSON input schemas)', () => {
    const mock = {} as any;
    const providers: AiToolProvider[] = [
      new BillingAiTools(mock),
      new ReportsAiTools(mock, mock, mock, mock, mock),
      new StaffAiTools(mock, mock, mock, mock),
      new ApprovalsAiTools(mock),
      new SchedulingAiTools(mock, mock, mock),
      new ProfileAiTools(mock),
      new SettingsAiTools(mock, mock),
    ];
    const registry = new ToolRegistryService(providers);
    expect(registry.catalogue()).toHaveLength(23);
    for (const type of ['approvals.review', 'scheduling.createShift', 'profile.update', 'settings.updateConsultationMargin']) {
      expect(registry.findAction(type)).toBeDefined();
    }
  });
});
