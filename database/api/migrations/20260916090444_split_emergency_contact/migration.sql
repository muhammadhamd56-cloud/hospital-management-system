-- Adds the split emergency-contact columns without touching the old
-- `emergencyContact` column yet -- a follow-up migration drops it once
-- `backend/api/scripts/normalize-phone-data.ts` has backfilled these from it.
ALTER TABLE "User" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "User" ADD COLUMN "emergencyContactPhone" TEXT;
