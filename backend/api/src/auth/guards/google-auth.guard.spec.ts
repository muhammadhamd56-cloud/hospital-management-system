import { GoogleAuthGuard } from './google-auth.guard';

describe('GoogleAuthGuard', () => {
  it('always requests the Google account chooser, so a stale Google SSO session cannot silently re-authenticate', () => {
    const guard = new GoogleAuthGuard();

    expect(guard.getAuthenticateOptions()).toEqual({ prompt: 'select_account' });
  });
});
