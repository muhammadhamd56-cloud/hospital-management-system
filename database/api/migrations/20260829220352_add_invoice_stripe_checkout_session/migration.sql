-- Additive, nullable, non-destructive: tracks the Stripe Checkout Session
-- id for a patient's in-progress/completed online payment, so the webhook
-- handler can confirm a checkout.session.completed event matches THIS
-- invoice's most recent payment attempt rather than a stale/replayed one.
ALTER TABLE "Invoice" ADD COLUMN     "stripeCheckoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeCheckoutSessionId_key" ON "Invoice"("stripeCheckoutSessionId");
