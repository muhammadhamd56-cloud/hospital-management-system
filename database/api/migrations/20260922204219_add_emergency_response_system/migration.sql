-- CreateEnum
CREATE TYPE "EmergencyType" AS ENUM ('MEDICAL', 'ACCIDENT_INJURY', 'BREATHING_DIFFICULTY', 'CHEST_RELATED', 'UNCONSCIOUS_PERSON', 'SEVERE_BLEEDING', 'OTHER');

-- CreateEnum
CREATE TYPE "EmergencyPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL');

-- CreateEnum
CREATE TYPE "EmergencyStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'RESPONDING', 'ARRIVED', 'RESOLVED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'VIEW';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'EMERGENCY_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'EMERGENCY_ACKNOWLEDGED';
ALTER TYPE "NotificationType" ADD VALUE 'EMERGENCY_TEAM_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'EMERGENCY_STATUS_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'EMERGENCY_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE 'EMERGENCY_CANCELLED';

-- CreateTable
CREATE TABLE "EmergencyCase" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "emergencyType" "EmergencyType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "priority" "EmergencyPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "EmergencyStatus" NOT NULL DEFAULT 'NEW',
    "locationShared" BOOLEAN NOT NULL DEFAULT false,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "assignedDoctorId" TEXT,
    "assignedStaffId" TEXT,
    "assignedTeamName" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "respondingAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmergencyCase_patientId_idx" ON "EmergencyCase"("patientId");

-- CreateIndex
CREATE INDEX "EmergencyCase_status_idx" ON "EmergencyCase"("status");

-- CreateIndex
CREATE INDEX "EmergencyCase_priority_idx" ON "EmergencyCase"("priority");

-- CreateIndex
CREATE INDEX "EmergencyCase_createdAt_idx" ON "EmergencyCase"("createdAt");

-- CreateIndex
CREATE INDEX "EmergencyCase_assignedStaffId_idx" ON "EmergencyCase"("assignedStaffId");

-- CreateIndex
CREATE INDEX "EmergencyCase_assignedDoctorId_idx" ON "EmergencyCase"("assignedDoctorId");

-- CreateIndex
CREATE INDEX "EmergencyNote_caseId_idx" ON "EmergencyNote"("caseId");

-- AddForeignKey
ALTER TABLE "EmergencyCase" ADD CONSTRAINT "EmergencyCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCase" ADD CONSTRAINT "EmergencyCase_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCase" ADD CONSTRAINT "EmergencyCase_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCase" ADD CONSTRAINT "EmergencyCase_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCase" ADD CONSTRAINT "EmergencyCase_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCase" ADD CONSTRAINT "EmergencyCase_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyNote" ADD CONSTRAINT "EmergencyNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "EmergencyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyNote" ADD CONSTRAINT "EmergencyNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
