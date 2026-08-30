-- DropTable
-- Removing the entire Pharmacy feature. Safe: verified zero rows in Medicine
-- and zero User rows with role=PHARMACIST before writing this migration.
DROP TABLE "Medicine";

-- DropEnum
DROP TYPE "MedicineCategory";

-- AlterEnum
-- Postgres has no direct "remove enum value" operation -- recreate the type
-- without PHARMACIST, repoint the column, then drop the old type.
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'DOCTOR', 'PATIENT', 'LAB_STAFF');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PATIENT';
COMMIT;
