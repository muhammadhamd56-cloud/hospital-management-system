import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { roundMoney } from '../common/money.util';

/** Fixed id of the single settings row -- there is only ever one. */
const SETTINGS_ID = 'default';

export interface PlatformSettingsResponse {
  consultationMargin: number;
}

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getSettings(): Promise<PlatformSettingsResponse> {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
    return { consultationMargin: row?.consultationMargin ?? 0 };
  }

  /** Used internally by BillingService when auto-generating a consultation
   *  invoice -- callers who only need the number, not the wrapper response. */
  async getConsultationMargin(): Promise<number> {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
    return row?.consultationMargin ?? 0;
  }

  async updateConsultationMargin(margin: number, actorId: string): Promise<PlatformSettingsResponse> {
    const rounded = roundMoney(margin);

    const previous = await this.prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });

    await this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, consultationMargin: rounded },
      update: { consultationMargin: rounded },
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'PlatformSettings',
      entityId: SETTINGS_ID,
      metadata: { field: 'consultationMargin', previousMargin: previous?.consultationMargin ?? 0, newMargin: rounded },
    });

    return { consultationMargin: rounded };
  }
}
