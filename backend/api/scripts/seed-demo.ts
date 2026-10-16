/**
 * Portfolio-demo seed: four ready-to-use logins (see src/demo/demo-accounts.ts)
 * plus enough realistic sample data that every dashboard looks alive.
 *
 *   npm run db:seed:demo                 # seed if not already seeded (idempotent)
 *   npm run db:seed:demo -- --reset      # delete previously seeded demo data, then reseed
 *   npm run db:seed:demo -- --reset-only # delete previously seeded demo data and stop
 *
 * Every seeded row hangs off a user or staff roster entry whose email ends in
 * @demo.hms (or is an AuditLog row for a seeded emergency case), which is how
 * --reset finds it. Departments and beds are shared hospital structure, so
 * they are upserted/created but never deleted -- reset only frees beds that
 * demo patients occupy. Note that deleting demo users cascades like any user
 * deletion would: e.g. a real patient's appointment booked with a demo doctor
 * through the app goes with that doctor.
 *
 * Without --reset, an existing seed is detected (demo admin exists and the
 * demo patient has appointments) and only the demo login credentials are
 * refreshed. If that marker is missing, any partial leftovers are cleaned up
 * first and the full dataset is created in a single transaction.
 */
import {
  AnnouncementPriority,
  AppointmentMode,
  AppointmentStatus,
  ApplicationStatus,
  AttendanceStatus,
  AuditAction,
  BedStatus,
  ChatSender,
  EmergencyPriority,
  EmergencyStatus,
  EmergencyType,
  InvoiceStatus,
  LabTestCategory,
  LabTestStatus,
  NotificationType,
  PaymentMethod,
  Prisma,
  PrismaClient,
  Role,
  ShiftStatus,
  ShiftType,
  StaffType,
  TaskPriority,
  TaskStatus,
  type Doctor,
  type User,
} from '@prisma/client';
import { hashPassword } from '../src/auth/password.util';
import { DEMO_ACCOUNT_EMAILS, DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from '../src/demo/demo-accounts';

const prisma = new PrismaClient();

type Tx = Prisma.TransactionClient;

const [ADMIN_EMAIL, DOCTOR_EMAIL, PATIENT_EMAIL, STAFF_EMAIL] = DEMO_ACCOUNT_EMAILS;

/** Same department list and bed layout as scripts/seed-beds.ts. */
const DEPARTMENTS = [
  'Cardiology',
  'Neurology',
  'Orthopedics',
  'Pediatrics',
  'Dermatology',
  'General Medicine',
  'Emergency',
  'Radiology',
  'ENT',
  'Gynecology',
  'Psychiatry',
  'Dentistry',
];
const BEDS_PER_DEPARTMENT = 10;

// ---------------------------------------------------------------------------
// Static sample data
// ---------------------------------------------------------------------------

interface UserSeed {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

interface DoctorSeed extends UserSeed {
  department: string;
  specialization: string;
  qualifications: string;
  bio: string;
  experienceYears: number;
  rating: number;
  consultationFee: number;
  acceptsOnline: boolean;
}

const DEMO_ADMIN: UserSeed = {
  email: ADMIN_EMAIL,
  firstName: 'Sarah',
  lastName: 'Mitchell',
  role: Role.ADMIN,
  phone: '+14155550101',
};

const DEMO_DOCTOR: DoctorSeed = {
  email: DOCTOR_EMAIL,
  firstName: 'Omar',
  lastName: 'Siddiqui',
  role: Role.DOCTOR,
  phone: '+14155550102',
  department: 'Cardiology',
  specialization: 'Cardiologist',
  qualifications: 'MBBS, FCPS (Cardiology)',
  bio: 'Consultant cardiologist focused on preventive cardiology, hypertension and heart-failure management.',
  experienceYears: 12,
  rating: 4.8,
  consultationFee: 120,
  acceptsOnline: true,
};

const DEMO_PATIENT: UserSeed = {
  email: PATIENT_EMAIL,
  firstName: 'Ali',
  lastName: 'Hassan',
  role: Role.PATIENT,
  phone: '+14155550103',
  gender: 'male',
  dateOfBirth: '1988-04-17',
  address: '221 Maple Avenue, Springfield',
  emergencyContactName: 'Zara Hassan',
  emergencyContactPhone: '+14155550199',
};

const DEMO_STAFF: UserSeed = {
  email: STAFF_EMAIL,
  firstName: 'Fatima',
  lastName: 'Noor',
  role: Role.STAFF,
  phone: '+14155550104',
};

const LAB_TECH: UserSeed = {
  email: 'lab.bilal@demo.hms',
  firstName: 'Bilal',
  lastName: 'Ahmed',
  role: Role.STAFF,
  phone: '+14155550105',
};

const EXTRA_DOCTORS: DoctorSeed[] = [
  {
    email: 'dr.emily.carter@demo.hms',
    firstName: 'Emily',
    lastName: 'Carter',
    role: Role.DOCTOR,
    department: 'Neurology',
    specialization: 'Neurologist',
    qualifications: 'MD, Board Certified Neurology',
    bio: 'Treats migraine, epilepsy and movement disorders with a patient-first approach.',
    experienceYears: 9,
    rating: 4.7,
    consultationFee: 140,
    acceptsOnline: true,
  },
  {
    email: 'dr.hamza.qureshi@demo.hms',
    firstName: 'Hamza',
    lastName: 'Qureshi',
    role: Role.DOCTOR,
    department: 'Orthopedics',
    specialization: 'Orthopedic Surgeon',
    qualifications: 'MBBS, MS (Orthopedics)',
    bio: 'Sports injuries, joint replacement and fracture care.',
    experienceYears: 15,
    rating: 4.6,
    consultationFee: 150,
    acceptsOnline: false,
  },
  {
    email: 'dr.priya.sharma@demo.hms',
    firstName: 'Priya',
    lastName: 'Sharma',
    role: Role.DOCTOR,
    department: 'Pediatrics',
    specialization: 'Pediatrician',
    qualifications: 'MBBS, DCH',
    bio: 'Child health, vaccinations and developmental check-ups from newborns to teens.',
    experienceYears: 8,
    rating: 4.9,
    consultationFee: 90,
    acceptsOnline: true,
  },
  {
    email: 'dr.james.wilson@demo.hms',
    firstName: 'James',
    lastName: 'Wilson',
    role: Role.DOCTOR,
    department: 'Dermatology',
    specialization: 'Dermatologist',
    qualifications: 'MD, FAAD',
    bio: 'Medical and cosmetic dermatology, acne and eczema management.',
    experienceYears: 11,
    rating: 4.5,
    consultationFee: 110,
    acceptsOnline: true,
  },
  {
    email: 'dr.sana.malik@demo.hms',
    firstName: 'Sana',
    lastName: 'Malik',
    role: Role.DOCTOR,
    department: 'General Medicine',
    specialization: 'General Physician',
    qualifications: 'MBBS, MRCP',
    bio: 'Primary care for adults: diabetes, hypertension, infections and annual check-ups.',
    experienceYears: 7,
    rating: 4.6,
    consultationFee: 70,
    acceptsOnline: true,
  },
  {
    email: 'dr.daniel.kim@demo.hms',
    firstName: 'Daniel',
    lastName: 'Kim',
    role: Role.DOCTOR,
    department: 'ENT',
    specialization: 'ENT Specialist',
    qualifications: 'MD, Otolaryngology',
    bio: 'Sinus, hearing and throat disorders, including minor ENT procedures.',
    experienceYears: 10,
    rating: 4.4,
    consultationFee: 100,
    acceptsOnline: false,
  },
];

const EXTRA_PATIENTS: UserSeed[] = [
  ['Ayesha', 'Khan', 'female', '1992-02-11'],
  ['Michael', 'Brown', 'male', '1975-09-23'],
  ['Sophia', 'Martinez', 'female', '2001-06-30'],
  ['Hassan', 'Raza', 'male', '1966-12-05'],
  ['Olivia', 'Johnson', 'female', '1984-03-14'],
  ['Ahmed', 'Farooq', 'male', '1958-07-19'],
  ['Emma', 'Davis', 'female', '1996-11-02'],
  ['Yusuf', 'Ali', 'male', '2015-05-21'],
  ['Mia', 'Thompson', 'female', '1979-01-08'],
  ['David', 'Nguyen', 'male', '1990-08-27'],
  ['Hira', 'Shah', 'female', '1987-10-12'],
  ['Robert', 'Taylor', 'male', '1952-04-03'],
  ['Zainab', 'Iqbal', 'female', '2012-09-15'],
  ['Lucas', 'Anderson', 'male', '1999-02-28'],
  ['Noor', 'Fatima', 'female', '1970-06-09'],
].map(([firstName, lastName, gender, dateOfBirth], i) => ({
  email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@demo.hms`,
  firstName,
  lastName,
  role: Role.PATIENT,
  gender,
  dateOfBirth,
  phone: `+1415555${String(1100 + i).padStart(4, '0')}`,
  address: `${100 + i * 7} ${['Oak', 'Pine', 'Cedar', 'Elm', 'Birch'][i % 5]} Street, Springfield`,
}));

// ---------------------------------------------------------------------------
// Date helpers (all relative to "now" so the demo always looks current)
// ---------------------------------------------------------------------------

const NOW = new Date();

/** Local wall-clock time `dayOffset` days from today. */
function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

/** UTC midnight of the local calendar day -- the StaffShift.date convention (see ShiftsService.parseLocalDate). */
function shiftDate(dayOffset: number): Date {
  const d = at(dayOffset, 0);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Day offset of this week's Monday relative to today. */
function mondayOffset(): number {
  const jsDay = NOW.getDay(); // 0 = Sunday
  return jsDay === 0 ? -6 : 1 - jsDay;
}

/** Small deterministic PRNG so repeated seeds produce the same shape of data. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

async function resetDemoData(): Promise<void> {
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
    select: { id: true },
  });
  const demoUserIds = demoUsers.map((u) => u.id);

  const demoCases = await prisma.emergencyCase.findMany({
    where: { patientId: { in: demoUserIds } },
    select: { id: true },
  });

  await prisma.$transaction([
    // Beds are shared structure -- free the ones demo patients occupy instead of deleting them.
    prisma.bed.updateMany({
      where: { patientId: { in: demoUserIds } },
      data: { patientId: null, status: BedStatus.AVAILABLE },
    }),
    // Emergency timelines live in AuditLog, which doesn't cascade from the case.
    prisma.auditLog.deleteMany({
      where: { entityType: 'EmergencyCase', entityId: { in: demoCases.map((c) => c.id) } },
    }),
    prisma.announcement.deleteMany({ where: { authorId: { in: demoUserIds } } }),
    prisma.shiftOpening.deleteMany({ where: { createdById: { in: demoUserIds } } }),
    // Staff.userId is SetNull, not Cascade, so roster rows must go explicitly
    // (their shifts, tasks, attendance and applications cascade from here).
    prisma.staff.deleteMany({
      where: { OR: [{ email: { endsWith: DEMO_EMAIL_DOMAIN } }, { userId: { in: demoUserIds } }] },
    }),
    // Cascades to Doctor, appointments, invoices (+items/payments), medical
    // records (+prescriptions), lab tests, notifications, chat, emergency cases.
    prisma.user.deleteMany({ where: { id: { in: demoUserIds } } }),
  ]);

  console.log(`Reset: removed ${demoUserIds.length} demo user(s) and their data.`);
}

// ---------------------------------------------------------------------------
// Demo logins
// ---------------------------------------------------------------------------

/** Creates or refreshes a user so it can sign in immediately with email +
 *  DEMO_PASSWORD: verified, role fixed, MFA off, no lockout, no forced
 *  password change (every condition AuthService.loginLocal / AuthController.login checks). */
async function upsertLoginUser(db: Tx | PrismaClient, seed: UserSeed, passwordHash: string) {
  const loginState = {
    password: passwordHash,
    role: seed.role,
    roleSelected: true,
    emailVerified: true,
    otpCodeHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodeHashes: [],
  } satisfies Prisma.UserUpdateInput;

  return db.user.upsert({
    where: { email: seed.email },
    update: loginState,
    create: {
      ...loginState,
      email: seed.email,
      firstName: seed.firstName,
      lastName: seed.lastName,
      phone: seed.phone ?? null,
      gender: seed.gender ?? null,
      dateOfBirth: seed.dateOfBirth ? new Date(`${seed.dateOfBirth}T00:00:00.000Z`) : null,
      address: seed.address ?? null,
      emergencyContactName: seed.emergencyContactName ?? null,
      emergencyContactPhone: seed.emergencyContactPhone ?? null,
    },
  });
}

async function upsertDepartments(db: Tx | PrismaClient): Promise<Map<string, string>> {
  const departments = await Promise.all(
    DEPARTMENTS.map((name) => db.department.upsert({ where: { name }, update: {}, create: { name } })),
  );
  return new Map(departments.map((d) => [d.name, d.id]));
}

/** Links the login users to the profile rows their portals require (Doctor
 *  for the doctor portal, Staff for the staff portal). Safe to re-run. */
async function ensureDemoProfiles(
  db: Tx | PrismaClient,
  deptIds: Map<string, string>,
  users: { doctorId: string; staffId: string },
) {
  const doctor = await db.doctor.upsert({
    where: { userId: users.doctorId },
    update: {},
    create: {
      userId: users.doctorId,
      departmentId: deptIds.get(DEMO_DOCTOR.department)!,
      specialization: DEMO_DOCTOR.specialization,
      qualifications: DEMO_DOCTOR.qualifications,
      bio: DEMO_DOCTOR.bio,
      experienceYears: DEMO_DOCTOR.experienceYears,
      rating: DEMO_DOCTOR.rating,
      consultationFee: DEMO_DOCTOR.consultationFee,
      acceptsOnline: DEMO_DOCTOR.acceptsOnline,
    },
  });

  const staff = await db.staff.upsert({
    where: { userId: users.staffId },
    update: { isActive: true },
    create: {
      userId: users.staffId,
      staffType: StaffType.NURSE,
      fullName: `${DEMO_STAFF.firstName} ${DEMO_STAFF.lastName}`,
      email: DEMO_STAFF.email,
      departmentId: deptIds.get('General Medicine')!,
    },
  });

  return { doctor, staff };
}

// ---------------------------------------------------------------------------
// Full sample dataset
// ---------------------------------------------------------------------------

async function seedSampleData(tx: Tx, passwordHash: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const rand = makeRandom(20260101);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];

  const deptIds = await upsertDepartments(tx);

  // Beds: same layout as seed-beds, only for departments that have none yet.
  for (const name of DEPARTMENTS) {
    const departmentId = deptIds.get(name)!;
    if ((await tx.bed.count({ where: { departmentId } })) === 0) {
      await tx.bed.createMany({
        data: Array.from({ length: BEDS_PER_DEPARTMENT }, (_, i) => ({
          label: `${name} - Bed ${i + 1}`,
          departmentId,
          status: BedStatus.AVAILABLE,
        })),
      });
    }
  }

  await tx.platformSettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } });

  // --- Users -----------------------------------------------------------------
  const admin = await upsertLoginUser(tx, DEMO_ADMIN, passwordHash);
  const doctorUser = await upsertLoginUser(tx, DEMO_DOCTOR, passwordHash);
  const patient = await upsertLoginUser(tx, DEMO_PATIENT, passwordHash);
  const staffUser = await upsertLoginUser(tx, DEMO_STAFF, passwordHash);
  const labTechUser = await upsertLoginUser(tx, LAB_TECH, passwordHash);
  const { doctor: demoDoctor, staff: demoStaff } = await ensureDemoProfiles(tx, deptIds, {
    doctorId: doctorUser.id,
    staffId: staffUser.id,
  });

  const otherDoctors: (Doctor & { firstName: string; lastName: string })[] = [];
  for (const seed of EXTRA_DOCTORS) {
    const user = await upsertLoginUser(tx, seed, passwordHash);
    const doctor = await tx.doctor.create({
      data: {
        userId: user.id,
        departmentId: deptIds.get(seed.department)!,
        specialization: seed.specialization,
        qualifications: seed.qualifications,
        bio: seed.bio,
        experienceYears: seed.experienceYears,
        rating: seed.rating,
        consultationFee: seed.consultationFee,
        acceptsOnline: seed.acceptsOnline,
        isAvailable: true,
      },
    });
    otherDoctors.push({ ...doctor, firstName: seed.firstName, lastName: seed.lastName });
  }
  const allDoctors = [
    { ...demoDoctor, firstName: DEMO_DOCTOR.firstName, lastName: DEMO_DOCTOR.lastName },
    ...otherDoctors,
  ];
  const doctorByLastName = new Map(allDoctors.map((d) => [d.lastName, d]));

  const patients: User[] = [];
  for (const seed of EXTRA_PATIENTS) {
    patients.push(await upsertLoginUser(tx, seed, passwordHash));
  }
  counts.users = 5 + EXTRA_DOCTORS.length + patients.length;

  // --- Staff roster ------------------------------------------------------------
  const labTechStaff = await tx.staff.create({
    data: {
      userId: labTechUser.id,
      staffType: StaffType.LAB_TECHNICIAN,
      fullName: `${LAB_TECH.firstName} ${LAB_TECH.lastName}`,
      email: LAB_TECH.email,
      departmentId: deptIds.get('Radiology')!,
    },
  });
  const doctorStaff = await tx.staff.create({
    data: {
      userId: doctorUser.id,
      staffType: StaffType.DOCTOR,
      fullName: `${DEMO_DOCTOR.firstName} ${DEMO_DOCTOR.lastName}`,
      email: null,
      departmentId: deptIds.get('Cardiology')!,
    },
  });
  const rosterOnly = await Promise.all(
    [
      { staffType: StaffType.NURSE, fullName: 'Grace Thompson', email: 'nurse.grace@demo.hms', dept: 'Emergency' },
      { staffType: StaffType.NURSE, fullName: 'Kevin O\'Brien', email: 'nurse.kevin@demo.hms', dept: 'Pediatrics' },
      { staffType: StaffType.RECEPTIONIST, fullName: 'Maria Lopez', email: 'reception.maria@demo.hms', dept: 'General Medicine' },
      { staffType: StaffType.PHARMACIST, fullName: 'Usman Tariq', email: 'pharmacy.usman@demo.hms', dept: 'General Medicine' },
    ].map((s) =>
      tx.staff.create({
        data: { staffType: s.staffType, fullName: s.fullName, email: s.email, departmentId: deptIds.get(s.dept)! },
      }),
    ),
  );
  const [graceStaff, kevinStaff, mariaStaff, usmanStaff] = rosterOnly;
  counts.staff = 3 + rosterOnly.length;

  // --- Appointments ------------------------------------------------------------
  interface ApptSeed {
    patientId: string;
    doctor: (typeof allDoctors)[number];
    scheduledAt: Date;
    mode: AppointmentMode;
    status: AppointmentStatus;
    reason: string;
  }
  const appts: ApptSeed[] = [];
  const addAppt = (
    patientId: string,
    doctor: (typeof allDoctors)[number],
    scheduledAt: Date,
    reason: string,
    opts: { mode?: AppointmentMode; status?: AppointmentStatus } = {},
  ) => {
    const status =
      opts.status ?? (scheduledAt.getTime() < NOW.getTime() ? AppointmentStatus.COMPLETED : AppointmentStatus.SCHEDULED);
    appts.push({
      patientId,
      doctor,
      scheduledAt,
      mode: opts.mode ?? (doctor.acceptsOnline && rand() < 0.4 ? AppointmentMode.ONLINE : AppointmentMode.IN_PERSON),
      status,
      reason,
    });
  };

  // Demo patient's own history and upcoming visits.
  addAppt(patient.id, allDoctors[0], at(-13, 10), 'Chest discomfort during exercise', { mode: AppointmentMode.IN_PERSON });
  addAppt(patient.id, doctorByLastName.get('Carter')!, at(-9, 14, 30), 'Recurring migraines', { mode: AppointmentMode.ONLINE });
  addAppt(patient.id, allDoctors[0], at(-5, 11), 'Follow-up: ECG and lipid panel results', { mode: AppointmentMode.ONLINE });
  addAppt(patient.id, doctorByLastName.get('Malik')!, at(-2, 9, 30), 'Seasonal flu symptoms', { status: AppointmentStatus.CANCELLED });
  addAppt(patient.id, allDoctors[0], at(1, 10, 30), 'Blood pressure review', { mode: AppointmentMode.IN_PERSON });
  addAppt(patient.id, doctorByLastName.get('Qureshi')!, at(4, 15), 'Knee pain after running', { mode: AppointmentMode.IN_PERSON });
  addAppt(patient.id, allDoctors[0], at(11, 12), 'Three-month cardiology follow-up', { mode: AppointmentMode.ONLINE });

  // Demo doctor's wider schedule.
  const cardioReasons = [
    'Palpitations',
    'Hypertension follow-up',
    'Shortness of breath on exertion',
    'Pre-operative cardiac clearance',
    'High cholesterol consultation',
    'Post-angioplasty review',
    'Irregular heartbeat',
    'Annual heart check-up',
  ];
  const demoDoctorSlots: [number, number, number][] = [
    [-14, 9, 0], [-12, 11, 30], [-10, 15, 0], [-8, 10, 0], [-7, 13, 30], [-4, 9, 30], [-3, 16, 0], [-1, 11, 0],
    [0, 9, 0], [0, 14, 0], [0, 17, 30], [2, 10, 0], [3, 11, 30], [5, 9, 30], [7, 14, 0], [8, 10, 30], [10, 15, 30], [13, 9, 0],
  ];
  demoDoctorSlots.forEach(([day, hour, minute], i) => {
    const scheduledAt = at(day, hour, minute);
    const cancelled = i % 6 === 5;
    addAppt(patients[i % patients.length].id, allDoctors[0], scheduledAt, cardioReasons[i % cardioReasons.length], {
      status: cancelled ? AppointmentStatus.CANCELLED : undefined,
    });
  });

  // Everyone else, spread over the past and next two weeks.
  const generalReasons: Record<string, string[]> = {
    Carter: ['Persistent headaches', 'Numbness in hands', 'Dizziness episodes'],
    Qureshi: ['Lower back pain', 'Sprained ankle', 'Shoulder stiffness'],
    Sharma: ['Childhood vaccination', 'Fever and cough', 'Growth check-up'],
    Wilson: ['Acne treatment', 'Skin rash', 'Mole examination'],
    Malik: ['Diabetes follow-up', 'Routine physical', 'Sore throat'],
    Kim: ['Sinus congestion', 'Ear infection', 'Hearing assessment'],
  };
  for (const doctor of otherDoctors) {
    for (let i = 0; i < 4; i++) {
      const day = Math.floor(rand() * 29) - 14;
      const hour = 9 + Math.floor(rand() * 8);
      const status = rand() < 0.15 ? AppointmentStatus.CANCELLED : undefined;
      addAppt(pick(patients).id, doctor, at(day, hour, rand() < 0.5 ? 0 : 30), pick(generalReasons[doctor.lastName]), {
        status,
      });
    }
  }

  const createdAppts = await tx.appointment.createManyAndReturn({
    data: appts.map((a) => ({
      patientId: a.patientId,
      doctorId: a.doctor.id,
      scheduledAt: a.scheduledAt,
      mode: a.mode,
      status: a.status,
      reason: a.reason,
      consultationFee: a.doctor.consultationFee,
      createdAt: new Date(Math.min(a.scheduledAt.getTime(), NOW.getTime()) - 3 * 86_400_000),
    })),
  });
  counts.appointments = createdAppts.length;

  // --- Consultation invoices for every non-cancelled appointment ---------------
  let invoiceCount = 0;
  let paymentCount = 0;
  const doctorById = new Map(allDoctors.map((d) => [d.id, d]));
  for (const appt of createdAppts) {
    if (appt.status === AppointmentStatus.CANCELLED || appt.consultationFee <= 0) continue;
    const doctor = doctorById.get(appt.doctorId)!;
    const isPast = appt.status === AppointmentStatus.COMPLETED;
    const paid = isPast && rand() < 0.8;
    const created = new Date(appt.createdAt);
    await tx.invoice.create({
      data: {
        patientId: appt.patientId,
        appointmentId: appt.id,
        description: `Consultation with Dr. ${doctor.firstName} ${doctor.lastName}`,
        amount: appt.consultationFee,
        status: paid ? InvoiceStatus.PAID : InvoiceStatus.PENDING,
        dueDate: new Date(appt.scheduledAt.getTime() + 7 * 86_400_000),
        paidAt: paid ? appt.scheduledAt : null,
        createdAt: created,
        items: {
          create: [{ description: `Consultation - Dr. ${doctor.firstName} ${doctor.lastName}`, quantity: 1, unitPrice: appt.consultationFee }],
        },
        payments: paid
          ? {
              create: [
                {
                  amount: appt.consultationFee,
                  method: rand() < 0.5 ? PaymentMethod.CARD : PaymentMethod.CASH,
                  recordedById: admin.id,
                  createdAt: appt.scheduledAt,
                },
              ],
            }
          : undefined,
      },
    });
    invoiceCount++;
    if (paid) paymentCount++;
  }

  // --- Standalone invoices (mixed statuses) -------------------------------------
  interface ItemSeed {
    description: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
  }
  const createInvoice = async (params: {
    patientId: string;
    description: string;
    items: ItemSeed[];
    discount?: number;
    tax?: number;
    createdDaysAgo: number;
    dueInDays: number;
    status: InvoiceStatus;
    payments?: { fraction: number; method: PaymentMethod; daysAgo: number }[];
  }) => {
    const subtotal = round2(params.items.reduce((s, it) => s + it.quantity * it.unitPrice - (it.discount ?? 0), 0));
    const discount = params.discount ?? 0;
    const tax = params.tax ?? 0;
    const total = round2(subtotal - discount + tax);
    const payments = (params.payments ?? []).map((p) => ({
      amount: round2(total * p.fraction),
      method: p.method,
      recordedById: admin.id,
      createdAt: at(-p.daysAgo, 12),
    }));
    await tx.invoice.create({
      data: {
        patientId: params.patientId,
        description: params.description,
        amount: subtotal,
        discount,
        tax,
        status: params.status,
        createdAt: at(-params.createdDaysAgo, 10),
        dueDate: at(params.dueInDays, 23, 59),
        paidAt: params.status === InvoiceStatus.PAID ? payments[payments.length - 1]?.createdAt ?? null : null,
        items: { create: params.items.map((it) => ({ ...it, discount: it.discount ?? 0 })) },
        payments: payments.length ? { create: payments } : undefined,
      },
    });
    invoiceCount++;
    paymentCount += payments.length;
  };

  await createInvoice({
    patientId: patient.id,
    description: 'Cardiac diagnostics',
    items: [
      { description: 'Electrocardiogram (ECG)', quantity: 1, unitPrice: 85 },
      { description: 'Lipid profile', quantity: 1, unitPrice: 45 },
      { description: 'Complete blood count', quantity: 1, unitPrice: 30 },
    ],
    tax: 8,
    createdDaysAgo: 12,
    dueInDays: 2,
    status: InvoiceStatus.PARTIALLY_PAID,
    payments: [{ fraction: 0.5, method: PaymentMethod.CARD, daysAgo: 10 }],
  });
  await createInvoice({
    patientId: patient.id,
    description: 'Pharmacy - prescribed medication',
    items: [
      { description: 'Atorvastatin 20mg (30 tablets)', quantity: 1, unitPrice: 24 },
      { description: 'Amlodipine 5mg (30 tablets)', quantity: 1, unitPrice: 18 },
    ],
    createdDaysAgo: 5,
    dueInDays: 9,
    status: InvoiceStatus.PENDING,
  });
  await createInvoice({
    patientId: patient.id,
    description: 'Chest X-ray',
    items: [{ description: 'Chest X-ray (PA view)', quantity: 1, unitPrice: 60 }],
    createdDaysAgo: 20,
    dueInDays: -6,
    status: InvoiceStatus.PENDING, // past due -> shows as overdue
  });
  await createInvoice({
    patientId: patient.id,
    description: 'Annual health package',
    items: [
      { description: 'General health screening', quantity: 1, unitPrice: 150, discount: 15 },
      { description: 'Vitamin D test', quantity: 1, unitPrice: 35 },
    ],
    discount: 10,
    createdDaysAgo: 40,
    dueInDays: -26,
    status: InvoiceStatus.PAID,
    payments: [{ fraction: 1, method: PaymentMethod.BANK_TRANSFER, daysAgo: 30 }],
  });

  const inpatientDescriptions: [string, ItemSeed[]][] = [
    ['Inpatient stay - General Medicine', [{ description: 'Ward bed (per night)', quantity: 3, unitPrice: 180 }, { description: 'Nursing care', quantity: 3, unitPrice: 40 }]],
    ['Orthopedic procedure', [{ description: 'Fracture reduction & casting', quantity: 1, unitPrice: 650 }, { description: 'X-ray (2 views)', quantity: 1, unitPrice: 70 }]],
    ['Laboratory panel', [{ description: 'HbA1c', quantity: 1, unitPrice: 40 }, { description: 'Kidney function test', quantity: 1, unitPrice: 55 }]],
    ['Dermatology procedure', [{ description: 'Cryotherapy session', quantity: 2, unitPrice: 95 }]],
    ['Emergency department visit', [{ description: 'Emergency assessment', quantity: 1, unitPrice: 250 }, { description: 'IV fluids', quantity: 2, unitPrice: 35 }]],
    ['MRI brain', [{ description: 'MRI brain without contrast', quantity: 1, unitPrice: 900, discount: 100 }]],
  ];
  const statusPlan: { status: InvoiceStatus; payments?: { fraction: number; method: PaymentMethod; daysAgo: number }[]; dueInDays: number }[] = [
    { status: InvoiceStatus.PAID, payments: [{ fraction: 1, method: PaymentMethod.CARD, daysAgo: 3 }], dueInDays: 4 },
    { status: InvoiceStatus.PARTIALLY_PAID, payments: [{ fraction: 0.4, method: PaymentMethod.CASH, daysAgo: 6 }], dueInDays: 8 },
    { status: InvoiceStatus.PENDING, dueInDays: 12 },
    { status: InvoiceStatus.PENDING, dueInDays: -4 },
    { status: InvoiceStatus.CANCELLED, dueInDays: 5 },
    { status: InvoiceStatus.PAID, payments: [{ fraction: 0.5, method: PaymentMethod.CARD, daysAgo: 9 }, { fraction: 0.5, method: PaymentMethod.BANK_TRANSFER, daysAgo: 2 }], dueInDays: 1 },
  ];
  for (let i = 0; i < inpatientDescriptions.length; i++) {
    const [description, items] = inpatientDescriptions[i];
    const plan = statusPlan[i];
    await createInvoice({
      patientId: patients[(i * 2 + 1) % patients.length].id,
      description,
      items,
      tax: i % 2 === 0 ? 10 : 0,
      createdDaysAgo: 7 + i * 2,
      dueInDays: plan.dueInDays,
      status: plan.status,
      payments: plan.payments,
    });
  }
  counts.invoices = invoiceCount;
  counts.payments = paymentCount;

  // --- Medical records + prescriptions -----------------------------------------
  const demoPatientAppts = createdAppts.filter(
    (a) => a.patientId === patient.id && a.status === AppointmentStatus.COMPLETED,
  );
  const recordSeeds: {
    appt?: (typeof createdAppts)[number];
    patientId: string;
    doctorId: string;
    diagnosis: string;
    notes: string;
    daysAgo: number;
    prescriptions: { medicationName: string; dosage: string; frequency: string; durationDays: number; instructions?: string }[];
  }[] = [];
  const demoWithDemoDoctor = demoPatientAppts.filter((a) => a.doctorId === demoDoctor.id);
  const demoWithCarter = demoPatientAppts.find((a) => a.doctorId === doctorByLastName.get('Carter')!.id);
  if (demoWithDemoDoctor[0]) {
    recordSeeds.push({
      appt: demoWithDemoDoctor[0],
      patientId: patient.id,
      doctorId: demoDoctor.id,
      diagnosis: 'Stage 1 hypertension with exertional chest discomfort',
      notes: 'BP 142/91. Resting ECG shows normal sinus rhythm. Ordered lipid profile and CBC. Advised low-sodium diet and 30 min brisk walking daily.',
      daysAgo: 13,
      prescriptions: [
        { medicationName: 'Amlodipine', dosage: '5 mg', frequency: 'Once daily', durationDays: 30, instructions: 'Take in the morning.' },
        { medicationName: 'Aspirin', dosage: '75 mg', frequency: 'Once daily', durationDays: 30, instructions: 'Take after food.' },
      ],
    });
  }
  if (demoWithCarter) {
    recordSeeds.push({
      appt: demoWithCarter,
      patientId: patient.id,
      doctorId: demoWithCarter.doctorId,
      diagnosis: 'Migraine without aura',
      notes: 'Episodic headaches 2-3x/month, triggered by poor sleep. Neurological exam normal. Headache diary recommended.',
      daysAgo: 9,
      prescriptions: [
        { medicationName: 'Sumatriptan', dosage: '50 mg', frequency: 'At onset of migraine, max 2 per day', durationDays: 30 },
      ],
    });
  }
  if (demoWithDemoDoctor[1]) {
    recordSeeds.push({
      appt: demoWithDemoDoctor[1],
      patientId: patient.id,
      doctorId: demoDoctor.id,
      diagnosis: 'Hyperlipidemia; hypertension improving',
      notes: 'LDL 162 mg/dL. BP 132/84 on amlodipine. Start statin, recheck lipids in 3 months.',
      daysAgo: 5,
      prescriptions: [
        { medicationName: 'Atorvastatin', dosage: '20 mg', frequency: 'Once daily at night', durationDays: 90 },
        { medicationName: 'Amlodipine', dosage: '5 mg', frequency: 'Once daily', durationDays: 90, instructions: 'Continue current dose.' },
      ],
    });
  }
  // A few records the demo doctor wrote for other patients.
  const demoDoctorPastAppts = createdAppts.filter(
    (a) => a.doctorId === demoDoctor.id && a.patientId !== patient.id && a.status === AppointmentStatus.COMPLETED,
  );
  const otherDiagnoses = [
    ['Paroxysmal atrial fibrillation', 'Holter monitor ordered. Discussed anticoagulation risks/benefits.', 'Apixaban', '5 mg', 'Twice daily'],
    ['Essential hypertension', 'BP well controlled. Continue current regimen.', 'Losartan', '50 mg', 'Once daily'],
    ['Stable angina', 'Symptoms on climbing stairs. Stress test scheduled.', 'Nitroglycerin SL', '0.4 mg', 'As needed for chest pain'],
    ['Mixed hyperlipidemia', 'Diet counselling given. Recheck in 12 weeks.', 'Rosuvastatin', '10 mg', 'Once daily'],
  ] as const;
  demoDoctorPastAppts.slice(0, otherDiagnoses.length).forEach((appt, i) => {
    const [diagnosis, notes, medicationName, dosage, frequency] = otherDiagnoses[i];
    recordSeeds.push({
      appt,
      patientId: appt.patientId,
      doctorId: demoDoctor.id,
      diagnosis,
      notes,
      daysAgo: Math.max(0, Math.round((NOW.getTime() - appt.scheduledAt.getTime()) / 86_400_000)),
      prescriptions: [{ medicationName, dosage, frequency, durationDays: 30 }],
    });
  });
  for (const r of recordSeeds) {
    const createdAt = r.appt ? new Date(r.appt.scheduledAt.getTime() + 30 * 60_000) : at(-r.daysAgo, 12);
    await tx.medicalRecord.create({
      data: {
        patientId: r.patientId,
        doctorId: r.doctorId,
        appointmentId: r.appt?.id ?? null,
        diagnosis: r.diagnosis,
        notes: r.notes,
        createdAt,
        prescriptions: { create: r.prescriptions.map((p) => ({ ...p, createdAt })) },
      },
    });
  }
  counts.medicalRecords = recordSeeds.length;
  counts.prescriptions = recordSeeds.reduce((s, r) => s + r.prescriptions.length, 0);

  // --- Lab tests ---------------------------------------------------------------
  const labTests: Prisma.LabTestCreateManyInput[] = [
    {
      patientId: patient.id,
      doctorId: demoDoctor.id,
      assignedToId: labTechUser.id,
      testName: 'Complete Blood Count (CBC)',
      category: LabTestCategory.HEMATOLOGY,
      status: LabTestStatus.COMPLETED,
      resultSummary: 'Hb 14.2 g/dL, WBC 7.1 x10^9/L, platelets 245 x10^9/L - all within normal limits.',
      requestedAt: at(-13, 10, 40),
      completedAt: at(-12, 9),
    },
    {
      patientId: patient.id,
      doctorId: demoDoctor.id,
      assignedToId: labTechUser.id,
      testName: 'Lipid Profile',
      category: LabTestCategory.BIOCHEMISTRY,
      status: LabTestStatus.COMPLETED,
      resultSummary: 'Total cholesterol 238 mg/dL, LDL 162 mg/dL (high), HDL 41 mg/dL, triglycerides 175 mg/dL.',
      requestedAt: at(-13, 10, 45),
      completedAt: at(-11, 15),
    },
    {
      patientId: patient.id,
      doctorId: demoDoctor.id,
      assignedToId: labTechUser.id,
      testName: 'Chest X-ray (PA view)',
      category: LabTestCategory.RADIOLOGY,
      status: LabTestStatus.IN_PROGRESS,
      requestedAt: at(-1, 11, 30),
    },
    {
      patientId: patient.id,
      doctorId: demoDoctor.id,
      testName: 'HbA1c',
      category: LabTestCategory.BIOCHEMISTRY,
      status: LabTestStatus.PENDING,
      requestedAt: minutesAgo(180),
    },
    {
      patientId: patients[0].id,
      doctorId: demoDoctor.id,
      assignedToId: labTechUser.id,
      testName: 'Troponin I',
      category: LabTestCategory.BIOCHEMISTRY,
      status: LabTestStatus.COMPLETED,
      resultSummary: 'Troponin I < 0.01 ng/mL - negative.',
      requestedAt: at(-7, 14),
      completedAt: at(-7, 17),
    },
    {
      patientId: patients[3].id,
      doctorId: demoDoctor.id,
      testName: 'Echocardiogram',
      category: LabTestCategory.RADIOLOGY,
      status: LabTestStatus.PENDING,
      requestedAt: at(-1, 9),
    },
    {
      patientId: patients[5].id,
      doctorId: doctorByLastName.get('Malik')!.id,
      assignedToId: labTechUser.id,
      testName: 'Urine culture',
      category: LabTestCategory.MICROBIOLOGY,
      status: LabTestStatus.IN_PROGRESS,
      requestedAt: at(-2, 10),
    },
    {
      patientId: patients[8].id,
      doctorId: doctorByLastName.get('Wilson')!.id,
      assignedToId: labTechUser.id,
      testName: 'Skin biopsy histopathology',
      category: LabTestCategory.PATHOLOGY,
      status: LabTestStatus.COMPLETED,
      resultSummary: 'Benign intradermal nevus. No atypia.',
      requestedAt: at(-10, 11),
      completedAt: at(-6, 16),
    },
  ];
  await tx.labTest.createMany({ data: labTests });
  counts.labTests = labTests.length;

  // --- Beds: admit some sample patients -----------------------------------------
  const admissions: [string, number][] = [
    ['Cardiology', 3],
    ['General Medicine', 5],
    ['Orthopedics', 1],
    ['Neurology', 11],
    ['Pediatrics', 7],
    ['Emergency', 9],
    ['General Medicine', 13],
  ];
  let occupied = 0;
  for (const [deptName, patientIndex] of admissions) {
    const bed = await tx.bed.findFirst({
      where: { departmentId: deptIds.get(deptName)!, status: BedStatus.AVAILABLE, patientId: null },
      orderBy: { label: 'asc' },
    });
    if (!bed) continue;
    await tx.bed.update({
      where: { id: bed.id },
      data: { status: BedStatus.OCCUPIED, patientId: patients[patientIndex].id },
    });
    occupied++;
  }
  counts.bedsOccupied = occupied;

  // --- Shifts this week (and early next week) ----------------------------------
  const monday = mondayOffset();
  const shiftDefs: Record<'MORNING' | 'EVENING' | 'NIGHT', [number, number]> = {
    MORNING: [7, 15],
    EVENING: [15, 23],
    NIGHT: [23, 7],
  };
  const shiftsToCreate: { staffId: string; dept: string; day: number; type: 'MORNING' | 'EVENING' | 'NIGHT'; absent?: boolean; late?: boolean }[] = [];
  for (let d = 0; d < 5; d++) shiftsToCreate.push({ staffId: demoStaff.id, dept: 'General Medicine', day: monday + d, type: 'MORNING', late: d === 1 });
  for (let d = 7; d < 10; d++) shiftsToCreate.push({ staffId: demoStaff.id, dept: 'General Medicine', day: monday + d, type: 'MORNING' });
  for (let d = 0; d < 6; d++) shiftsToCreate.push({ staffId: graceStaff.id, dept: 'Emergency', day: monday + d, type: d < 3 ? 'EVENING' : 'NIGHT' });
  for (let d = 1; d < 6; d++) shiftsToCreate.push({ staffId: kevinStaff.id, dept: 'Pediatrics', day: monday + d, type: 'MORNING', absent: d === 2 });
  for (let d = 0; d < 5; d++) shiftsToCreate.push({ staffId: mariaStaff.id, dept: 'General Medicine', day: monday + d, type: 'MORNING' });
  for (let d = 0; d < 5; d++) shiftsToCreate.push({ staffId: usmanStaff.id, dept: 'General Medicine', day: monday + d, type: 'EVENING' });
  for (let d = 0; d < 5; d++) shiftsToCreate.push({ staffId: labTechStaff.id, dept: 'Radiology', day: monday + d, type: 'MORNING' });
  for (const d of [0, 2, 4]) shiftsToCreate.push({ staffId: doctorStaff.id, dept: 'Cardiology', day: monday + d, type: 'MORNING' });

  let shiftCount = 0;
  let attendanceCount = 0;
  for (const s of shiftsToCreate) {
    const [startHour, endHour] = shiftDefs[s.type];
    const startTime = at(s.day, startHour);
    const endTime = endHour > startHour ? at(s.day, endHour) : at(s.day + 1, endHour);
    let status: ShiftStatus;
    if (endTime.getTime() <= NOW.getTime()) status = s.absent ? ShiftStatus.ABSENT : ShiftStatus.COMPLETED;
    else if (startTime.getTime() <= NOW.getTime()) status = ShiftStatus.IN_PROGRESS;
    else status = s.day - monday < 7 ? ShiftStatus.CONFIRMED : ShiftStatus.SCHEDULED;

    const shift = await tx.staffShift.create({
      data: {
        staffId: s.staffId,
        departmentId: deptIds.get(s.dept)!,
        date: shiftDate(s.day),
        startTime,
        endTime,
        shiftType: ShiftType[s.type],
        status,
        createdById: admin.id,
        createdAt: at(monday - 3, 16),
      },
    });
    shiftCount++;

    if (status === ShiftStatus.COMPLETED || status === ShiftStatus.IN_PROGRESS || status === ShiftStatus.ABSENT) {
      const lateBy = s.late ? 18 : 0;
      await tx.attendance.create({
        data: {
          shiftId: shift.id,
          staffId: s.staffId,
          status:
            status === ShiftStatus.ABSENT
              ? AttendanceStatus.ABSENT
              : s.late
                ? AttendanceStatus.LATE
                : AttendanceStatus.PRESENT,
          checkIn: status === ShiftStatus.ABSENT ? null : new Date(startTime.getTime() + lateBy * 60_000),
          checkOut: status === ShiftStatus.COMPLETED ? endTime : null,
          notes: s.late ? 'Traffic delay' : null,
        },
      });
      attendanceCount++;
    }
  }
  counts.shifts = shiftCount;
  counts.attendance = attendanceCount;

  // --- Shift openings + an application -------------------------------------------
  const nightOpening = await tx.shiftOpening.create({
    data: {
      requiredStaffType: StaffType.NURSE,
      departmentId: deptIds.get('Emergency')!,
      date: shiftDate(monday + 12),
      startTime: at(monday + 12, 23),
      endTime: at(monday + 13, 7),
      shiftType: ShiftType.NIGHT,
      positions: 2,
      applicationDeadline: at(monday + 10, 18),
      notes: 'Extra night cover for the Emergency department.',
      createdById: admin.id,
    },
  });
  await tx.shiftOpening.create({
    data: {
      requiredStaffType: StaffType.NURSE,
      departmentId: deptIds.get('Pediatrics')!,
      date: shiftDate(monday + 13),
      startTime: at(monday + 13, 7),
      endTime: at(monday + 13, 15),
      shiftType: ShiftType.MORNING,
      positions: 1,
      applicationDeadline: at(monday + 11, 18),
      notes: 'Weekend morning cover - pediatric ward.',
      createdById: admin.id,
    },
  });
  await tx.shiftOpening.create({
    data: {
      requiredStaffType: StaffType.LAB_TECHNICIAN,
      departmentId: deptIds.get('Radiology')!,
      date: shiftDate(monday + 12),
      startTime: at(monday + 12, 15),
      endTime: at(monday + 12, 23),
      shiftType: ShiftType.EVENING,
      positions: 1,
      applicationDeadline: at(monday + 10, 18),
      createdById: admin.id,
    },
  });
  await tx.shiftApplication.create({
    data: {
      openingId: nightOpening.id,
      staffId: demoStaff.id,
      status: ApplicationStatus.PENDING,
      message: 'Happy to cover - I have ER experience.',
    },
  });
  counts.shiftOpenings = 3;

  // --- Tasks -------------------------------------------------------------------
  const tasks: Prisma.TaskCreateManyInput[] = [
    { title: 'Record vitals for ward patients', description: 'Morning round: BP, pulse, temperature and SpO2 for beds 1-5.', dueAt: at(0, 11), priority: TaskPriority.HIGH, status: TaskStatus.IN_PROGRESS, assignedToId: demoStaff.id },
    { title: 'Administer evening medications', description: 'Follow the MAR for General Medicine ward.', dueAt: at(0, 18), priority: TaskPriority.URGENT, status: TaskStatus.PENDING, assignedToId: demoStaff.id },
    { title: 'Restock dressing supplies', description: 'Gauze, saline and tape running low in treatment room 2.', dueAt: at(-1, 16), priority: TaskPriority.MEDIUM, status: TaskStatus.PENDING, assignedToId: demoStaff.id },
    { title: 'Complete patient discharge checklist', description: 'Discharge paperwork for the patient in General Medicine - Bed 1.', dueAt: at(2, 12), priority: TaskPriority.MEDIUM, status: TaskStatus.PENDING, assignedToId: demoStaff.id },
    { title: 'Infection-control training module', dueAt: at(-3, 17), priority: TaskPriority.LOW, status: TaskStatus.COMPLETED, completedAt: at(-4, 15), assignedToId: demoStaff.id },
    { title: 'Check crash cart', description: 'Verify defibrillator charge and drug expiry dates.', dueAt: at(1, 20), priority: TaskPriority.HIGH, status: TaskStatus.PENDING, assignedToId: graceStaff.id },
    { title: 'Process pending chest X-ray', dueAt: at(0, 15), priority: TaskPriority.HIGH, status: TaskStatus.IN_PROGRESS, assignedToId: labTechStaff.id },
    { title: 'Calibrate hematology analyzer', dueAt: at(3, 10), priority: TaskPriority.MEDIUM, status: TaskStatus.PENDING, assignedToId: labTechStaff.id },
    { title: 'Confirm tomorrow\'s appointments', description: 'Call patients booked for tomorrow morning.', dueAt: at(0, 17), priority: TaskPriority.MEDIUM, status: TaskStatus.PENDING, assignedToId: mariaStaff.id },
    { title: 'Monthly controlled-drug audit', dueAt: at(-2, 12), priority: TaskPriority.HIGH, status: TaskStatus.COMPLETED, completedAt: at(-2, 11), assignedToId: usmanStaff.id },
  ];
  const staffDept = new Map<string, string>([
    [demoStaff.id, 'General Medicine'],
    [graceStaff.id, 'Emergency'],
    [labTechStaff.id, 'Radiology'],
    [mariaStaff.id, 'General Medicine'],
    [usmanStaff.id, 'General Medicine'],
  ]);
  await tx.task.createMany({
    data: tasks.map((t) => ({
      ...t,
      assignedById: admin.id,
      departmentId: deptIds.get(staffDept.get(t.assignedToId)!)!,
      createdAt: new Date(Math.min(new Date(t.dueAt).getTime(), NOW.getTime()) - 2 * 86_400_000),
    })),
  });
  counts.tasks = tasks.length;

  // --- Announcements -----------------------------------------------------------
  const announcements: Prisma.AnnouncementCreateManyInput[] = [
    { title: 'Fire drill on Thursday at 10:00', description: 'All departments will take part in a scheduled fire drill. Please review evacuation routes posted near each nurse station.', priority: AnnouncementPriority.IMPORTANT, createdAt: at(-1, 9) },
    { title: 'New EHR features are live', description: 'Doctors can now attach prescriptions directly to medical records, and patients see lab results as soon as they are completed.', priority: AnnouncementPriority.NORMAL, createdAt: at(-4, 14) },
    { title: 'Flu vaccination drive for staff', description: 'Free flu shots for all staff members in the Pediatrics clinic, Monday to Wednesday, 12:00-14:00.', priority: AnnouncementPriority.NORMAL, createdAt: at(-7, 11) },
    { title: 'Emergency department at high capacity', description: 'ER is operating near full capacity tonight. Non-urgent admissions should be routed through General Medicine.', priority: AnnouncementPriority.URGENT, createdAt: minutesAgo(90) },
  ];
  await tx.announcement.createMany({ data: announcements.map((a) => ({ ...a, authorId: admin.id })) });
  counts.announcements = announcements.length;

  // --- Chat between demo patient and demo doctor ---------------------------------
  const chat: Prisma.ChatMessageCreateManyInput[] = [
    { patientId: patient.id, doctorId: demoDoctor.id, sender: ChatSender.PATIENT, body: 'Hi Dr. Siddiqui, I started the atorvastatin. Is mild muscle soreness normal?', createdAt: at(-3, 19, 5) },
    { patientId: patient.id, doctorId: demoDoctor.id, sender: ChatSender.DOCTOR, body: 'Mild soreness can happen in the first weeks. If it becomes severe or you notice dark urine, stop it and let me know right away.', createdAt: at(-3, 20, 12) },
    { patientId: patient.id, doctorId: demoDoctor.id, sender: ChatSender.PATIENT, body: 'Thanks! It is mild. See you at the blood pressure review.', createdAt: at(-3, 20, 30) },
    { patientId: patient.id, doctorId: demoDoctor.id, sender: ChatSender.DOCTOR, body: 'Great. Please bring your home BP readings from this week.', createdAt: at(-2, 8, 45) },
  ];
  await tx.chatMessage.createMany({ data: chat });
  counts.chatMessages = chat.length;

  // --- Emergency cases (+ AuditLog timeline rows, + notes) ---------------------------
  let caseCount = 0;
  const logTimeline = async (caseId: string, events: { actorId: string; action: AuditAction; transition?: string; at: Date; extra?: Record<string, unknown> }[]) => {
    await tx.auditLog.createMany({
      data: events.map((e) => ({
        actorId: e.actorId,
        action: e.action,
        entityType: 'EmergencyCase',
        entityId: caseId,
        metadata: e.transition ? { transition: e.transition, ...(e.extra ?? {}) } : undefined,
        createdAt: e.at,
      })),
    });
  };

  // NEW + CRITICAL (just came in)
  {
    const p = patients[1];
    const created = minutesAgo(6);
    const c = await tx.emergencyCase.create({
      data: { patientId: p.id, emergencyType: EmergencyType.CHEST_RELATED, priority: EmergencyPriority.CRITICAL, status: EmergencyStatus.NEW, description: 'Severe chest pain spreading to my left arm.', createdAt: created },
    });
    await logTimeline(c.id, [{ actorId: p.id, action: AuditAction.CREATE, at: created }]);
    caseCount++;
  }
  // ACKNOWLEDGED + HIGH
  {
    const p = patients[5];
    const created = minutesAgo(25);
    const acked = minutesAgo(21);
    const c = await tx.emergencyCase.create({
      data: { patientId: p.id, emergencyType: EmergencyType.BREATHING_DIFFICULTY, priority: EmergencyPriority.HIGH, status: EmergencyStatus.ACKNOWLEDGED, description: 'Wheezing and short of breath, inhaler not helping.', acknowledgedById: admin.id, acknowledgedAt: acked, createdAt: created },
    });
    await logTimeline(c.id, [
      { actorId: p.id, action: AuditAction.CREATE, at: created },
      { actorId: admin.id, action: AuditAction.UPDATE, transition: 'acknowledged', at: acked },
    ]);
    caseCount++;
  }
  // RESPONDING (team assigned: demo doctor + demo nurse)
  {
    const p = patients[11];
    const created = minutesAgo(55);
    const acked = minutesAgo(52);
    const assigned = minutesAgo(48);
    const responding = minutesAgo(45);
    const c = await tx.emergencyCase.create({
      data: {
        patientId: p.id,
        emergencyType: EmergencyType.ACCIDENT_INJURY,
        priority: EmergencyPriority.HIGH,
        status: EmergencyStatus.RESPONDING,
        description: 'Fell down the stairs, possible wrist fracture.',
        acknowledgedById: admin.id,
        acknowledgedAt: acked,
        assignedDoctorId: demoDoctor.id,
        assignedStaffId: demoStaff.id,
        assignedTeamName: 'Rapid Response Team A',
        assignedById: admin.id,
        assignedAt: assigned,
        respondingAt: responding,
        createdAt: created,
      },
    });
    await logTimeline(c.id, [
      { actorId: p.id, action: AuditAction.CREATE, at: created },
      { actorId: admin.id, action: AuditAction.UPDATE, transition: 'acknowledged', at: acked },
      { actorId: admin.id, action: AuditAction.UPDATE, transition: 'team_assigned', at: assigned, extra: { doctorId: demoDoctor.id, staffId: demoStaff.id, teamName: 'Rapid Response Team A' } },
      { actorId: staffUser.id, action: AuditAction.UPDATE, transition: 'responding', at: responding },
      { actorId: staffUser.id, action: AuditAction.UPDATE, transition: 'note', at: minutesAgo(40) },
    ]);
    await tx.emergencyNote.create({
      data: { caseId: c.id, authorId: staffUser.id, body: 'Patient conscious and alert. Wrist splinted, ice applied. Preparing for X-ray.', createdAt: minutesAgo(40) },
    });
    caseCount++;
  }
  // RESOLVED (yesterday)
  {
    const p = patients[2];
    const created = at(-1, 21, 10);
    const c = await tx.emergencyCase.create({
      data: {
        patientId: p.id,
        emergencyType: EmergencyType.SEVERE_BLEEDING,
        priority: EmergencyPriority.CRITICAL,
        status: EmergencyStatus.RESOLVED,
        description: 'Deep cut on hand from kitchen knife.',
        acknowledgedById: admin.id,
        acknowledgedAt: at(-1, 21, 12),
        assignedDoctorId: doctorByLastName.get('Malik')!.id,
        assignedStaffId: graceStaff.id,
        assignedTeamName: 'ER Night Team',
        assignedById: admin.id,
        assignedAt: at(-1, 21, 14),
        respondingAt: at(-1, 21, 15),
        arrivedAt: at(-1, 21, 24),
        resolvedById: admin.id,
        resolvedAt: at(-1, 22, 30),
        createdAt: created,
      },
    });
    await logTimeline(c.id, [
      { actorId: p.id, action: AuditAction.CREATE, at: created },
      { actorId: admin.id, action: AuditAction.UPDATE, transition: 'acknowledged', at: at(-1, 21, 12) },
      { actorId: admin.id, action: AuditAction.UPDATE, transition: 'team_assigned', at: at(-1, 21, 14), extra: { doctorId: doctorByLastName.get('Malik')!.id, staffId: graceStaff.id, teamName: 'ER Night Team' } },
      { actorId: admin.id, action: AuditAction.UPDATE, transition: 'responding', at: at(-1, 21, 15) },
      { actorId: admin.id, action: AuditAction.UPDATE, transition: 'arrived', at: at(-1, 21, 24) },
      { actorId: admin.id, action: AuditAction.UPDATE, transition: 'resolved', at: at(-1, 22, 30) },
    ]);
    await tx.emergencyNote.create({
      data: { caseId: c.id, authorId: doctorByLastName.get('Malik')!.userId, body: 'Laceration sutured (6 stitches). Tetanus booster given. Discharged with wound-care advice.', createdAt: at(-1, 22, 25) },
    });
    caseCount++;
  }
  // CANCELLED (demo patient, last week)
  {
    const created = at(-6, 18, 40);
    const c = await tx.emergencyCase.create({
      data: {
        patientId: patient.id,
        emergencyType: EmergencyType.MEDICAL,
        priority: EmergencyPriority.NORMAL,
        status: EmergencyStatus.CANCELLED,
        description: 'Sudden dizziness and racing heartbeat.',
        cancelledAt: at(-6, 18, 52),
        cancelReason: 'Symptoms settled after resting; will discuss at my next appointment.',
        createdAt: created,
      },
    });
    await logTimeline(c.id, [
      { actorId: patient.id, action: AuditAction.CREATE, at: created },
      { actorId: patient.id, action: AuditAction.UPDATE, transition: 'cancelled', at: at(-6, 18, 52), extra: { reason: 'Symptoms settled after resting' } },
    ]);
    caseCount++;
  }
  counts.emergencyCases = caseCount;

  // --- Notifications for the demo logins -----------------------------------------
  const nextDemoAppt = createdAppts
    .filter((a) => a.patientId === patient.id && a.status === AppointmentStatus.SCHEDULED)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];
  const notifications: Prisma.NotificationCreateManyInput[] = [
    // Patient
    { userId: patient.id, type: NotificationType.APPOINTMENT_REMINDER, title: 'Upcoming appointment', body: 'Reminder: blood pressure review with Dr. Omar Siddiqui tomorrow.', link: nextDemoAppt ? `/my-appointments?appointmentId=${nextDemoAppt.id}` : '/my-appointments', createdAt: minutesAgo(45) },
    { userId: patient.id, type: NotificationType.LAB_RESULT_READY, title: 'Lab result ready', body: 'Your Lipid Profile result is now available.', link: '/laboratory', createdAt: at(-11, 15, 5) },
    { userId: patient.id, type: NotificationType.MEDICAL_RECORD_ADDED, title: 'New medical record', body: 'Dr. Omar Siddiqui added a record from your follow-up visit.', link: '/medical-records', createdAt: at(-5, 11, 40), isRead: true },
    { userId: patient.id, type: NotificationType.INVOICE_CREATED, title: 'New invoice', body: 'You have a new invoice for Pharmacy - prescribed medication.', link: '/billing', createdAt: at(-5, 10), isRead: true },
    { userId: patient.id, type: NotificationType.CHAT_MESSAGE, title: 'New message from Dr. Omar Siddiqui', body: 'Please bring your home BP readings from this week.', link: `/messages?doctorId=${demoDoctor.id}`, createdAt: at(-2, 8, 45) },
    // Doctor
    { userId: doctorUser.id, type: NotificationType.APPOINTMENT_BOOKED, title: 'New appointment booked', body: 'Ali Hassan booked a three-month cardiology follow-up.', link: '/appointments', createdAt: minutesAgo(120) },
    { userId: doctorUser.id, type: NotificationType.EMERGENCY_TEAM_ASSIGNED, title: 'Assigned to an emergency', body: 'You were assigned to Rapid Response Team A.', link: '/emergency', createdAt: minutesAgo(48) },
    { userId: doctorUser.id, type: NotificationType.CHAT_MESSAGE, title: 'New message from Ali Hassan', body: 'Thanks! It is mild. See you at the blood pressure review.', link: `/messages?patientId=${patient.id}`, createdAt: at(-3, 20, 30), isRead: true },
    { userId: doctorUser.id, type: NotificationType.ANNOUNCEMENT_PUBLISHED, title: 'New announcement', body: 'Emergency department at high capacity', link: '/announcements', createdAt: minutesAgo(90) },
    // Staff
    { userId: staffUser.id, type: NotificationType.TASK_ASSIGNED, title: 'New task assigned', body: 'Administer evening medications (urgent).', link: '/my-tasks', createdAt: minutesAgo(200) },
    { userId: staffUser.id, type: NotificationType.TASK_OVERDUE, title: 'Task overdue', body: 'Restock dressing supplies is overdue.', link: '/my-tasks', createdAt: at(0, 8) },
    { userId: staffUser.id, type: NotificationType.SHIFT_SCHEDULED, title: 'Shifts scheduled', body: 'You have been scheduled for morning shifts this week and next.', link: '/my-shifts', createdAt: at(monday - 3, 16), isRead: true },
    { userId: staffUser.id, type: NotificationType.EMERGENCY_TEAM_ASSIGNED, title: 'Assigned to an emergency', body: 'You were assigned to Rapid Response Team A.', link: '/emergency', createdAt: minutesAgo(48) },
    // Admin
    { userId: admin.id, type: NotificationType.EMERGENCY_CREATED, title: 'New emergency request', body: 'Critical chest-related emergency from Michael Brown.', link: '/emergency', createdAt: minutesAgo(6) },
    { userId: admin.id, type: NotificationType.PAYMENT_RECEIVED, title: 'Payment received', body: 'A card payment was received for an orthopedic procedure invoice.', link: '/billing', createdAt: at(-3, 12), isRead: true },
    { userId: admin.id, type: NotificationType.INVOICE_OVERDUE, title: 'Invoice overdue', body: 'An invoice for Chest X-ray is past its due date.', link: '/billing', createdAt: at(-5, 9) },
  ];
  await tx.notification.createMany({ data: notifications });
  counts.notifications = notifications.length;

  return counts;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const resetOnly = args.has('--reset-only');
  const reset = resetOnly || args.has('--reset');

  if (reset) {
    await resetDemoData();
    if (resetOnly) return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  if (!reset) {
    const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    const demoPatient = await prisma.user.findUnique({ where: { email: PATIENT_EMAIL } });
    const alreadySeeded =
      admin !== null && demoPatient !== null && (await prisma.appointment.count({ where: { patientId: demoPatient.id } })) > 0;

    if (alreadySeeded) {
      // Still guarantee the logins work (e.g. after a lockout or a password change).
      const deptIds = await upsertDepartments(prisma);
      const doctorUser = await upsertLoginUser(prisma, DEMO_DOCTOR, passwordHash);
      const staffUser = await upsertLoginUser(prisma, DEMO_STAFF, passwordHash);
      await upsertLoginUser(prisma, DEMO_ADMIN, passwordHash);
      await upsertLoginUser(prisma, DEMO_PATIENT, passwordHash);
      await ensureDemoProfiles(prisma, deptIds, { doctorId: doctorUser.id, staffId: staffUser.id });
      console.log('Demo data already present - refreshed demo login credentials only. Use --reset to rebuild.');
      return;
    }

    // Marker missing: clear any partial leftovers (only @demo.hms data) before a clean seed.
    await resetDemoData();
  }

  const counts = await prisma.$transaction((tx) => seedSampleData(tx, passwordHash), {
    timeout: 120_000,
    maxWait: 10_000,
  });

  console.log('Demo data seeded:');
  console.table(counts);
  console.log(`Demo logins (password: ${DEMO_PASSWORD}): ${DEMO_ACCOUNT_EMAILS.join(', ')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
