import { readdirSync } from 'fs';
import { join } from 'path';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminAiEnabledGuard } from '../admin-ai/admin-ai-enabled.guard';
import { RolesGuard } from './guards/roles.guard';
import { ROLES_KEY } from './decorators/roles.decorator';

/*
 * Authentication in this API is opt-in: a controller without
 * @UseGuards(JwtAuthGuard) is public. Rather than flip that with a global
 * guard (a behaviour change), this test fails CI whenever a handler is
 * reachable without JwtAuthGuard and isn't on the explicit allowlist below.
 *
 * Controllers are discovered from every `*.controller.ts` file under src/,
 * so a new controller is covered without anyone remembering to list it.
 */

/** `ControllerClass.handlerName` entries that are public on purpose. */
const PUBLIC_HANDLERS = new Set<string>([
  // Uptime / load-balancer probe -- called before any credentials exist.
  'HealthController.check',

  // Pre-session auth flows (and logout, which must work with an expired access token).
  'AuthController.signup',
  'AuthController.verifyOtp',
  'AuthController.resendOtp',
  'AuthController.login',
  'AuthController.verifyMfa',
  'AuthController.refresh',
  'AuthController.forgotPassword',
  'AuthController.resetPassword',
  'AuthController.logout',
  // Google OAuth -- guarded by GoogleAuthGuard (Passport), not a session.
  'AuthController.googleLogin',
  'AuthController.googleCallback',

  // A doctor's shareable read-only profile link.
  'PublicDoctorsController.findOne',

  // Stripe calls this directly; authenticity comes from the Stripe-Signature header.
  'StripeWebhookController.handleStripeWebhook',
]);

type Guard = unknown;
type ControllerClass = { name: string; prototype: Record<string, unknown> };

interface Route {
  id: string;
  controller: ControllerClass;
  handler: (...args: unknown[]) => unknown;
  guards: Guard[];
}

function findControllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return findControllerFiles(fullPath);
    return entry.name.endsWith('.controller.ts') ? [fullPath] : [];
  });
}

function loadControllers(): ControllerClass[] {
  const srcRoot = join(__dirname, '..');
  const controllers = new Set<ControllerClass>();

  for (const file of findControllerFiles(srcRoot)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(file) as Record<string, unknown>;
    for (const value of Object.values(exported)) {
      if (typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA, value)) {
        controllers.add(value as unknown as ControllerClass);
      }
    }
  }

  return [...controllers];
}

function collectRoutes(controllers: ControllerClass[]): Route[] {
  return controllers.flatMap((controller) => {
    const classGuards: Guard[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];

    return Object.getOwnPropertyNames(controller.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => ({ name, handler: controller.prototype[name] }))
      .filter(
        (entry): entry is { name: string; handler: (...args: unknown[]) => unknown } =>
          typeof entry.handler === 'function' &&
          Reflect.hasMetadata(PATH_METADATA, entry.handler) &&
          Reflect.hasMetadata(METHOD_METADATA, entry.handler),
      )
      .map(({ name, handler }) => ({
        id: `${controller.name}.${name}`,
        controller,
        handler,
        guards: [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])],
      }));
  });
}

describe('route guards', () => {
  const controllers = loadControllers();
  const routes = collectRoutes(controllers);

  it('discovers the controllers and their handlers', () => {
    // Sanity check so a broken discovery can't make the real assertions vacuous.
    expect(controllers.length).toBeGreaterThanOrEqual(30);
    expect(routes.length).toBeGreaterThanOrEqual(100);
  });

  it('puts JwtAuthGuard on every handler that is not explicitly public', () => {
    const unguarded = routes
      .filter((route) => !route.guards.includes(JwtAuthGuard))
      .map((route) => route.id)
      .filter((id) => !PUBLIC_HANDLERS.has(id));

    // A failure here means a new endpoint is reachable without a session.
    // Add @UseGuards(JwtAuthGuard, ...) -- or, if it is genuinely public,
    // add it to PUBLIC_HANDLERS with a comment saying why.
    expect(unguarded).toEqual([]);
  });

  it('keeps the public allowlist accurate (every entry exists and really is unguarded)', () => {
    const byId = new Map(routes.map((route) => [route.id, route]));
    const stale = [...PUBLIC_HANDLERS].filter((id) => {
      const route = byId.get(id);
      return !route || route.guards.includes(JwtAuthGuard);
    });

    expect(stale).toEqual([]);
  });

  it('pairs every @Roles(...) with RolesGuard, so the role check is not silently skipped', () => {
    const missingRolesGuard = routes
      .filter(
        (route) =>
          (Reflect.getMetadata(ROLES_KEY, route.controller) ?? Reflect.getMetadata(ROLES_KEY, route.handler)) !==
          undefined,
      )
      .filter((route) => !route.guards.includes(RolesGuard))
      .map((route) => route.id);

    expect(missingRolesGuard).toEqual([]);
  });

  it('runs AdminAiEnabledGuard before JwtAuthGuard on every Admin AI handler', () => {
    const adminAiRoutes = routes.filter((route) => route.controller.name === 'AdminAiController');
    expect(adminAiRoutes.length).toBeGreaterThan(0);

    for (const route of adminAiRoutes) {
      const enabledIndex = route.guards.indexOf(AdminAiEnabledGuard);
      const jwtIndex = route.guards.indexOf(JwtAuthGuard);
      expect({ id: route.id, enabledIndex: enabledIndex >= 0, jwtIndex: jwtIndex >= 0 }).toEqual({
        id: route.id,
        enabledIndex: true,
        jwtIndex: true,
      });
      expect(enabledIndex).toBeLessThan(jwtIndex);
    }
  });
});
