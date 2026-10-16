-- Admin approval for self-registered doctor and staff accounts.
-- Additive only. Every existing user gets the column default APPROVED, so no
-- current account is locked out; only signups after this ships start PENDING.
-- Postgres 12+ allows ALTER TYPE ... ADD VALUE inside a transaction (Neon is 15+).

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_APPROVAL_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_REJECTED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvalReviewedAt" TIMESTAMP(3),
ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateIndex
CREATE INDEX "User_approvalStatus_idx" ON "User"("approvalStatus");

