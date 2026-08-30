import { Role } from '@prisma/client';

/**
 * The frontend's `ClientRole` type is lowercase ('staff', not 'STAFF').
 * Prisma's `Role` enum is uppercase to match standard Postgres enum
 * convention. This is the single seam between the two.
 *
 * Uses an explicit lookup table rather than blind .toUpperCase()/.toLowerCase()
 * case-conversion -- a future multi-word role (a stray dash vs. underscore
 * mismatch) would otherwise round-trip to the wrong enum value with no type
 * error.
 */
export type ClientRole = 'admin' | 'doctor' | 'patient' | 'staff';

const CLIENT_TO_PRISMA: Record<ClientRole, Role> = {
  admin: Role.ADMIN,
  doctor: Role.DOCTOR,
  patient: Role.PATIENT,
  staff: Role.STAFF,
};

const PRISMA_TO_CLIENT: Record<Role, ClientRole> = {
  [Role.ADMIN]: 'admin',
  [Role.DOCTOR]: 'doctor',
  [Role.PATIENT]: 'patient',
  [Role.STAFF]: 'staff',
};

export function toClientRole(role: Role): ClientRole {
  return PRISMA_TO_CLIENT[role];
}

export function toPrismaRole(role: ClientRole): Role {
  return CLIENT_TO_PRISMA[role];
}
