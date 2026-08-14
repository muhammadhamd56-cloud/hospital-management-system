import type { User } from '@prisma/client';
import { ClientRole, toClientRole } from '../common/role.mapper';

export interface StaffResponse {
  id: string;
  fullName: string;
  email: string;
  role: ClientRole;
  createdAt: string;
}

export function toStaffResponse(user: User): StaffResponse {
  return {
    id: user.id,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    role: toClientRole(user.role),
    createdAt: user.createdAt.toISOString(),
  };
}
