import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from '../../auth/auth-cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const logger = new Logger('CSRF');

/**
 * Cookies are attached by the browser automatically, so a state-changing
 * request that carries our session cookies must also carry CSRF_HEADER.
 * Setting a custom header cross-site triggers a CORS preflight that only
 * CLIENT_URL passes, so a forged form post or fetch from another site fails
 * here. Requests without our cookies (Bearer API clients, Stripe's webhook,
 * the login form itself) aren't riding on ambient credentials and pass through.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const cookies = req.cookies as Record<string, string> | undefined;
  const usesSessionCookie = Boolean(cookies?.[ACCESS_COOKIE] || cookies?.[REFRESH_COOKIE]);

  if (SAFE_METHODS.has(req.method) || !usesSessionCookie || req.get(CSRF_HEADER) === '1') {
    next();
    return;
  }

  // Method and path only -- never the query string, cookies or headers.
  const path = (req.originalUrl || req.url || '').split('?')[0];
  logger.warn(`Rejected ${req.method} ${path}: missing CSRF header`);

  res.status(403).json({
    success: false,
    message: 'Missing CSRF header',
    errors: ['State-changing requests must include the X-HMS-CSRF header'],
  });
}
