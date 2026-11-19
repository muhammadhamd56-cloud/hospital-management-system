import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import type { AppConfig } from '../../config/configuration';

/** Holds the OAuth `state` nonce between the redirect to Google and the
 *  callback. Scoped to the Google routes and short-lived. */
export const OAUTH_STATE_COOKIE = 'hms_oauth_state';
const OAUTH_STATE_PATH = '/api/auth/google';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60_000;

type StatefulRequest = Request & { oauthState?: string };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Kicks off (and completes) the Google OAuth2 redirect flow via Passport. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  /**
   * Binds the callback to the browser that started the login (login-CSRF
   * defence): the start sets a random nonce in an httpOnly cookie and sends
   * the same value to Google as `state`; the callback must bring both back
   * matching. Without it, an attacker could make a victim's browser complete
   * the attacker's own Google login and act inside the attacker's account.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<StatefulRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const cookies = this.configService.get<AppConfig['cookies']>('cookies') as AppConfig['cookies'];
    const cookieOptions = {
      httpOnly: true,
      secure: cookies.secure,
      // Lax is required: Google's redirect back is a cross-site top-level GET.
      sameSite: 'lax' as const,
      path: OAUTH_STATE_PATH,
    };

    if (req.path.endsWith('/google/callback')) {
      const expected = (req.cookies as Record<string, string> | undefined)?.[OAUTH_STATE_COOKIE];
      const received = typeof req.query.state === 'string' ? req.query.state : '';
      res.clearCookie(OAUTH_STATE_COOKIE, cookieOptions);

      if (!expected || !received || !safeEqual(expected, received)) {
        // No user -> the callback handler redirects to ?error=oauth_failed.
        req.user = undefined;
        return true;
      }

      return (await super.canActivate(context)) as boolean;
    }

    const state = randomBytes(24).toString('hex');
    req.oauthState = state;
    res.cookie(OAUTH_STATE_COOKIE, state, { ...cookieOptions, maxAge: OAUTH_STATE_MAX_AGE_MS });
    return (await super.canActivate(context)) as boolean;
  }

  /**
   * Google keeps its own SSO cookie in the browser, independent of our JWT.
   * Without `prompt`, a user who logged out of our app but is still signed
   * into Google gets silently redirected straight back through with no
   * account chooser -- indistinguishable from "logout didn't work". Forcing
   * the account chooser on every attempt makes re-authentication explicit.
   */
  getAuthenticateOptions(context: ExecutionContext): { prompt: string; state?: string } {
    const req = context.switchToHttp().getRequest<StatefulRequest>();
    return { prompt: 'select_account', ...(req.oauthState && { state: req.oauthState }) };
  }

  /**
   * On the callback, a cancelled consent (?error=access_denied) or a strategy
   * error would otherwise throw before the controller's try/catch and leave
   * the browser on a bare JSON error page. Let it through with no user
   * instead -- the callback handler treats a missing req.user as a failure
   * and redirects to ?error=oauth_failed.
   */
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      return null as TUser;
    }
    return user;
  }
}
