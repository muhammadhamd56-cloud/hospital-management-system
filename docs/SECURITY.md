# Security design

## Authentication

- **Password sign-in**: bcrypt hashes, per-account lockout after repeated
  failures, optional TOTP MFA with one-time backup codes.
- **Google OAuth**: Passport. The callback sets the session cookies and
  redirects to the frontend. No token ever appears in a URL.
- **Sessions**: two httpOnly cookies set by the API (`auth/auth-cookies.ts`).
  - `hms_at`: access JWT, 15 min, path `/api`.
  - `hms_rt`: refresh JWT, 7 days, path `/api/auth`, signed with a separate
    secret and tagged `purpose: 'refresh'` so it can't be used as an access
    token.
  - Page JavaScript never sees either token. On a 401, the frontend calls
    `POST /api/auth/refresh` once (single-flight) and retries.
- **Revocation**: every token carries the user's `tokenVersion`. Logout and
  password reset bump it, which kills every session on every device.
  `JwtAuthGuard` re-reads the user (and role) from the DB on each request.
  Logout works even after the access cookie has expired (it reads the
  refresh cookie) and always clears both cookies.
- **One-time codes** (email verification, password reset): `crypto.randomInt`,
  bcrypt-hashed at rest, 10–15 min expiry, 5 attempts claimed atomically
  before each comparison, single-use. Reset failures all return the same
  response (no account enumeration). Codes are never logged in production.
- **Bearer tokens** are still accepted for API clients and tests.

## CSRF

Cookies are sent automatically, so any state-changing request (not
`GET`/`HEAD`/`OPTIONS`) that carries a session cookie must also send
`X-HMS-CSRF: 1` (`common/middleware/csrf.middleware.ts`). A cross-site page
can't add a custom header without a CORS preflight, and CORS allows only
`CLIENT_URL`. Cookies are also `SameSite=Lax`. Requests without session
cookies (login, Bearer clients, the Stripe webhook) aren't riding on ambient
credentials and pass through.

## Transport and headers

`helmet()` on the API. `nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy` and `Permissions-Policy` on Vercel. Cookies are `Secure`
when `NODE_ENV=production`. CORS: a single origin (`CLIENT_URL`) with
credentials.

## Rate limiting

A global throttler allows 120 requests/min per client IP. Sensitive routes
are tighter: login, verify-otp and MFA allow 5/min; forgot-password 3/min;
refresh 30/min. `TRUST_PROXY_HOPS` must match the number of proxies in
front of the app, or every visitor shares one bucket (see DEPLOYMENT.md).

## Authorization — permission matrix

Backend-enforced by `RolesGuard` (`@Roles`) plus per-record ownership checks
in the services. Hiding a button in the UI is never the only control.

| Resource | Admin | Doctor | Patient | Staff |
|---|---|---|---|---|
| Own profile, password, MFA (`/users/me`) | ✅ | ✅ | ✅ | ✅ |
| Notifications | own | own | own | own |
| Doctor directory (`/doctors`) | ✅ with contacts | ✅ with contacts | ✅ **without** email/phone | ✅ with contacts |
| Patients list / detail | all | only patients they have an appointment or chat with; only *their own* appointments with them | — | — |
| Create patient accounts | ✅ | — | — | — |
| Appointments | all; book for a patient | own (doctor portal); cancel/complete own `SCHEDULED` only | own; book; cancel own `SCHEDULED` only | — |
| Medical records | — | read/write for related patients | read own | — |
| Chat | — | related patients | any doctor (starts a relationship) | — |
| Invoices: view | all | related patients | own | — |
| Invoices: create, record payment | ✅ | related patients | — | — |
| Refund, cancel invoice, revenue, reports | ✅ | — | — | — |
| Pay online (Stripe checkout) | — | — | own invoices | — |
| Beds: view | all names | occupancy for all; names for own patients only | — | — |
| Beds: assign / release | ✅ | own patients only | — | — |
| Lab tests: view | all | related patients | — (_gap: see audit LAB-1_) | lab technicians: all |
| Lab tests: order | ✅ (any doctor) | related patients only | — | — |
| Lab tests: update status/results | ✅ | — | — | lab technicians only |
| Staff roster, shifts, openings, tasks, attendance, leave | ✅ | — | — | — |
| Staff portal (own shifts, apply, own tasks) | — | — | — | own |
| Emergency: raise / track | — | — | own | — |
| Emergency: view, update status, notes | ✅ | ✅ | — | nurses only |
| Emergency: assign team, priority | ✅ | ✅ | — | — |
| Platform settings, announcements (create) | ✅ | — | — | — |
| Review doctor/staff signups (account approvals) | ✅ | — | — | — |

**Self-signup and approval**: `doctor`, `patient` and `staff` can be chosen
at signup (or on the Google role picker); `admin` cannot. **Doctor and staff
accounts start `PENDING`** (`User.approvalStatus`):

- Until an admin approves them, `JwtAuthGuard` rejects every route except
  the user's own `/users/me*` endpoints (`@AllowUnapproved`). The frontend
  shows them only a status page.
- Pending doctors are not listed in the directory, have no public profile,
  and can't be booked.
- Admins are notified once the applicant's email is verified, and review on
  **Account Approvals** (`/api/account-approvals`, admin-only).
- A decision is a conditional write, so two admins can't both act. It is
  audit-logged, and the applicant is notified in-app and by email. A
  rejection can include a reason shown to the applicant. A rejected request
  can later be approved.
- Patients and admin-created accounts are approved from the start.

Accounts that existed before approval was introduced were left `APPROVED`
by the migration's column default. To list self-registered professional
accounts for a one-off review:

```sql
SELECT id, email, role, "createdAt" FROM "User"
WHERE role IN ('DOCTOR', 'STAFF') AND "mustChangePassword" = false
ORDER BY "createdAt";
```

(Admin-created accounts start with `mustChangePassword = true` until first
sign-in, so this list can still include admin-created accounts that have
since changed their password. Treat it as a starting point.)

## Data handling

- **Money**: all totals, fees and balances are computed server-side, never
  taken from the client. Every write that moves money on an invoice
  (payment, refund, cancel, Stripe webhook) runs under a row lock
  (`billing/invoice-lock.ts`). Stripe webhooks are idempotent per
  PaymentIntent. Financial actions are audit-logged with the actor.
- **Card data** never touches this system: Stripe Checkout hosts payment
  entry.
- **Logs**: no passwords, tokens or one-time codes (in production). 5xx
  errors go to Sentry. Clients only ever see "Internal server error".

## Known open risks

See [PROJECT_AUDIT.md](PROJECT_AUDIT.md) §3 (items marked **Open** or
**Decision needed**): `Float` money columns,
unpaginated lists, chat images stored in the database, and no session
revocation on password change.
