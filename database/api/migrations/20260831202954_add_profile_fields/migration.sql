-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "qualifications" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "gender" TEXT;
