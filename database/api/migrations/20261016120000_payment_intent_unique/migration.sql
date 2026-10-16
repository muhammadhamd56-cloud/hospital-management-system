-- A Stripe PaymentIntent maps to exactly one Payment row. Enforced so a
-- redelivered or concurrently delivered checkout webhook can never record
-- the same charge twice (StripeService treats P2002 here as "already done").
-- Pre-flight: fails if duplicates already exist -- check with
--   SELECT "stripePaymentIntentId", count(*) FROM "Payment"
--   WHERE "stripePaymentIntentId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- NULLs (cash/bank/manual payments) are unaffected: Postgres treats them as distinct.

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
