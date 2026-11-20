# Project Audit — Hospital Management System

_Audit date: 2026-10-16. Scope: the whole repository, including the
uncommitted cookie-session work that was in progress at the time._

Severity: **P0** critical (money/data loss, security breach) · **P1** high ·
**P2** medium · **P3** low. Status: **Fixed** (code changed and verified by a
test) · **Open** (documented, not yet changed) · **Decision needed** (product
call for the owner).

Every finding below was traced in the code. Items labelled _suspected_ were
not reproduced.

---

## 1. Architecture at a glance

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, Vite 8, TypeScript, Tailwind v4, React Router 8, RHF + Zod | `frontend/`, deployed to Vercel |
| API | NestJS 10, Passport (JWT + Google OAuth), class-validator | `backend/api/`, deployed to Render (`render.yaml`) |
| Database | PostgreSQL via Prisma 6 | schema + migrations in `database/api/` |
| Payments | Stripe Checkout + webhook | optional — disabled when `STRIPE_SECRET_KEY` is unset |
| Email | Resend | optional in dev (codes are logged instead — never in production) |
| Monitoring | Sentry (backend + frontend) | no-op when the DSN is unset |

**Request flow.** Browser → `/api/*` on the app's own origin (Vite proxy in
dev; Vercel rewrite in production) → Nest global middleware (helmet,
compression, cookie-parser, CSRF check) → `JwtAuthGuard` (reads the
`hms_at` httpOnly cookie or a Bearer header, re-reads the user and role
from the DB on every request, and rejects revoked sessions via
`tokenVersion`) → `RolesGuard` → controller → service → Prisma. Responses
are wrapped as `{ success, message, data }` and errors as
`{ success: false, message, errors }`. Internal errors are never echoed.

**Roles.** `ADMIN`, `DOCTOR`, `PATIENT`, `STAFF`. `STAFF` is a single login
role; the actual job (nurse, lab technician, …) lives on `Staff.staffType`.
See [SECURITY.md](SECURITY.md) for the full permission matrix.

## 2. Baseline (before any change in this pass)

| Check | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit` (backend/api) | ✅ pass |
| Backend lint | `npx eslint "{src,test}/**/*.ts"` | ✅ pass |
| Backend unit tests | `npx jest` | ⚠️ could not start: worker processes failed to spawn (host memory pressure). Passed later with `-i` (in-band) |
| Frontend lint | `npx eslint .` | ❌ 44 errors + 11 warnings, all pre-existing (41 × `react-hooks/set-state-in-effect`). CI already treats lint as non-blocking |
| Frontend tests | `npx vitest run` | ⚠️ 6 files failed with `spawn UNKNOWN` / worker exits (environment, not assertions). Pass with `--pool=threads` |
| Frontend build | `npm run build` | ✅ pass |

## 3. Findings and status

### P0 — Critical

| ID | Finding | Status |
|---|---|---|
| BIL-1 | **A Stripe payment could be taken but never recorded.** The webhook ignored any checkout session that wasn't the invoice's *latest* one. A patient who clicked Pay twice and then paid in the first tab was charged, but the invoice stayed unpaid (`stripe.service.ts`). | **Fixed.** The webhook now trusts the Stripe-signed `metadata.invoiceId`, dedupes on the PaymentIntent (new unique constraint), and creating a new session expires the previous one. |
| DEP-1 | **Production sign-in would break with the in-progress cookie migration.** `render.yaml` assumed the frontend proxies `/api` through Vercel, but `vercel.json` had no such rewrite. `*.vercel.app` → `*.onrender.com` is cross-site, so the `SameSite=Lax` session cookies would never be sent: every user would be signed out immediately after logging in. | **Fixed** (needs one deploy value). `vercel.json` now proxies `/api/*`. The Vercel build **fails on purpose** until the real Render URL replaces the placeholder. See [DEPLOYMENT.md](DEPLOYMENT.md). |

### P1 — High

| ID | Finding | Status |
|---|---|---|
| BIL-2 | **Concurrent payments could overpay an invoice.** `recordPayment` read the balance, checked it, then inserted, with no lock. Reproduced: 5 simultaneous $100 payments on a $100 invoice were **all** recorded. | **Fixed.** `SELECT … FOR UPDATE` on the invoice inside a transaction (`billing/invoice-lock.ts`). The e2e test now records exactly 1. |
| BIL-3 | **Concurrent refunds could exceed the payment.** Reproduced: 4 simultaneous full refunds of a $100 payment refunded $400. | **Fixed.** Same lock. Stripe refunds also carry an idempotency key. |
| BIL-4 | **The webhook was neither idempotent nor atomic.** A redelivery after a partial failure, or after a refund, could record a charge twice. A charge on a cancelled invoice silently "un-cancelled" it. Already-paid amounts ignored refunds. | **Fixed.** The webhook runs under the invoice lock and dedupes on the PaymentIntent (P2002 is treated as already processed). Cancelled invoices stay cancelled. Over-payments and payments on cancelled invoices are recorded and flagged in the audit log for review. |
| APT-1 | **A patient could "cancel" a completed appointment, which voided its unpaid invoice** (free consultation; history rewritten). | **Fixed.** Only `SCHEDULED` appointments can be cancelled, and the write is conditional on that status (race-safe). |
| SEC-1 | **Logout with an expired access cookie left the 7-day refresh cookie alive.** `POST /auth/logout` required a valid access token, so an idle user's logout returned 401 before any cookies were cleared, and the next visit signed them back in (a real risk on shared hospital PCs). | **Fixed.** Logout identifies the session from the refresh cookie (or a valid access token), revokes it, and always clears both cookies. Covered by an e2e test. |
| SEC-2 | **OTP and password-reset codes were written to production logs** whenever Resend was missing or rejected a send, so anyone with log access could reset any account. | **Fixed.** Codes are only logged when `NODE_ENV !== 'production'`. `render.yaml` now sets `NODE_ENV=production`. |
| SEC-3 | **A self-registered "doctor" got hospital-wide access to beds and lab orders.** Anyone can sign up as DOCTOR (no vetting). They could then list every admitted patient by name, release any bed, and order lab tests for any patient. | **Fixed.** Self-registered doctor and staff accounts now start **pending admin approval** (owner decision, 2026-10-16). Until approved they can sign in and manage their own account, but every other API route returns 403 (`JwtAuthGuard`). They're hidden from the doctor directory and can't be booked. Admins review them on **Account Approvals** and are notified once the applicant's email is verified. Approvals and rejections (with an optional reason) notify and email the applicant and are audit-logged. Accounts that existed before this change were left approved. In addition, beds and lab orders now require a real doctor–patient relationship. |
| SEC-4 | **Rate limits were shared by all users.** Without `trust proxy`, `req.ip` behind Render's load balancer is the proxy's address, so five bad logins from anyone throttled login for everyone. | **Fixed.** `TRUST_PROXY_HOPS` (set to 2 in `render.yaml`: Render LB + Vercel rewrite). |
| DEP-2 | `render.yaml` never set `NODE_ENV`, so cookies were not `Secure` in production. | **Fixed.** `NODE_ENV=production`, plus `npm install --include=dev` so the build still has its tooling. |

### P2 — Medium

| ID | Finding | Status |
|---|---|---|
| APT-2 | The double-booking check only caught *identical* start times: a 10:00 and a 10:05 slot with the same doctor both succeeded. There was no check that a patient wasn't double-booked across doctors. | **Fixed.** Overlap is measured by the doctor's session length, for both doctor and patient, inside the existing serializable transaction. |
| APT-3 | Booking ignored the doctor's `isAvailable` and `acceptsOnline` settings (the UI hid unavailable doctors, but the API didn't enforce it). | **Fixed.** |
| APT-4 | `scheduledAt` accepted any string `Date` could parse. A time without an offset was read in the server's timezone (UTC), shifting the appointment. | **Fixed.** Strict ISO-8601 with an explicit offset is required. The frontend already sends `toISOString()`. |
| PRV-1 | A doctor viewing a patient saw the patient's appointments (with free-text reasons) at **every other** doctor. | **Fixed.** Only the doctor's own appointments with that patient are returned. |
| PRV-2 | Every patient could read all doctors' emails and phone numbers from the directory and probe staff emails via search. The directory also loaded the whole doctors table into memory for every search. | **Fixed.** Contact details are hidden from patients and email search is staff-only. Filtering and the limit now run in SQL. |
| PRV-3 | The AI assistant sent the user's email and the clinical free-text appointment reason to the model provider. | **Fixed** (role only; no reason). Patient and doctor names still go to the provider for navigation answers, so a data-processing agreement is still needed. **Resolved by removal** (2026-11-20): the AI assistant was deleted. |
| SEC-5 | OTP and password-reset attempt limits could be raced with parallel guesses. The reset endpoint also distinguished "unknown email" (400) from "wrong code" (401), confirming which accounts exist. | **Fixed.** An attempt is claimed atomically before comparing. All reset failures return the same 400. Codes are single-use even under concurrent submission. |
| SCH-1 | Two simultaneous approvals could overfill a shift opening. | **Fixed.** A row lock on the opening, a conditional claim, and a compensating rollback if the shift can't be created. |
| UX-1 | Adding a doctor or patient from the dashboard's **Quick Actions** discarded the one-time temporary password, so the new account was unusable. | **Fixed.** Shared `TempPasswordDialog` (also replaces three duplicated copies). |
| FIN-1 | Money is stored as `Float`. Correctness relies on `roundMoney()` being applied everywhere, and DTOs don't limit decimal places. | **Open.** Migrating to `Decimal(12,2)` (or integer cents) touches every money path. Planned as its own change with a data migration. |
| FIN-2 | A fully refunded invoice stayed "owed" forever and could not be cancelled (the cancel guard counted payment *rows*, not net money). | **Fixed.** Cancel is allowed once net paid is $0. |
| API-1 | Several list endpoints are unpaginated (admin appointments, patients, lab tests, beds, shifts, tasks, chat threads). | **Open.** Each needs a matching frontend pager. |
| CHT-1 | Chat threads are unbounded and every message can carry a ~2 MB image data URL stored in Postgres. | **Open.** Move images to object storage and paginate threads. |
| LAB-1 | Patients receive a "Lab result ready" notification, but no patient-facing screen or endpoint shows lab results. | **Open** (missing feature). |
| NTF-1 | Doctors on the staff roster get shift and task notifications linking to staff-only pages, which redirect them to the dashboard. | **Open.** |

### P3 — Low

| ID | Finding | Status |
|---|---|---|
| UX-2 | The admin dashboard showed **made-up** trend figures (+4.2%, −2.1%, …) next to live counts. | **Fixed** (removed; the card shows a trend only when given real data). |
| UX-3 | Clearing the consultation-margin field silently saved $0. | **Fixed.** |
| UX-4 | The billing "Today / This month" filters parsed dates as UTC, misplacing invoices west of UTC. | **Fixed.** |
| UX-5 | "Payment received" was shown on return from Stripe before the payment had cleared. | **Fixed** (wording). |
| APT-5 | A doctor could mark a future appointment completed. | **Fixed.** |
| APT-6 | The reminder cron could email twice if runs overlapped. | **Fixed** (claim before send; at-most-once). |
| APT-7 | Booking and invoice creation aren't atomic. A failure after the booking leaves an appointment without an invoice. | **Open.** |
| BIL-5 | A bad Stripe signature returned 500, so Stripe kept retrying. | **Fixed** (400). |
| BIL-6 | Invoice due dates are stored as UTC midnight, so "overdue" starts the evening before in the Americas. | **Open.** |
| OPS-1 | Swagger UI was public in production. | **Fixed** (non-production only). |
| OPS-2 | Shutdown hooks weren't enabled, so Prisma never disconnected on SIGTERM. | **Fixed.** |
| OPS-3 | A missing `ANTHROPIC_API_KEY` returned 500 on every assistant call (and alerted Sentry). | **Fixed** (503). **Resolved by removal** (2026-11-20): the AI assistant was deleted. |
| SEC-6 | Changing a password doesn't revoke other sessions (a reset does). | **Open.** |
| SCH-2 | Shift availability checks read UTC hours as local wall-clock time. | **Open.** |
| FE-1 | 44 pre-existing frontend lint errors (`set-state-in-effect`). | **Open.** Unchanged in count by this pass. |
| FIN-3 | Medical records can attach to a cancelled appointment (_suspected_; may be intended). | **Open.** |

## 4. Verified OK (checked, no change needed)

- Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`, so clients
  can't inject `patientId`, `fee`, `status` or `role`.
- Every controller is behind `JwtAuthGuard` except auth, health, the public
  doctor profile and the Stripe webhook (which is signature-verified).
- The role is re-read from the DB on every request. Revoked sessions fail
  via `tokenVersion`. Refresh and MFA tokens can't be used as access tokens.
- Consultation fees come from the doctor record on the server and are
  snapshotted on the appointment. Invoice totals are always recomputed
  server-side.
- Patients can only reach their own appointments, invoices, records, chats
  and notifications.
- The exception filter never leaks stack traces or Prisma messages.
- Passwords and one-time codes are bcrypt-hashed. Codes come from
  `crypto.randomInt`, expire, and are single-use.
- Chat images accept only `data:image/(png|jpeg|gif|webp)` (no SVG/HTML).
  There are no filesystem uploads.
- A shared country-aware phone input (libphonenumber) is used on every
  phone field, with matching backend validation.

## 5. Recommended next priorities

1. **Review grandfathered professional accounts.** Doctor/staff accounts that
   self-registered before approval existed were left approved (SEC-3). Use the
   query in [SECURITY.md](SECURITY.md) to find and re-check them.
2. **Money as `Decimal`** (FIN-1), with a reviewed data migration.
3. **Pagination** for admin lists and chat (API-1, CHT-1), and move chat
   images to object storage.
4. **Patient lab results view** (LAB-1) and doctor shift visibility (NTF-1).
5. Clear the 44 frontend lint errors, then make lint blocking in CI.
6. Revoke other sessions on password change (SEC-6). Make booking and
   invoice creation atomic (APT-7).
