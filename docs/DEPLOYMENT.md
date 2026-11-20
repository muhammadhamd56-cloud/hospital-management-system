# Deployment

Frontend on **Vercel** (`frontend/`), API on **Render** (`render.yaml`,
`backend/api/`), PostgreSQL on a managed host (e.g. Neon).

## How the pieces connect

```
browser ── https://<app>.vercel.app/api/* ──(vercel.json rewrite)──▶ https://<service>.onrender.com/api/*
```

The browser only ever talks to the Vercel domain. Sessions are httpOnly
cookies (`hms_at` access, 15 min; `hms_rt` refresh, 7 days) set by the API.
Because the API is reached through the Vercel domain, those cookies are
first-party. If the browser called `onrender.com` directly, it would treat
the cookies as cross-site and drop them (Safari always does), and nobody
could stay signed in.

## One-time setup / required values

### Vercel (frontend)

1. **`frontend/vercel.json`**: replace `YOUR-RENDER-SERVICE` in the `/api`
   rewrite with your Render service host:
   ```json
   { "source": "/api/:path*", "destination": "https://<service>.onrender.com/api/:path*" }
   ```
   The Vercel build refuses to run until this is done
   (`frontend/scripts/check-deploy-config.mjs`). This is deliberate.
2. **Environment variables**: leave **`VITE_API_URL` unset** (the build
   also refuses to run if it's set). Optional: `VITE_SENTRY_DSN`,
   `VITE_SENTRY_ENVIRONMENT`, `VITE_DEMO_MODE`.

### Render (API)

The blueprint in `render.yaml` sets the non-secret values. Fill in the
`sync: false` ones in the dashboard:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (with `sslmode=require`) |
| `CLIENT_URL` | `https://<app>.vercel.app` (used for Stripe return URLs and CORS) |
| `GOOGLE_CALLBACK_URL` | **`https://<app>.vercel.app/api/auth/google/callback`**. Must use the Vercel domain so the OAuth session cookie lands there. Add the same URL to the Google Cloud console's authorized redirect URIs. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `RESEND_API_KEY` | Required for signup and password reset in production (codes are never logged there) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Optional. Without them, online payment is clearly reported as unavailable |
| `SENTRY_DSN` | Optional |
| `AI_BASE_URL` / `AI_API_KEY` | Leave empty for now. The Admin AI Copilot runs on a local model through Ollama, and a Render service cannot reach an Ollama on a local machine, so the blueprint keeps `ADMIN_AI_ENABLED="false"`. See `docs/ai/AI_DEPLOYMENT.md` |

Set by the blueprint: `NODE_ENV=production` (Secure cookies, no Swagger,
no codes in logs), `TRUST_PROXY_HOPS=2` (Render LB + Vercel rewrite, so
rate limits are per visitor), `COOKIE_SAMESITE=lax`, `JWT_EXPIRES_IN=15m`,
`JWT_REFRESH_EXPIRES_IN=7d`, generated `JWT_SECRET` / `JWT_REFRESH_SECRET`.

**Existing Render service created before this change:** a Blueprint sync
adds the new variables. If the service isn't Blueprint-managed, add
`NODE_ENV`, `TRUST_PROXY_HOPS`, `JWT_REFRESH_SECRET`, `COOKIE_SAMESITE`
by hand, set `JWT_EXPIRES_IN=15m`, and change the build command to
`npm install --include=dev && npm run build`.

**Stripe webhook:** point it straight at Render:
`https://<service>.onrender.com/api/billing/webhooks/stripe`, with events
`checkout.session.completed`, `checkout.session.async_payment_succeeded`
and `charge.refunded`.

## Database migrations

The start command runs `prisma migrate deploy` before booting, so pending
migrations apply automatically on each deploy. This release adds one:

| Migration | Change | Risk |
|---|---|---|
| `20261016120000_payment_intent_unique` | Unique index on `Payment.stripePaymentIntentId` | Fails if two Payment rows already share a PaymentIntent (that would itself be a double-recorded charge). Check first; see below. |
| `20261016150000_add_account_approval` | `ApprovalStatus` enum, 3 `User` columns, an index, 3 `NotificationType` values | Additive only. Every existing user gets `APPROVED`, so nobody is locked out. Needs Postgres 12+ (enum values added in a transaction); Neon is fine. |

Pre-flight check against production (read-only):

```sql
SELECT "stripePaymentIntentId", count(*) FROM "Payment"
WHERE "stripePaymentIntentId" IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;
```

If it returns rows, resolve the duplicates (refund or delete the extra
Payment after review) **before** deploying. Rollback: `DROP INDEX
"Payment_stripePaymentIntentId_key";` (the app keeps working without it;
only the webhook's duplicate backstop is lost).

Never use `prisma db push` or `migrate reset` against production.

## Deploy order

1. Run the pre-flight SQL above.
2. Deploy the API (Render), then confirm `GET https://<service>.onrender.com/api/health` returns 200.
3. Update `vercel.json` with the real host, then deploy the frontend.
4. Smoke test on the Vercel domain:
   - Sign in with a password, reload, and stay signed in.
   - Leave the tab for 16+ minutes, click something, and stay signed in (refresh).
   - Log out, reload, and stay signed out.
   - Sign in with Google.
   - (If Stripe is configured) pay a test invoice with card `4242 4242 4242 4242`.

## Backups

Neon keeps point-in-time history (the window depends on plan). Before any
risky migration, create a branch or snapshot in the Neon console. Restore
by branching from a timestamp and pointing `DATABASE_URL` at it.
