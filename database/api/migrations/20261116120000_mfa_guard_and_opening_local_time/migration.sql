-- Per-account MFA brute-force guard + single-use MFA challenges, and the
-- local wall-clock start time for shift openings. Additive only: new
-- columns are nullable or defaulted, so existing rows need no backfill
-- (openings without localStartTime fall back to the UTC hour, as before).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "mfaFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mfaLockedUntil" TIMESTAMP(3),
ADD COLUMN "mfaChallengeId" TEXT;

-- AlterTable
ALTER TABLE "ShiftOpening" ADD COLUMN "localStartTime" TEXT;
