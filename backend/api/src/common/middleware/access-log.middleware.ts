import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** An incoming id is reused only if it's a short, log-safe token -- anything
 *  else (too long, spaces, newlines, quotes) could forge or break log lines,
 *  so a fresh UUID replaces it. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Hit by Render's health check every few seconds; logging it is pure noise. */
const SKIPPED_PATHS = new Set(['/api/health']);

type AccessLogger = Pick<Logger, 'log' | 'error'>;

function resolveRequestId(req: Request): string {
  const incoming = req.get(REQUEST_ID_HEADER);
  return incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/** Path only -- the query string can carry search terms, tokens or ids that don't belong in logs. */
function pathWithoutQuery(req: Request): string {
  const url = req.originalUrl || req.url || '';
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

/**
 * One line per request: method, path (no query string), status, duration,
 * request id and -- once JwtAuthGuard has populated req.user -- the user id.
 * Bodies, cookies, headers and query strings are never logged. Every
 * response carries the request id as X-Request-Id so a user-reported error
 * can be matched to its log line (and to the Sentry event).
 */
export function createAccessLogMiddleware(logger: AccessLogger = new Logger('HTTP')): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = pathWithoutQuery(req);

    if (SKIPPED_PATHS.has(path)) {
      next();
      return;
    }

    const requestId = resolveRequestId(req);
    const startedAt = process.hrtime.bigint();
    res.setHeader(REQUEST_ID_HEADER, requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const userId = (req.user as { id?: unknown } | undefined)?.id;
      const parts = [
        req.method,
        path,
        String(res.statusCode),
        `${durationMs.toFixed(1)}ms`,
        `reqId=${requestId}`,
      ];
      if (typeof userId === 'string' && userId) {
        parts.push(`user=${userId}`);
      }

      const line = parts.join(' ');
      if (res.statusCode >= 500) {
        logger.error(line);
      } else {
        logger.log(line);
      }
    });

    next();
  };
}

/** Disabled under NODE_ENV=test so test output stays clean. */
export function isAccessLogEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== 'test';
}
