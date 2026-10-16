import type { Prisma } from '@prisma/client';

/**
 * Every write that moves money on an invoice (a payment, a refund, a cancel,
 * a Stripe webhook) reads the invoice's balance, checks it, then inserts.
 * Run concurrently, two of those can both pass the check against the same
 * stale balance -- two staff recording the full remaining amount at once,
 * or two refunds of the same payment. Taking this row lock first, inside
 * the transaction, makes the read-check-write sequence for one invoice run
 * one at a time. Must be called before the invoice is (re)read in `tx`.
 */
export async function lockInvoice(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
}

/** Long enough to cover a Stripe API round trip made while the lock is held. */
export const MONEY_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;
