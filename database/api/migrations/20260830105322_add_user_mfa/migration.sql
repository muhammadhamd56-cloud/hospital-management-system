-- Additive, nullable/defaulted, non-destructive: adds opt-in TOTP-based MFA
-- fields to User. mfaEnabled defaults false (no behavior change for
-- existing accounts), mfaSecret stays null until a user starts setup,
-- mfaBackupCodeHashes defaults to an empty array.
ALTER TABLE "User" ADD COLUMN     "mfaBackupCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT;
