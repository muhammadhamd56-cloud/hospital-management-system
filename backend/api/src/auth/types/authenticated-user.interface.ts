import { Role } from '@prisma/client';

/** Shape of `request.user` after JwtAuthGuard runs — see JwtStrategy.validate(). */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
