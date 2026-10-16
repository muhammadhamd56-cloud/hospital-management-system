import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Compared against the user's current tokenVersion; a logout bumps the
   *  latter, so tokens issued before it fail validation immediately. */
  tokenVersion: number;
}

/** Only accepted by POST /auth/refresh. `purpose` is what JwtStrategy
 *  checks to refuse one presented as an access token. */
export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
  purpose: 'refresh';
}
