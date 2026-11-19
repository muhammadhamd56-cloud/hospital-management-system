import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ACCESS_COOKIE, CSRF_HEADER } from '../../auth/auth-cookies';
import { csrfProtection } from './csrf.middleware';

function makeRequest(method: string, headers: Record<string, string> = {}): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    originalUrl: '/api/billing/invoices?search=private-term',
    url: '/api/billing/invoices?search=private-term',
    cookies: { [ACCESS_COOKIE]: 'jwt-token-value' },
    get: (name: string) => lower[name.toLowerCase()],
  } as unknown as Request;
}

function makeResponse() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('csrfProtection', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it('rejects a cookie-authenticated POST without the header, logging method and path only', () => {
    const res = makeResponse();
    const next = jest.fn();

    csrfProtection(makeRequest('POST'), res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Missing CSRF header',
      errors: ['State-changing requests must include the X-HMS-CSRF header'],
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0][0] as string;
    expect(line).toContain('POST /api/billing/invoices');
    expect(line).not.toContain('private-term');
    expect(line).not.toContain('jwt-token-value');
  });

  it('passes (without logging) when the header is present or the method is safe', () => {
    const next = jest.fn();
    csrfProtection(makeRequest('POST', { [CSRF_HEADER]: '1' }), makeResponse() as unknown as Response, next);
    csrfProtection(makeRequest('GET'), makeResponse() as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });
});
