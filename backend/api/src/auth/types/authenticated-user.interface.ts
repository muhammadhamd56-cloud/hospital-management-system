import { ApprovalStatus, Role } from '@prisma/client';

/** Shape of `request.user` after JwtAuthGuard runs — see JwtStrategy.validate(). */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  /** Always set by JwtStrategy. Optional only so hand-built test fixtures needn't repeat it. */
  approvalStatus?: ApprovalStatus;
}
