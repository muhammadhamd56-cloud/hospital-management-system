-- AlterEnum
-- Postgres has no direct "remove enum value" operation -- recreate the type
-- without RECEPTIONIST, repoint the column, then drop the old type. Safe
-- here because no User row uses RECEPTIONIST (verified before writing this).
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'DOCTOR', 'PATIENT', 'LAB_STAFF', 'PHARMACIST');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PATIENT';
COMMIT;
