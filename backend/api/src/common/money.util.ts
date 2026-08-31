/**
 * Rounds a monetary value to 2 decimal places, going through cents as
 * integers to avoid floating-point drift (e.g. 10.10 becoming 10.099999...).
 * The schema stores money as Float (see schema.prisma), so every financial
 * calculation must be rounded through this before it's persisted or returned.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
