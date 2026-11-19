import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';
import { createAccessLogMiddleware, isAccessLogEnabled } from './access-log.middleware';

interface FakeResponse extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  setHeader(name: string, value: string): void;
}

function makeRequest(overrides: Partial<Request> & { headers?: Record<string, string> } = {}): Request {
  const headers = Object.fromEntries(
    Object.entries(overrides.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    method: 'GET',
    originalUrl: '/api/staff-scheduling/shifts',
    url: '/api/staff-scheduling/shifts',
    get: (name: string) => headers[name.toLowerCase()],
    ...overrides,
    headers,
  } as unknown as Request;
}

function makeResponse(): FakeResponse {
  const res = new EventEmitter() as FakeResponse;
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (name, value) => {
    res.headers[name] = value;
  };
  return res;
}

function run(req: Request, statusCode = 200) {
  const logger = { log: jest.fn(), error: jest.fn() };
  const res = makeResponse();
  const next: NextFunction = jest.fn();

  createAccessLogMiddleware(logger)(req, res as unknown as Response, next);
  res.statusCode = statusCode;
  res.emit('finish');

  return { logger, res, next };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('access-log middleware', () => {
  it('logs method, path, status, duration and request id -- never the query string', () => {
    const req = makeRequest({
      originalUrl: '/api/staff-scheduling/shifts?staffId=secret-id&token=abc123',
      headers: { cookie: 'hms_at=jwt', authorization: 'Bearer jwt' },
    });

    const { logger, res, next } = run(req);

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    const line = logger.log.mock.calls[0][0] as string;
    expect(line).toMatch(/^GET \/api\/staff-scheduling\/shifts 200 \d+\.\dms reqId=\S+$/);
    expect(line).not.toContain('?');
    expect(line).not.toContain('secret-id');
    expect(line).not.toContain('abc123');
    expect(line).not.toContain('jwt');
    expect(line).toContain(`reqId=${res.headers['X-Request-Id']}`);
  });

  it('echoes a valid incoming X-Request-Id', () => {
    const { logger, res } = run(makeRequest({ headers: { 'X-Request-Id': 'edge-req_0123456789' } }));

    expect(res.headers['X-Request-Id']).toBe('edge-req_0123456789');
    expect(logger.log.mock.calls[0][0]).toContain('reqId=edge-req_0123456789');
  });

  it.each([['has spaces in it'], ['line\nbreak-injection'], ['x'.repeat(65)], ['short']])(
    'replaces an unsafe incoming id (%j) with a generated UUID',
    (incoming) => {
      const { res } = run(makeRequest({ headers: { 'X-Request-Id': incoming } }));
      expect(res.headers['X-Request-Id']).toMatch(UUID_PATTERN);
    },
  );

  it('generates a request id when none is sent', () => {
    const { res } = run(makeRequest());
    expect(res.headers['X-Request-Id']).toMatch(UUID_PATTERN);
  });

  it('includes the user id once the auth guard has set req.user', () => {
    const req = makeRequest();
    const logger = { log: jest.fn(), error: jest.fn() };
    const res = makeResponse();

    createAccessLogMiddleware(logger)(req, res as unknown as Response, jest.fn());
    (req as unknown as { user: { id: string } }).user = { id: 'user_42' };
    res.emit('finish');

    expect(logger.log.mock.calls[0][0]).toMatch(/ user=user_42$/);
  });

  it('logs 5xx responses at error level and 4xx at log level', () => {
    expect(run(makeRequest(), 500).logger.error).toHaveBeenCalledTimes(1);

    const clientError = run(makeRequest(), 404).logger;
    expect(clientError.log).toHaveBeenCalledTimes(1);
    expect(clientError.error).not.toHaveBeenCalled();
  });

  it('skips the health check entirely', () => {
    const { logger, res, next } = run(makeRequest({ originalUrl: '/api/health?probe=1' }));

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.log).not.toHaveBeenCalled();
    expect(res.headers['X-Request-Id']).toBeUndefined();
  });

  it('is disabled under NODE_ENV=test', () => {
    expect(isAccessLogEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(isAccessLogEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(isAccessLogEnabled({})).toBe(true);
  });
});
