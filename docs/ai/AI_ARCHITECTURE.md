# MediCore Admin AI: architecture

The design is a modular monolith with one central orchestrator and a domain tool registry. It is one NestJS module (`backend/api/src/admin-ai`) inside the existing API. It uses the existing database, auth and domain services, and runs no new infrastructure.

```
React DashboardLayout
  └─ AdminCopilot (admins only; falls back to AssistantWidget if the feature is off)
       │  POST /api/admin-ai/conversations/:id/messages   (cookie session + CSRF, SSE response)
       ▼
AdminAiController ── AdminAiEnabledGuard → JwtAuthGuard → RolesGuard(ADMIN) → ValidationPipe
       ▼
AiOrchestratorService.prepare()   ownership · idempotency · one active run · provider configured · daily budget
AiOrchestratorService.execute()   bounded loop: iterations · tool calls · tokens · wall clock · cancellation
   ├─ prompt-registry (versioned system prompt)      ├─ context-builder (history + request context)
   ├─ intent-router (domain hint only)               ├─ AiPolicyService (permissions from the session)
   ├─ ModelGatewayService ──► AnthropicModelProvider (AI_PROVIDER; adapters are swappable)
   └─ ToolDispatcherService
        resolve → authorize → zod-validate input → execute with timeout → output allowlist → record/audit
        ├─ read tools ─────────► existing domain services (BedsService, BillingService, …)
        └─ propose tools ──────► AiProposalService (PENDING proposal; nothing changes)
                                    approve(hash) → CAS claim → re-validate → domain service → audit
Persistence: AiConversation · AiMessage · AiRun · AiToolInvocation · AiActionProposal · AiFeedback (+ existing AuditLog)
Observability: AiMetricsService (structured run log, usage endpoint)
```

## Components (file → responsibility)

| Component | File |
|---|---|
| Config and feature flags | `admin-ai.config.ts` (loaded as `adminAi` in `config/configuration.ts`) |
| HTTP API and SSE | `admin-ai.controller.ts`, `dto/admin-ai.dto.ts`, `admin-ai-enabled.guard.ts` |
| Orchestrator | `core/ai-orchestrator.service.ts` |
| Prompt registry | `core/prompt-registry.ts` (version saved on every `AiRun.promptVersion`) |
| Context builder and intent router | `core/context-builder.ts`, `core/intent-router.ts` |
| Policy engine and permission resolver | `control-plane/ai-policy.service.ts` |
| Provider gateway | `providers/model-provider.interface.ts`, `providers/model-gateway.service.ts`, `providers/adapters/anthropic.provider.ts` |
| Tool registry and dispatcher | `tools/ai-tool.types.ts`, `tools/ai-action.types.ts`, `tools/tool-registry.service.ts`, `tools/tool-dispatcher.service.ts` |
| 15 domain namespaces | `domain-tools/<domain>.ai-tools.ts` |
| Human approval workflow | `workflows/ai-proposal.service.ts` |
| Persistence | `persistence/ai-store.service.ts` |
| PII/PHI filter | `security/phi-masker.ts` |
| Metrics and usage | `observability/ai-metrics.service.ts` |
| Frontend | `frontend/src/features/adminCopilot/*` (API and SSE client, hook, panel, proposal card, safe Markdown) |

## Request lifecycle

1. The client sends `{message, activeModule, requestKey}`. `activeModule` is UI context only.
2. `prepare()` runs these checks, and any failure is a normal JSON error:
   - The caller is an approved admin.
   - The conversation belongs to them (otherwise 404).
   - If the request key was already used, the finished run is replayed, or the request gets a 409 if that run is still going.
   - No other run is active in the conversation.
   - The provider is configured (otherwise 503).
   - The daily token budget isn't used up (otherwise 429).
3. The response switches to `text/event-stream`. A heartbeat keeps the connection alive, and closing the connection aborts the run.
4. `execute()` creates an `AiRun`, saves the user message, builds the messages and offers only permitted tool specs. It then loops:
   - The model call streams `text` events.
   - Tool calls run through the dispatcher, sending `tool` start/end events and a `proposal` event where relevant.
   - Tool results go back as `tool_result` blocks.

   The loop stops on a final answer, a refusal or a budget limit.
5. The reply is validated (secrets redacted, size bounded, never empty), saved, and the run is closed with tokens, tool calls, latency and status. The run ends with a `done` event, or an `error` event on failure.

**SSE event types:** `run`, `text`, `tool`, `proposal`, `done`, `error`.

## Tool contract

Every tool declares:

- `name`, in the form `<domain>.<action>`; it is sent to the model as `<domain>__<action>`.
- `domain` and `description`.
- A zod `input` schema, also exported as JSON Schema.
- A zod `output` allowlist.
- `mode`: `read` or `propose`.
- `permission`: `ai.<mode>.<domain>`.
- Optional `timeoutMs` and `audit`.

The registry refuses to boot on malformed, mis-namespaced or duplicate definitions.

**Execution classes:**

- **Class A (`read`):** runs automatically once authorized.
- **Class B (`propose`):** only creates an `AiActionProposal`. The matching `AiActionHandler` (`preview`, `execute`) runs after approval and calls the existing service, so that service's own validation, transactions and conflict checks apply.

## Capability catalogue

There are 46 tools (39 read, 7 propose) and 6 approvable actions.

| Domain | Tools | Approvable action |
|---|---|---|
| dashboard | getOverview, compareMetrics | — |
| emergency | getActiveIncidents, summarizeOperationalActivity | — (operational only, no clinical actions) |
| announcements | listRecent, preparePublish | announcements.publish |
| patients | searchPatients, getAdministrativeSummary (both audited) | — |
| doctors | listDoctors, getAvailability, getWorkload, findScheduleConflicts | — |
| appointments | searchAppointments, getAppointmentTrends, findConflicts, findAvailableSlots | — (no reschedule service exists) |
| beds | getAvailability, getOccupancy, findDiscrepancies, prepareAssignment | beds.assign |
| laboratory | getOperationalStatus, getPendingTests | — (results never exposed) |
| billing | getFinancialSummary, getOutstandingInvoices, comparePeriods, findDiscrepancies | — (financial actions never executed by AI) |
| reports | listReportTypes, prepareReport | — |
| staff | getStaffOverview, getWorkloadSummary, listDepartments | — |
| approvals | getPendingApplications, findMissingInformation, explainRequirements, prepareDecision | approvals.review |
| scheduling | listShifts, detectConflicts, findCoverageGaps, proposeShiftPlan | scheduling.createShift (never overwrites) |
| profile | getAdminProfile, explainFields, prepareProfileUpdate | profile.update (caller's own id only) |
| settings | getConfiguration, findInconsistencies, prepareConfigurationChange | settings.updateConsultationMargin |

## Data model (additive migration `20261117183437_admin_ai_copilot`)

| Model | Holds |
|---|---|
| `AiConversation` | Owner, title, last module |
| `AiMessage` | USER/ASSISTANT text, run id |
| `AiRun` | Idempotency key (unique per user), status, provider, model, prompt version, token counts, tool calls, latency, error code |
| `AiToolInvocation` | Tool, domain, status, argument names only, duration |
| `AiActionProposal` | Action, params plus SHA-256 hash, status, expiry, decider, result |
| `AiFeedback` | Up/down, one per message per user |

Design choices kept on purpose:

- **Approval history** lives on the proposal row (decidedBy, decidedAt, note), since each proposal is decided once. There is no separate approval table.
- **Audit events** go to the existing `AuditLog`. There is no parallel audit table.
- **Prompt versions** live in code and are recorded per run, so there is no prompt table.
- **Tool results are never stored.**

## Provider

The gateway selects the adapter named by `AI_PROVIDER`. The Anthropic adapter is built on the official `@anthropic-ai/sdk` 0.122:

- It uses `beta.messages.stream`, with streaming text deltas fed into SSE.
- It sets `output_config.effort: "medium"`. The default model `claude-opus-5-5` always uses adaptive thinking, so no `thinking` parameter is sent.
- The system block uses ephemeral prompt caching.
- On models that support it, it enables the server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
- The SDK's bounded retries (`AI_MAX_RETRIES`, default 2) handle 429 and 5xx responses.
- Errors are normalised to `AiProviderError` codes.

To add another provider, implement `AiModelProvider` and add it to `MODEL_PROVIDERS` in `admin-ai.module.ts`.
