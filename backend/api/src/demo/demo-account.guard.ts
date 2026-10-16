import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { DEMO_ACCOUNT_EMAILS } from './demo-accounts';

/** True when DEMO_MODE is on and `email` is one of the shared demo logins. */
export function isLockedDemoAccount(configService: ConfigService, email: string): boolean {
  return (
    configService.get<boolean>('demoMode') === true &&
    (DEMO_ACCOUNT_EMAILS as readonly string[]).includes(email.toLowerCase())
  );
}

/**
 * Many portfolio visitors share each demo login at once, so anything that
 * would change how the account signs in (password, MFA, role, deletion) --
 * or what the next visitor sees on it (profile) -- is refused. Must run
 * after JwtAuthGuard, which populates request.user.
 */
@Injectable()
export class DemoAccountGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user as AuthenticatedUser | undefined;
    if (user && isLockedDemoAccount(this.configService, user.email)) {
      throw new ForbiddenException('This action is disabled on demo accounts');
    }
    return true;
  }
}
