-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passwordResetCodeHash" TEXT,
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetLastSentAt" TIMESTAMP(3);
