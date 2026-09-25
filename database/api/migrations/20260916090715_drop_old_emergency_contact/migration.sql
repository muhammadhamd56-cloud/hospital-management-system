-- Drops the old combined emergencyContact column now that
-- backend/api/scripts/normalize-phone-data.ts has backfilled every existing
-- value into emergencyContactName/emergencyContactPhone (added in the
-- previous migration).
ALTER TABLE "User" DROP COLUMN "emergencyContact";
