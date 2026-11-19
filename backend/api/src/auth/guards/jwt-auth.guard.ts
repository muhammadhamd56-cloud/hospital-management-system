import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ApprovalStatus } from '@prisma/client';
import type { Request } from 'express';
import { ALLOW_UNAPPROVED_KEY } from '../../common/decorators/allow-unapproved.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user.interface';

/**
 * Protects a route with the JWT strategy (session cookie or Bearer token),
 * then refuses accounts that aren't admin-approved -- a self-registered
 * doctor or staff member gets nothing beyond their own account
 * (@AllowUnapproved routes) until an admin vets them. Enforced here rather
 * than in RolesGuard so it also covers routes with no role restriction.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    const allowUnapproved = this.reflector.getAllAndOverride<boolean>(ALLOW_UNAPPROVED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowUnapproved) return true;

    const user = context.switchToHttp().getRequest<Request>().user as AuthenticatedUser | undefined;
    // Fails closed: request.user only ever comes from JwtStrategy, which always sets the status.
    if (user?.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new ForbiddenException(
        user?.approvalStatus === ApprovalStatus.REJECTED
          ? 'Your account request was not approved'
          : 'Your account is awaiting administrator approval',
      );
    }

    return true;
  }
}
