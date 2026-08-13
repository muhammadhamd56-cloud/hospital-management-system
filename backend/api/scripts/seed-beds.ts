import { PrismaClient, BedStatus } from '@prisma/client';

const prisma = new PrismaClient();

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

async function main(): Promise<void> {
  const existingCount = await prisma.bed.count();

  if (existingCount > 0) {
    console.log(`Skipping seed — ${existingCount} bed(s) already exist.`);
    return;
  }

  const departments = await Promise.all(
    DEPARTMENTS.map((name) =>
      prisma.department.upsert({ where: { name }, update: {}, create: { name } }),
    ),
  );
  const departmentIdByName = new Map(departments.map((department) => [department.name, department.id]));

  const beds = DEPARTMENTS.flatMap((department) =>
    Array.from({ length: BEDS_PER_DEPARTMENT }, (_, i) => ({
      label: `${department} - Bed ${i + 1}`,
      departmentId: departmentIdByName.get(department)!,
      status: BedStatus.AVAILABLE,
    })),
  );

  await prisma.bed.createMany({ data: beds });
  console.log(`Seeded ${beds.length} beds across ${DEPARTMENTS.length} departments.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
