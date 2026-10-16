import type { Response } from 'supertest';
import { ACCESS_COOKIE } from '../src/auth/auth-cookies';

/**
 * Sign-in endpoints return the access token only as the httpOnly session
 * cookie, never in the body. The e2e app doesn't install cookie-parser, so
 * tests pull the token out of Set-Cookie and send it back as a Bearer header
 * (which JwtStrategy still accepts). Undefined when no session was started.
 */
export function accessTokenFrom(res: Response): string | undefined {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const prefix = `${ACCESS_COOKIE}=`;
  const cookie = cookies.find((c) => c.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length).split(';')[0]) : undefined;
}
