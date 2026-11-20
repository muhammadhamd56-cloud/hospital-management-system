# MediCore Admin AI: architecture

The design is a modular monolith with one central orchestrator and a domain tool registry. It is one NestJS module (`backend/api/src/admin-ai`) inside the existing API. It uses the existing database, auth and domain services. The only extra piece is the model server: a local [Ollama](https://ollama.com) instance that the backend calls over HTTP.

```
React DashboardLayout
  └─ AdminCopilot (admins only; renders nothing if the feature is off)
       │  POST /api/admin-ai/conversations/:id/messages   (cookie session + CSRF, SSE response)
       ▼
AdminAiController ── AdminAiEnabledGuard → JwtAuthGuard → RolesGuard(ADMIN) → ValidationPipe
       ▼
AiOrchestratorService.prepare()   ownership · idempotency · one active run · provider configured · daily budget
AiOrchestratorService.execute()   bounded loop: iterations · tool calls · tokens · wall clock · cancellation
   ├─ prompt-registry (versioned system prompt)      ├─ context-builder (history + request context)
   ├─ intent-router (domain hint only)               ├─ AiPolicyService (permissions from the session)
   ├─ ModelGatewayService ──► OllamaModelProvider ──► Ollama POST {AI_BASE_URL}/api/chat (local model)
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
| Provider gateway | `providers/model-provider.interface.ts`, `providers/model-gateway.service.ts`, `providers/adapters/ollama.provider.ts` |
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

## Data model (additive migrations `20261117183437_admin_ai_copilot` and `20261118164101_fk_indexes_and_ai_message_run`)

| Model | Holds |
|---|---|
| `AiConversation` | Owner, title, last module |
| `AiMessage` | USER/ASSISTANT text, run id (a foreign key to `AiRun`, `SetNull`, since migration `20261118164101_fk_indexes_and_ai_message_run`) |
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

The gateway selects the adapter named by `AI_PROVIDER` (default `ollama`, the only registered adapter). `OllamaModelProvider` (`providers/adapters/ollama.provider.ts`) talks to a local Ollama server with native `fetch`; there is no SDK:

- It streams `POST {AI_BASE_URL}/api/chat` with `stream: true`. Ollama answers with newline-delimited JSON, and each text delta is fed into SSE as it arrives.
- It sends the system prompt as a `system` message, the tool specs as `function` tools, and `options.num_predict` (`AI_MAX_OUTPUT_TOKENS`) and `options.num_ctx` (`AI_CONTEXT_TOKENS`, default 16384, because Ollama's small default context would truncate the prompt and tool schemas).
- Ollama tool calls carry no id, so the adapter generates one per call (`ollama_call_<n>`). It stores the assistant turn with those ids and, when replaying history, sends each tool result as a `tool` message named by `tool_name`.
- `Authorization: Bearer <AI_API_KEY>` is sent only when a key is set, for an Ollama behind an authenticating proxy.
- It retries a refused connection and 429/5xx responses (`AI_MAX_RETRIES`, default 2, exponential back-off from 500 ms) before any output is read. A stream that fails midway is not retried, because the admin has already seen part of the answer.
- Errors are normalised to `AiProviderError` codes: an unreachable server becomes `unavailable` ("Check that Ollama is running"), HTTP 404 becomes "model not available, pull it with Ollama first", 401/403 become `auth`, 429 `rate_limited`.
- `isConfigured()` is true when `AI_BASE_URL` is a valid http(s) URL and `AI_MODEL` is set. It does not contact the server.

**Where the data goes.** The model runs on the machine that runs Ollama, so prompts, history and tool results stay there unless `AI_BASE_URL` points at another host. PHI masking still applies by default (`AI_ALLOW_PHI=false`).

**Not verified live yet.** The adapter is covered by `providers/ollama.provider.spec.ts` with a mocked `fetch`; no run against a real Ollama server has been made. The default model `llama3.1:8b` is a placeholder until a hardware check picks one, and the chosen model must support tool calling.

To add another provider, implement `AiModelProvider` and add it to `MODEL_PROVIDERS` in `admin-ai.module.ts` (and to `SUPPORTED_AI_PROVIDERS` in `domain-tools/settings.ai-tools.ts`, which the settings consistency check uses).
