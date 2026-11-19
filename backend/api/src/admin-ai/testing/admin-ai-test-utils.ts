import { ApprovalStatus, Role } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { loadAdminAiConfig, type AdminAiConfig } from '../admin-ai.config';

export function testConfig(overrides: Partial<AdminAiConfig> = {}): AdminAiConfig {
  return { ...loadAdminAiConfig({ ADMIN_AI_ENABLED: 'true', AI_API_KEY: 'test-key' }), ...overrides };
}

export function configService(config: AdminAiConfig): ConfigService {
  return { get: (key: string) => (key === 'adminAi' ? config : undefined) } as unknown as ConfigService;
}

export const ADMIN: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  role: Role.ADMIN,
  approvalStatus: ApprovalStatus.APPROVED,
};

export const OTHER_ADMIN: AuthenticatedUser = { ...ADMIN, id: 'admin-2', email: 'other@example.test' };

export const DOCTOR: AuthenticatedUser = {
  id: 'doctor-1',
  email: 'doc@example.test',
  role: Role.DOCTOR,
  approvalStatus: ApprovalStatus.APPROVED,
};
