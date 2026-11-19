import { Logger } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import type { AuditLogService } from '../audit-log/audit-log.service';
import { AUTH_AUDIT_EVENTS, AuthAuditService, UNKNOWN_USER_ENTITY_ID } from './auth-audit.service';

describe('AuthAuditService', () => {
  let auditLog: { log: jest.Mock };
  let service: AuthAuditService;

  beforeEach(() => {
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AuthAuditService(auditLog as unknown as AuditLogService);
  });

  it('writes a User row with the event name and action from the event table', async () => {
    await service.record(AUTH_AUDIT_EVENTS.MFA_ENABLED, { actorId: 'user-1', userId: 'user-1' });

    expect(auditLog.log).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: 'user-1',
      metadata: { event: 'auth.mfa.enabled' },
    });
  });

  it('files an unattributed event under the placeholder entity id with a null actor', async () => {
    await service.record(AUTH_AUDIT_EVENTS.LOGIN_FAILED, {
      actorId: null,
      userId: null,
      metadata: { reason: 'invalid_credentials' },
    });

    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null, entityId: UNKNOWN_USER_ENTITY_ID, action: AuditAction.VIEW }),
    );
  });

  it('swallows and logs a failed write instead of throwing', async () => {
    auditLog.log.mockRejectedValue(new Error('database down'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        service.record(AUTH_AUDIT_EVENTS.LOGOUT, { actorId: 'user-1', userId: 'user-1' }),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('auth.logout'), expect.any(String));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
