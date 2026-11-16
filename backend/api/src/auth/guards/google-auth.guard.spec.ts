import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard, OAUTH_STATE_COOKIE } from './google-auth.guard';

function buildContext(req: Record<string, unknown>, res: Record<string, unknown> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

const config = { get: () => ({ secure: false, sameSite: 'lax' }) } as unknown as ConfigService;

describe('GoogleAuthGuard', () => {
  it('always requests the Google account chooser, so a stale Google SSO session cannot silently re-authenticate', () => {
    const guard = new GoogleAuthGuard(config);

    expect(guard.getAuthenticateOptions(buildContext({}))).toEqual({ prompt: 'select_account' });
  });

  it('sends the per-login state nonce to Google once one has been issued', () => {
    const guard = new GoogleAuthGuard(config);

    expect(guard.getAuthenticateOptions(buildContext({ oauthState: 'nonce-1' }))).toEqual({
      prompt: 'select_account',
      state: 'nonce-1',
    });
  });

  describe('callback state check (login CSRF)', () => {
    it.each([
      ['no state cookie', undefined, 'abc'],
      ['no state in the query', 'abc', undefined],
      ['a mismatched state', 'abc', 'xyz'],
    ])('lets the request through with no user when there is %s', async (_label, cookie, state) => {
      const guard = new GoogleAuthGuard(config);
      const req: Record<string, unknown> = {
        path: '/api/auth/google/callback',
        cookies: cookie ? { [OAUTH_STATE_COOKIE]: cookie } : {},
        query: state ? { state } : {},
        user: { email: 'attacker@example.com' },
      };
      const res = { clearCookie: jest.fn() };

      await expect(guard.canActivate(buildContext(req, res))).resolves.toBe(true);
      expect(req.user).toBeUndefined();
      expect(res.clearCookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, expect.objectContaining({ httpOnly: true }));
    });
  });
});
