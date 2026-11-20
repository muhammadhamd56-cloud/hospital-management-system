# Testing

## Backend (`backend/api`)

| Suite | Command | Needs |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | — |
| Lint | `npx eslint "{src,test}/**/*.ts"` (`npm run lint` also applies `--fix`) | — |
| Unit | `npm test` | — (Prisma, Stripe, Resend and the Ollama model server are mocked) |
| E2E | `npm run test:e2e` | local Postgres with the **test** DB from `.env.test` |

E2E suites boot the real Nest app against
`hospital_management_system_test` (never the dev or production DB; see
`test/setup-e2e.ts`). Migrate it first:

```bash
DATABASE_URL="<url from .env.test>" npx prisma migrate deploy --schema=../../database/api/schema.prisma
```

- `test/auth.e2e-spec.ts`: signup, OTP, login, lockout, MFA, password flows.
- `test/emergency.e2e-spec.ts`: emergency case lifecycle and role rules.
- `test/admin-ai.e2e-spec.ts`: Admin AI Copilot routes (auth and role, ownership, validation, SSE with a real beds tool, idempotent replay, provider failure, writes disabled). The model provider is faked, so no Ollama server is needed.
- `test/integrity.e2e-spec.ts`: **race conditions and cookie sessions**.
  It fires simultaneous payments and refunds at one invoice and asserts
  exactly one succeeds. It also checks logout with an expired access
  cookie, the CSRF header, and cookie-only reads. A deliberate delay is
  injected between the balance check and the insert so unlocked requests
  reliably interleave: removing the row lock makes these tests fail (5 of
  5 payments recorded; $400 refunded on a $100 payment).

## Frontend (`frontend`)

| Suite | Command |
|---|---|
| Typecheck + build | `npm run build` |
| Lint | `npm run lint` (44 pre-existing `react-hooks` errors; non-blocking in CI) |
| Unit/component | `npm test` (Vitest + Testing Library, jsdom) |

## Running on Windows

On a memory-constrained Windows machine, Jest's and Vitest's default
child-process workers can fail to start (`spawn UNKNOWN`, "Worker exited
unexpectedly"). Those are environment failures, not test failures. Use:

```bash
npx jest -i                                   # backend unit, in-band
npx vitest run --pool=threads --maxWorkers=1  # frontend
```

The bcrypt-heavy auth e2e tests (MFA lifecycle, password change) can exceed
their 5s/20s timeouts when the machine is also running other test
processes. Run them on their own (`npx jest --config ./test/jest-e2e.json
--runInBand test/auth.e2e-spec.ts`).

## CI

`.github/workflows/ci.yml` runs, for the backend: lint → unit →
`migrate deploy` (a Postgres 16 service) → e2e → build. For the frontend:
lint (non-blocking) → tests → build. The frontend build's deploy guard only
runs on Vercel (`VERCEL=1`), so CI builds aren't affected by the
`vercel.json` placeholder.
