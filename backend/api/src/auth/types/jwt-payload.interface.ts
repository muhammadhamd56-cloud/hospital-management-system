import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Compared against the user's current tokenVersion; a logout bumps the
   *  latter, so tokens issued before it fail validation immediately. */
  tokenVersion: number;
}
