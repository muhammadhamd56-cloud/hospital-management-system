import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';

/**
 * Authentication events written to AuditLog. Every row uses
 * entityType 'User' and entityId = the affected user's id, with the event
 * name in metadata.event. The AuditAction is picked per event:
 *   CREATE -- a session was started (login)
 *   DELETE -- a session was ended (logout)
 *   UPDATE -- credentials or the second factor changed
 *   VIEW   -- a failed attempt that changed no credential
 */
export const AUTH_AUDIT_EVENTS = {
  LOGIN_SUCCEEDED: { event: 'auth.login.succeeded', action: AuditAction.CREATE },
  LOGIN_FAILED: { event: 'auth.login.failed', action: AuditAction.VIEW },
  GOOGLE_LOGIN: { event: 'auth.login.google', action: AuditAction.CREATE },
  LOGOUT: { event: 'auth.logout', action: AuditAction.DELETE },
  PASSWORD_RESET: { event: 'auth.password.reset', action: AuditAction.UPDATE },
  PASSWORD_SET: { event: 'auth.password.set', action: AuditAction.UPDATE },
  PASSWORD_CHANGED: { event: 'auth.password.changed', action: AuditAction.UPDATE },
  MFA_ENABLED: { event: 'auth.mfa.enabled', action: AuditAction.UPDATE },
  MFA_DISABLED: { event: 'auth.mfa.disabled', action: AuditAction.UPDATE },
  MFA_CHALLENGE_SUCCEEDED: { event: 'auth.mfa.challenge_succeeded', action: AuditAction.CREATE },
  MFA_CHALLENGE_FAILED: { event: 'auth.mfa.challenge_failed', action: AuditAction.VIEW },
} as const;

export type AuthAuditEvent = (typeof AUTH_AUDIT_EVENTS)[keyof typeof AUTH_AUDIT_EVENTS];

/** entityId for a failed login that is deliberately not attributed to an
 *  account (bad credentials), so the row does not reveal whether it exists. */
export const UNKNOWN_USER_ENTITY_ID = 'unknown';

/** Only these scalar, non-secret keys may reach the metadata column. */
export interface AuthAuditMetadata {
  method?: 'password' | 'google' | 'mfa';
  reason?: 'invalid_credentials' | 'account_locked' | 'role_mismatch' | 'email_unverified' | 'invalid_code';
  mfaPending?: boolean;
  /** Second factor that satisfied the challenge. */
  factor?: 'totp' | 'backup_code';
  locked?: boolean;
  newAccount?: boolean;
  required?: boolean;
  /** SHA-256 (hex) of the trimmed, lower-cased attempted email. */
  emailHash?: string;
}

/**
 * Thin, failure-proof wrapper over AuditLogService for src/auth and
 * src/users. Never pass passwords, tokens, OTP/TOTP codes, backup codes or
 * secrets here -- AuthAuditMetadata deliberately has no field for them.
 * An audit write failure is logged and swallowed: it must never turn a
 * successful login (or a correct 401) into a 500.
 */
@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger(AuthAuditService.name);

  constructor(private readonly auditLog: AuditLogService) {}

  async record(
    { event, action }: AuthAuditEvent,
    params: { actorId: string | null; userId: string | null; metadata?: AuthAuditMetadata },
  ): Promise<void> {
    const entityId = params.userId ?? UNKNOWN_USER_ENTITY_ID;

    try {
      await this.auditLog.log({
        actorId: params.actorId,
        action,
        entityType: 'User',
        entityId,
        metadata: { event, ...params.metadata },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit event ${event} for user ${entityId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
