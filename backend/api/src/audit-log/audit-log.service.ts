import { Injectable } from '@nestjs/common';
import { AuditAction, type AuditLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Never pass auth tokens or other secrets as metadata. */
  async log(params: {
    actorId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        // Round-trips through JSON so Dates and other non-plain values (e.g.
        // a raw Prisma row passed as `before`) become the plain JSON Prisma's
        // Json column expects, instead of failing to serialize at write time.
        metadata: params.metadata !== undefined ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      },
    });
  }

  /** Oldest-first history for one entity -- e.g. EmergencyService derives its
   *  case timeline from this instead of keeping a second, parallel table. */
  async findForEntity(
    entityType: string,
    entityId: string,
  ): Promise<(AuditLog & { actor: { firstName: string; lastName: string } | null })[]> {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: { actor: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
