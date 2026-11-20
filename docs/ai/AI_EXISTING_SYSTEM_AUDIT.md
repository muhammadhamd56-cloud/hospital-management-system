# MediCore Admin AI: existing system audit (Phase 0)

Discovery date: 2026-11-17. Discovery was read-only, and no application behaviour was changed during it. Baseline at commit `0500ae4`, measured in the previous session on that same commit:

| Suite | Result |
|---|---|
| Backend unit | 685/685 |
| Backend e2e | 86/86 |
| Frontend | 158/158 |

> **Later changes (2026-11-20).** This file is the Phase 0 snapshot. Since then the navigation assistant described below was removed, and the copilot's model provider moved from a hosted API to a local model served by Ollama. See AI_ARCHITECTURE.md and AI_DEPLOYMENT.md for the current design.

## 1. What exists

| Area | Finding |
|---|---|
| Frontend | React 19, Vite, react-router 8, Tailwind 4 with theme tokens (`brand-*`, `surface*`, `ink*`; dark mode via `.dark`), lucide-react icons, react-hot-toast, zod 4. No global state library: feature folders hold an `api.ts` plus local hooks. `lib/apiClient.ts` uses same-origin `/api` with httpOnly cookies, an `X-HMS-CSRF` header on writes, and refreshes once on a 401. |
| Layout | At discovery, `DashboardLayout` contained the Sidebar, the Navbar, `<Outlet/>` and a navigation assistant widget for every role (removed on 2026-11-20). Navigation lives in `constants/nav.ts` and routes in `constants/routes.ts`. |
| Admin modules | Dashboard, Emergency, Announcements, Patients, Doctors, Appointments, Beds, Laboratory, Billing, Reports, Staff, Account Approvals, Staff Scheduling, Profile, Settings. All 15 exist as pages. The Admin Dashboard has no backend module of its own: it composes billing, reports, beds and emergency endpoints. |
| Backend | NestJS 10 modular monolith under `backend/api/src/<domain>`. All routes sit under `/api`. Global pieces: a ValidationPipe (whitelist, forbidNonWhitelisted), `HttpExceptionFilter`, a `ResponseInterceptor` envelope (`{success, message, data}`), helmet, compression, the CSRF middleware, a `ThrottlerGuard` (120 requests/min) and Sentry. |
| Auth | `JwtStrategy` reads the cookie or a Bearer token and re-reads role, approval and `tokenVersion` on every request. Google OAuth is protected by a state cookie. MFA uses TOTP. `JwtAuthGuard` enforces approval status, and `RolesGuard` with `@Roles()` enforces the role. There is a single `ADMIN` role with no sub-admin scopes. |
| Data | Prisma 6 and PostgreSQL. The schema is in `database/api/schema.prisma`, with 17 sequential migrations. The `AuditLog` table (actions CREATE/UPDATE/DELETE/VIEW, an entity reference and JSON metadata) is used by the scheduling and emergency services. |
| Existing AI | At discovery, `src/assistant` was a navigation assistant built on a hosted model API, with role-scoped tools and no persistence. It was removed on 2026-11-20, together with its SDK dependency. |
| Tests | Jest unit specs next to the code, with Jest e2e against a dedicated test database (`.env.test`). The frontend uses Vitest with Testing Library. CI runs from `.github/workflows`. |
| Deployment | Frontend on Vercel, which rewrites `/api/*` to Render so cookies stay first-party. The backend's Render blueprint is `render.yaml`. The database is a Neon-compatible PostgreSQL. There is no Docker setup. |

## 2. Reused by the copilot (not duplicated)

These existing services are used through dependency injection. Most domain modules only needed an `exports:` entry added.

| Copilot domain | Services reused |
|---|---|
| Dashboard | BillingService (`overview`, `revenueThisMonth`, `monthlyRevenueTrend`), ReportsService, BedsService, EmergencyService (`analytics`), AppointmentsService |
| Emergency | EmergencyService (`listAll`, `analytics`) |
| Announcements | AnnouncementsService (`findAll`, `create`) |
| Patients | PatientsService (`findAll`, `findOne`) |
| Doctors | DoctorsService (`listDoctors`), AppointmentsService (`findAllForAdmin`) |
| Appointments | AppointmentsService |
| Beds | BedsService (`findAll`, `assign`) |
| Laboratory | LaboratoryService (`findAll`) |
| Billing | BillingService |
| Reports | ReportsService, plus the services above |
| Staff | StaffService, plus scheduling TasksService and ShiftsService |
| Approvals | AccountApprovalsService (`list`, `review`) |
| Scheduling | ShiftsService (including `assertNoSchedulingConflict`), AvailabilityService |
| Profile | UsersService (`findById`, `updateProfile`) |
| Settings | PlatformSettingsService |

Cross-cutting pieces that are reused:

- Guards: `JwtAuthGuard` and `RolesGuard`.
- The `ThrottlerGuard` decorators.
- `AuditLogService`, as the single audit store.
- `PrismaService`.
- The global validation and exception pipeline.
- The existing DTO classes (`CreateAnnouncementDto`, `ReviewAccountDto`, `CreateShiftDto`, `UpdateProfileDto` and others), which approval actions re-run through class-validator.

## 3. Created

- The backend module `src/admin-ai`, covering:
  - the orchestrator, the tool registry and dispatcher, and the policy
  - the provider gateway and its model adapter (now `OllamaModelProvider`, for a local Ollama server)
  - persistence, proposals and metrics
  - 15 domain tool providers.
- Six Prisma models and five enums. The migration is `20261117183437_admin_ai_copilot` and is additive only.
- The frontend feature `src/features/adminCopilot`, which admins see whenever the feature is enabled.
- The docs in `docs/ai/*`.

## 4. Integration risks and findings

1. **Existing API gaps the copilot cannot close without changing domain code:**
   - There is no appointment reschedule service; the only option is a patient-side cancel.
   - There is no doctor working-hours model.
   - Bed history is not recorded, so occupancy trends can't be computed.
   - There is no async job system, so `reports.getReportStatus` is not offered.

   Each is documented in AI_PROGRESS.md. No business logic was invented to cover them.
2. **`AdminAppointmentResponse` lacks `patientId` and `doctorId`.** The appointments and doctors tools add one narrow, read-only Prisma lookup (ids only), and only for rows the service already returned. The cleaner long-term fix is to add those two fields to the response.
3. **Compression and SSE.** The global `compression()` middleware would buffer event streams. The stream endpoint sends `Cache-Control: no-transform`, which compression respects.
4. **Vercel rewrite and SSE.** Streaming through Vercel's external rewrite to Render has not been verified in production. See AI_DEPLOYMENT.md for the check, and note that the client falls back cleanly if the stream drops.
5. **Pre-existing deployment risk (not introduced here).** `render.yaml` and the `start:prod` script start `node dist/main`, but a local `npm run build` emits `dist/src/main.js`. Verify the path on Render before relying on the blueprint. It was left unchanged because it is outside this scope. (Resolved since: `tsconfig.build.json` limits the build to `src/`, so it now emits `dist/main.js`.)
6. **The machine is memory-constrained.** Run tests with `jest -i` and `vitest --maxWorkers=1`, because the watch-mode Nest build runs out of memory.

## 5. Missing prerequisites (external)

- A reachable Ollama server with a tool-capable model pulled (`AI_BASE_URL`, `AI_MODEL`). None has been run against yet, so live-provider behaviour is verified only against mocks. The backend host must be able to reach it, which rules out the current Render deployment (see AI_DEPLOYMENT.md).
- A compliance decision before `AI_ALLOW_PHI=true`. With a local model this covers the machine that runs Ollama; third-party data-processing terms are only needed if `AI_BASE_URL` points at someone else's host.
- An embedding model choice and pgvector availability before any RAG work (Phase 9).
