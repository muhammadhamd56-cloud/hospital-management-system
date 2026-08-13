import { Role } from '@prisma/client';

/**
 * The frontend's `AuthRole` type is lowercase ('admin' | 'doctor' | 'patient').
 * Prisma's `Role` enum is uppercase to match standard Postgres enum convention.
 * This is the single seam between the two.
 */
export type ClientRole = 'admin' | 'doctor' | 'patient';

export function toClientRole(role: Role): ClientRole {
  return role.toLowerCase() as ClientRole;
}

export function toPrismaRole(role: ClientRole): Role {
  return role.toUpperCase() as Role;
}
