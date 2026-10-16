import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../config/configuration';

export const ACCESS_COOKIE = 'hms_at';
export const REFRESH_COOKIE = 'hms_rt';

/** The refresh cookie is only ever needed by /auth/refresh and /auth/logout,
 *  so it isn't sent along with every other API request. */
const REFRESH_COOKIE_PATH = '/api/auth';

/** State-changing requests authenticated by cookie must carry this header.
 *  A cross-site form or fetch can't add a custom header without passing a
 *  CORS preflight, which only CLIENT_URL passes -- that's the CSRF defence. */
export const CSRF_HEADER = 'x-hms-csrf';

export interface IssuedTokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

function baseOptions(cookies: AppConfig['cookies']): CookieOptions {
  return { httpOnly: true, secure: cookies.secure, sameSite: cookies.sameSite };
}

export function setAuthCookies(res: Response, tokens: IssuedTokens, cookies: AppConfig['cookies']): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(cookies),
    path: '/api',
    expires: tokens.accessExpiresAt,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(cookies),
    path: REFRESH_COOKIE_PATH,
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response, cookies: AppConfig['cookies']): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(cookies), path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(cookies), path: REFRESH_COOKIE_PATH });
}
