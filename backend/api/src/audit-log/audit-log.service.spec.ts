import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: { auditLog: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = { auditLog: { create: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuditLogService);
  });

  it('writes an audit log row with the given fields', async () => {
    await service.log({
      actorId: 'admin-1',
      action: AuditAction.CREATE,
      entityType: 'StaffShift',
      entityId: 'shift-1',
      metadata: { staffId: 'staff-1' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: AuditAction.CREATE,
        entityType: 'StaffShift',
        entityId: 'shift-1',
        metadata: { staffId: 'staff-1' },
      },
    });
  });

  it('round-trips metadata through JSON so Date values serialize safely', async () => {
    const date = new Date('2026-08-20T08:00:00.000Z');

    await service.log({
      actorId: 'admin-1',
      action: AuditAction.UPDATE,
      entityType: 'StaffShift',
      entityId: 'shift-1',
      metadata: { startTime: date },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { startTime: date.toISOString() } }),
    });
  });

  it('omits metadata entirely when not provided', async () => {
    await service.log({ actorId: null, action: AuditAction.DELETE, entityType: 'StaffShift', entityId: 'shift-1' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: AuditAction.DELETE,
        entityType: 'StaffShift',
        entityId: 'shift-1',
        metadata: undefined,
      },
    });
  });
});
