import { Role } from '@prisma/client';

/**
 * The frontend's `ClientRole` type is lowercase/underscored ('lab_staff', not
 * 'LAB_STAFF'). Prisma's `Role` enum is uppercase to match standard Postgres
 * enum convention. This is the single seam between the two.
 *
 * Uses an explicit lookup table rather than blind .toUpperCase()/.toLowerCase()
 * case-conversion -- that worked while every role was a single word, but is a
 * silent footgun for multi-word roles (a stray dash vs. underscore mismatch
 * would round-trip to the wrong enum value with no type error).
 */
export type ClientRole = 'admin' | 'doctor' | 'patient' | 'receptionist' | 'lab_staff' | 'pharmacist';

const CLIENT_TO_PRISMA: Record<ClientRole, Role> = {
  admin: Role.ADMIN,
  doctor: Role.DOCTOR,
  patient: Role.PATIENT,
  receptionist: Role.RECEPTIONIST,
  lab_staff: Role.LAB_STAFF,
  pharmacist: Role.PHARMACIST,
};

const PRISMA_TO_CLIENT: Record<Role, ClientRole> = {
  [Role.ADMIN]: 'admin',
  [Role.DOCTOR]: 'doctor',
  [Role.PATIENT]: 'patient',
  [Role.RECEPTIONIST]: 'receptionist',
  [Role.LAB_STAFF]: 'lab_staff',
  [Role.PHARMACIST]: 'pharmacist',
};

export function toClientRole(role: Role): ClientRole {
  return PRISMA_TO_CLIENT[role];
}

export function toPrismaRole(role: ClientRole): Role {
  return CLIENT_TO_PRISMA[role];
}
