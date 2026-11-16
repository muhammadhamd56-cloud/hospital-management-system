import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Kicks off (and completes) the Google OAuth2 redirect flow via Passport. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  /**
   * Google keeps its own SSO cookie in the browser, independent of our JWT.
   * Without `prompt`, a user who logged out of our app but is still signed
   * into Google gets silently redirected straight back through with no
   * account chooser -- indistinguishable from "logout didn't work". Forcing
   * the account chooser on every attempt makes re-authentication explicit.
   */
  getAuthenticateOptions(): { prompt: string } {
    return { prompt: 'select_account' };
  }

  /**
   * On the callback, a cancelled consent (?error=access_denied) or a strategy
   * error would otherwise throw before the controller's try/catch and leave
   * the browser on a bare JSON error page. Let it through with no user instead.
   */
  // The callback handler treats a missing req.user as a failure and redirects
  // to ?error=oauth_failed; the initial /auth/google redirect never gets here.
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      return null as TUser;
    }
    return user;
  }
}
