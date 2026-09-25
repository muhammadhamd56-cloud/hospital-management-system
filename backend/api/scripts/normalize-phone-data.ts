/**
 * One-off, idempotent backfill -- not part of any deploy step. Run manually
 * (`npx ts-node scripts/normalize-phone-data.ts`, from backend/api) whenever
 * legacy phone data needs cleaning up: after this repo's split of
 * `emergencyContact` into `emergencyContactName`/`emergencyContactPhone`, or
 * any time `User.phone` may contain values written before normalization was
 * enforced on write. Never silently mangles data -- anything that doesn't
 * parse as a valid phone number is left untouched and reported, not guessed at.
 *
 * IMPORTANT: this has only been run against this project's local dev
 * database (confirmed synthetic/seed data). Review its output before running
 * it against any real/production database -- don't assume a dev-DB run
 * covers production.
 */
import { PrismaClient } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { normalizePhoneNumber } from '../src/common/normalize-phone';

const prisma = new PrismaClient();

interface LegacyEmergencyContactRow {
  id: string;
  emergencyContact: string | null;
}

/** Best-effort split of the old combined "Name - Phone" string. Only ever
 *  populates emergencyContactPhone when a substring actually parses as a
 *  valid phone number -- otherwise the whole original string becomes the
 *  name and the phone is left null, so nothing is lost or force-fit. */
function splitLegacyEmergencyContact(value: string): { name: string; phone: string | null } {
  const parts = value.split(/\s*-\s*/);
  const lastPart = parts.length > 1 ? parts[parts.length - 1] : null;

  if (lastPart) {
    const parsed = parsePhoneNumberFromString(lastPart);
    if (parsed?.isValid()) {
      return { name: parts.slice(0, -1).join(' - ').trim(), phone: parsed.number };
    }
  }

  return { name: value.trim(), phone: null };
}

async function normalizeUserPhones(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
  });

  let updated = 0;
  let leftInvalid = 0;
  let unchanged = 0;

  for (const user of users) {
    const original = user.phone!;
    const normalized = normalizePhoneNumber(original);

    if (normalized === original) {
      const parsed = parsePhoneNumberFromString(original);
      if (parsed?.isValid()) {
        unchanged += 1;
      } else {
        leftInvalid += 1;
        console.log(`[phone] user ${user.id}: left untouched, does not parse as a valid number: ${JSON.stringify(original)}`);
      }
      continue;
    }

    await prisma.user.update({ where: { id: user.id }, data: { phone: normalized } });
    updated += 1;
    console.log(`[phone] user ${user.id}: ${JSON.stringify(original)} -> ${JSON.stringify(normalized)}`);
  }

  console.log(`\nUser.phone: ${updated} updated, ${leftInvalid} left untouched (invalid), ${unchanged} already canonical.\n`);
}

async function backfillEmergencyContact(): Promise<void> {
  // `emergencyContact` no longer exists on the Prisma model (split into
  // emergencyContactName/emergencyContactPhone) -- read the pre-drop values
  // via a raw query. If this script is run again after the follow-up
  // migration that drops the old column, this query returns nothing and the
  // step is a no-op.
  let rows: LegacyEmergencyContactRow[];
  try {
    rows = await prisma.$queryRawUnsafe<LegacyEmergencyContactRow[]>(
      `SELECT "id", "emergencyContact" FROM "User" WHERE "emergencyContact" IS NOT NULL`,
    );
  } catch {
    console.log('Old "emergencyContact" column no longer exists -- skipping backfill (already dropped).');
    return;
  }

  let updated = 0;
  let phoneRecovered = 0;

  for (const row of rows) {
    const { name, phone } = splitLegacyEmergencyContact(row.emergencyContact!);

    await prisma.user.update({
      where: { id: row.id },
      data: { emergencyContactName: name || null, emergencyContactPhone: phone },
    });
    updated += 1;
    if (phone) phoneRecovered += 1;
    console.log(
      `[emergencyContact] user ${row.id}: ${JSON.stringify(row.emergencyContact)} -> name=${JSON.stringify(name)} phone=${JSON.stringify(phone)}`,
    );
  }

  console.log(`\nemergencyContact backfill: ${updated} row(s) migrated, ${phoneRecovered} had a recognizable phone number.\n`);
}

async function main(): Promise<void> {
  console.log('Normalizing User.phone...\n');
  await normalizeUserPhones();

  console.log('Backfilling emergencyContactName/emergencyContactPhone from the old emergencyContact column...\n');
  await backfillEmergencyContact();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
