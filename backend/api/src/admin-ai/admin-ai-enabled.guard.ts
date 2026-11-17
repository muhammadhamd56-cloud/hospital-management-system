import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminAiConfig } from './admin-ai.config';

/** ADMIN_AI_ENABLED=false makes the whole feature look absent (404), not forbidden. */
@Injectable()
export class AdminAiEnabledGuard implements CanActivate {
  private readonly enabled: boolean;

  constructor(configService: ConfigService) {
    this.enabled = (configService.get<AdminAiConfig>('adminAi') as AdminAiConfig).enabled;
  }

  canActivate(): boolean {
    if (!this.enabled) throw new NotFoundException();
    return true;
  }
}
