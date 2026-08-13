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
}
