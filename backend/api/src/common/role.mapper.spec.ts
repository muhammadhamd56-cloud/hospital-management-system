import { Role } from '@prisma/client';
import { ClientRole, toClientRole, toPrismaRole } from './role.mapper';

const PAIRS: [ClientRole, Role][] = [
  ['admin', Role.ADMIN],
  ['doctor', Role.DOCTOR],
  ['patient', Role.PATIENT],
  ['staff', Role.STAFF],
];

describe('role.mapper', () => {
  it.each(PAIRS)('toPrismaRole(%p) -> %p', (client, prisma) => {
    expect(toPrismaRole(client)).toBe(prisma);
  });

  it.each(PAIRS)('toClientRole(%p) -> %p', (client, prisma) => {
    expect(toClientRole(prisma)).toBe(client);
  });

  it('round-trips every Role enum value with no lossy conversion', () => {
    for (const role of Object.values(Role)) {
      expect(toPrismaRole(toClientRole(role))).toBe(role);
    }
  });
});
