import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Reads roles set by `@Roles(...)` and checks them against `request.user.role`
 * (populated by JwtAuthGuard). Always combine as `@UseGuards(JwtAuthGuard, RolesGuard)`
 * — this guard assumes authentication already happened.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    return Boolean(user?.role) && requiredRoles.includes(user.role);
  }
}
