# MediCore Admin AI: progress log

Branch: `feature/admin-ai`, based on `hardening/security-billing-approvals` at `0500ae4` (since merged to `main` as PR #2).

## Update 2026-11-20: local model through Ollama

On branch `feature/admin-ai-ollama` the copilot was kept, but its model provider changed:

- The hosted-API adapter and its spec were deleted, and the SDK dependency was uninstalled. The new adapter is `providers/adapters/ollama.provider.ts`, tested by `providers/ollama.provider.spec.ts` (mocked `fetch`). It streams Ollama's `POST /api/chat`, generates its own tool-call ids, and sends `num_predict` and `num_ctx`.
- Config: `AI_PROVIDER` defaults to `ollama`, `AI_MODEL` to `qwen2.5:3b` (picked from a benchmark on the target laptop, see `AI_DEPLOYMENT.md`), `AI_REQUEST_TIMEOUT` to 5 minutes, and there are two new variables, `AI_BASE_URL` (default `http://localhost:11434`) and `AI_CONTEXT_TOKENS` (default 8192). `AI_API_KEY` is optional, for an Ollama behind an authenticating proxy.
- The settings tool now reports `modelServerConfigured` and flags an invalid `AI_BASE_URL`.
- The separate navigation assistant for the other roles was removed. `DashboardLayout` renders `<AdminCopilot/>` for admins only, and the copilot renders nothing when the feature is off.
- `render.yaml` keeps `ADMIN_AI_ENABLED=false`, because Render cannot reach an Ollama on a local machine.
- **Not done yet:** a live run against a real Ollama server, and the hardware check and model choice. The test results further down were recorded on 2026-11-17/18, before this switch, and have not been re-run for this update.

## Status by phase

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery | ✅ | AI_EXISTING_SYSTEM_AUDIT.md |
| 1 Module foundation | ✅ | `backend/api/src/admin-ai`, registered in `AppModule` |
| 2 Prisma | ✅ | Migration `20261117183437_admin_ai_copilot` (additive). Applied to the local dev and test databases; **not applied to production**. |
| 3 Provider gateway | ✅ (mock-verified) | Now the Ollama adapter. No Ollama server has been run against yet, so a **live provider call has not been verified**. |
| 4 Orchestrator | ✅ | |
| 5 Tool registry and 15 domains | ✅ | 46 tools (39 read, 7 propose), 6 actions |
| 6 Security | ✅ | AI_SECURITY_PLAN.md |
| 7 React Copilot | ✅ | Shown to admins only, and only when the feature is enabled |
| 8 Approval workflow | ✅ (flag off) | |
| 9 RAG | ⛔ Blocked | Needs an embedding provider decision and pgvector (AI_IMPLEMENTATION_PLAN.md) |
| 10 Async | ➖ Not needed yet | Rationale in AI_IMPLEMENTATION_PLAN.md |
| 11 Observability | ✅ | Structured `ai_run` logs and `GET /api/admin-ai/usage`. There is no separate usage page; the data is available through the API. |
| 12 Testing | ✅ | See below |

## Files

**Created, backend (`backend/api/src/admin-ai/`):**

- Core: `admin-ai.module.ts`, `admin-ai.controller.ts`, `admin-ai.config.ts`, `admin-ai-enabled.guard.ts`, `dto/admin-ai.dto.ts`, `core/*`, `control-plane/ai-policy.service.ts`.
- Providers: `providers/*` (interface, gateway, `adapters/ollama.provider.ts`).
- Tools: `tools/*` (types, registry, dispatcher), and `domain-tools/*` (15 providers plus 2 shared helper files).
- Workflows, data and monitoring: `workflows/ai-proposal.service.ts`, `persistence/ai-store.service.ts`, `security/phi-masker.ts`, `observability/ai-metrics.service.ts`, `testing/admin-ai-test-utils.ts`.
- Tests: 7 spec files, plus `test/admin-ai.e2e-spec.ts`.

**Created, frontend (`frontend/src/features/adminCopilot/`):** `api.ts`, `sse.ts`, `modules.ts`, `useCopilot.ts`, `AdminCopilot.tsx`, `ProposalCard.tsx`, `Markdown.tsx`, and 2 test files.

**Created, other:**

- `database/api/migrations/20261117183437_admin_ai_copilot/migration.sql`
- the documentation in `docs/ai/*.md`

**Modified, all small and additive:**

| File | Change |
|---|---|
| `database/api/schema.prisma` | AI models, plus 5 relation fields on `User`. `prisma format` also realigned whitespace on existing lines. |
| `backend/api/src/app.module.ts` | Imports `AdminAiModule` |
| `backend/api/src/config/configuration.ts` | `adminAi` config section |
| `emergency`, `announcements`, `patients`, `doctors`, `beds`, `laboratory`, `reports` and `staff` `*.module.ts` | `exports: [<Service>]` |
| `staff-scheduling.module.ts` | Also exports `StaffService`, `AvailabilityService` and `AttendanceService` |
| `backend/api/package.json` and lockfile | Adds `zod` (now `^4.6.7`; the frontend declares `^4.4.3`) |
| `backend/api/.env.example` | AI placeholders (Ollama: `AI_BASE_URL`, `AI_MODEL`, `AI_CONTEXT_TOKENS`, optional `AI_API_KEY`) |
| `render.yaml` | Admin AI variables, with `ADMIN_AI_ENABLED="false"` |
| `frontend/src/lib/apiClient.ts` | Exports `fetchWithSession` and `toApiError`. `request()` now uses `fetchWithSession`, with identical behaviour. |
| `frontend/src/layouts/DashboardLayout.tsx` | Admins get `<AdminCopilot/>`; no other role gets an AI widget |

No existing API route, response shape, business rule or test was changed.

## APIs added (all under `/api/admin-ai`, ADMIN only)

| Method and path | Purpose |
|---|---|
| `GET /status` | Feature, provider and flag status (no secrets) |
| `GET /capabilities` | Tool catalogue |
| `GET/POST /conversations` | List (cursor pagination) or create |
| `PATCH/DELETE /conversations/:id` | Rename or delete (owner only) |
| `GET /conversations/:id/messages?before=` | Paginated history |
| `POST /conversations/:id/messages` | Send a message; the response is an SSE stream |
| `GET /conversations/:id/proposals`, `GET /proposals/:id` | Proposals |
| `POST /proposals/:id/approve` `{paramsHash}` and `POST /proposals/:id/reject` `{note?}` | Decide |
| `POST /messages/:id/feedback` `{rating}` | Feedback |
| `GET /usage?days=` | Usage, latency, tokens, cost estimate, tool stats, approvals, feedback |

## Test results (actual runs, 2026-11-17/18, before the Ollama switch)

| Suite | Result |
|---|---|
| Backend unit (all) | **801 passed, 1 failed** of 802. The failure is `MfaService › confirmSetup` timing out at 5 s. It is untouched pre-existing code: 9 password hashes take about 6.8 s on this machine, and it passes 19/19 with `--testTimeout=30000`. It is a performance issue on this machine, not a regression. |
| Backend Admin AI unit tests | 117/117 (7 suites: core, tools, proposals, orchestrator, provider, group-a, group-b) |
| Backend e2e (all) | **92/92**: the 86 existing plus 6 new Admin AI tests covering auth/role, ownership, validation, SSE with a real beds tool and persistence, idempotent replay, provider failure, and writes-disabled |
| Backend `tsc --noEmit` / eslint (AI files) | Clean / clean |
| Frontend vitest (all) | **168/168**: 158 existing plus 10 new |
| Frontend `tsc` | Clean |
| Frontend eslint | 55 problems, matching the pre-existing baseline exactly; none in new files |
| Live smoke test (built API, local, previous provider) | Unauthenticated 401. Admin `status` 200. Create conversation 201. Send message 503 "provider not configured", as expected with no provider set up. Catalogue: 39 read tools across 15 domains. |

**Security cases covered by automated tests:**

- direct and indirect prompt injection
- privilege escalation via a body `role`/`userId`, and via a tool the caller isn't permitted
- cross-admin conversation, feedback and proposal access
- malicious or oversized tool arguments (values never echoed)
- output allowlist stripping and PHI masking
- excessive tool calls, iterations and tokens
- replayed, expired, modified and foreign approvals
- writes disabled
- secret redaction
- unsafe Markdown and links

**Not automated:** visual and responsive checks in a real browser, beyond component tests. The panel is full-width under 640 px and 30 rem wide above.

## Known gaps and limitations

1. **No live provider verification.** It needs a running Ollama with a tool-capable model pulled; the model is still to be chosen.
2. **No appointment rescheduling.** No domain service exists, so no proposal is offered.
3. **No doctor working-hours model.** `findAvailableSlots` uses an explicit window (default 09:00–17:00) and says so.
4. **Narrow direct Prisma read.** `AdminAppointmentResponse` lacks `patientId` and `doctorId`, so a read-only, ids-only lookup restricted to service-returned rows is used. Recommended fix: add those two fields to the response.
5. **Data the services don't keep:**
   - No bed history, so occupancy is point-in-time only.
   - Emergency analytics are fixed at 30 days.
   - Announcements are capped at the 50 most recent by the service.
   - `ReportsService` appointment figures have no date filter.
   - Refund dates aren't in invoice responses.
6. **Leave dates assume a UTC server.** Leave is stored at local midnight while shifts use UTC midnight. This is pre-existing domain behaviour.
7. **One shift per proposal.** `scheduling.proposeShiftPlan` proposes a single shift; there is no batch.
8. **No finer admin scopes.** The HMS has no sub-admin roles, so every approved admin gets the same AI read set.
9. **No dedicated usage page.** The usage data is available through the API only.
10. **RAG not implemented.** See the implementation plan.
11. **Not usable on Render yet.** Render cannot reach an Ollama on a local machine; a "Local AI Bridge" is planned.

## Deployment requirements

See AI_DEPLOYMENT.md. In short:

1. Run `prisma migrate deploy` (Render does this on start).
2. Install Ollama, `ollama pull <model>` (a tool-capable model), and set `AI_BASE_URL`, `AI_MODEL` and `ADMIN_AI_ENABLED=true` on a backend that can reach it.
3. Keep `AI_ENABLE_WRITES=false` and `AI_ALLOW_PHI=false`.
4. Verify SSE streaming through any proxy in front of the backend.
