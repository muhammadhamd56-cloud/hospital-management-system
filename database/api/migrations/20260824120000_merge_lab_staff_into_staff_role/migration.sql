-- Rename the NURSE login role to the more general STAFF, and fold the
-- separate LAB_STAFF role into it too -- lab technicians now log in as
-- STAFF like every other non-doctor staff member, and are distinguished by
-- their linked Staff.staffType ('lab_technician') instead of a dedicated
-- auth role. See LaboratoryService.requireLabAccess for the runtime check
-- that replaces the old @Roles(Role.LAB_STAFF) guard.

-- Step 1: rename NURSE -> STAFF in place (existing NURSE rows follow the
-- rename automatically -- Postgres enum labels are metadata, not data).
ALTER TYPE "Role" RENAME VALUE 'NURSE' TO 'STAFF';

-- Step 2: migrate any existing LAB_STAFF users onto the new STAFF role
-- before the LAB_STAFF value is removed below.
UPDATE "User" SET "role" = 'STAFF' WHERE "role" = 'LAB_STAFF';

-- Step 3: recreate the Role type without LAB_STAFF (Postgres has no
-- ALTER TYPE ... DROP VALUE). Safe now that no row references it.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DOCTOR', 'PATIENT', 'STAFF');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PATIENT';
DROP TYPE "Role_old";
