# MediCore Admin AI: implementation plan

Order of work: discovery → foundation → intelligence → interface → enterprise controls → production readiness. The first production release runs with read-only tools. Proposals stay disabled until the approval workflow has been signed off in staging.

| Phase | Scope | Status |
|---|---|---|
| 0 Discovery | Audit the codebase, decide what to reuse, list risks and gaps | Done (AI_EXISTING_SYSTEM_AUDIT.md) |
| 1 AI module | `src/admin-ai` structure, dependency injection, typed config, guards | Done |
| 2 Prisma | 6 models and 5 enums; additive migration; indexes, unique constraints, pagination | Done; applied to the local dev and test databases |
| 3 Provider gateway | Provider-neutral interface, model adapter, error normalisation, timeouts, retries, env flags. Since 2026-11-20 the adapter is `OllamaModelProvider` (local model over Ollama's HTTP API), replacing the original hosted-API adapter | Done (mock-verified; no live Ollama run yet) |
| 4 Orchestrator | Bounded loop with budgets, cancellation, idempotency, rate limits, ownership, reply validation | Done |
| 5 Tool registry and 15 domains | Typed registry, dispatcher, 46 tools over existing services | Done |
| 6 Security | Admin-only guards, policy engine, input/output allowlists, PHI masking, injection boundaries, audit | Done (AI_SECURITY_PLAN.md) |
| 7 React Copilot | Side panel, history, SSE streaming, tool status, proposals, feedback, copy, retry, a11y, responsive | Done |
| 8 Human approval | Proposal → hash-bound approval → CAS claim → re-validation → domain service → audit | Done; behind `AI_ENABLE_WRITES=false` |
| 9 RAG | Policy and SOP retrieval | **Not implemented.** Blocked on two external decisions (see below). Flag reserved. |
| 10 Async jobs | BullMQ + Redis only where justified | **Deliberately not added.** No current workload needs it (see below). |
| 11 Observability | Structured run logs, usage endpoint, cost estimate, trace via runId | Done |
| 12 Testing | Unit, e2e (HTTP + SSE + real domain tool), security cases, frontend, regression | Done (results in AI_PROGRESS.md) |
| Next: hardware check and model choice | Check the target machine, pick a tool-capable Ollama model that fits it, set `AI_MODEL` and `AI_CONTEXT_TOKENS`, then run the copilot live against it | **Partly done (2026-11-20).** Ollama installed, models benchmarked, defaults set to `qwen2.5:3b` with an 8k context and a 5 min timeout (see `AI_DEPLOYMENT.md`). The copilot has not yet been run end to end against Ollama |
| Later: Local AI Bridge | Let the Render-hosted API reach a self-hosted Ollama | **Planned.** Until then Render keeps `ADMIN_AI_ENABLED=false` |

## Phase 9 (RAG): what is needed to proceed

1. **An embedding model.** Ollama can also serve embedding models locally (through its `/api/embed` endpoint), which would keep documents on the same machine as the chat model. A model has to be chosen and its retrieval quality checked; a hosted embedding vendor would instead need data-processing terms. No embedding code exists yet.
2. **pgvector on the target Postgres.** Neon supports `CREATE EXTENSION vector`, but the local Postgres 18 used for development does not have it installed. The migration must be verified on both.
3. **An approved corpus and an owner.** Policies and SOPs only, with access metadata and a review process. No patient records.

Proposed design once these are unblocked:

- **Storage:** `KnowledgeDocument` (source, version, access roles, status) and `KnowledgeChunk` (text, `vector`, metadata) in the same database.
- **Ingestion:** an admin upload, then validation, chunking and embedding, then storage.
- **Retrieval:** a `knowledge.search` read tool that filters by access metadata and returns chunks with source references. Retrieved text travels as `tool_result` data, under the existing injection boundary.
- **Lifecycle:** retiring a document removes it from retrieval.

## Phase 10 (async jobs): rationale

Every current tool finishes within its 15-second per-tool timeout over existing service calls. Reports are assembled in-request and capped at 100 rows per section. Adding Redis and BullMQ now would add infrastructure and failure modes with no measured need. Two things would justify revisiting this: RAG ingestion and embedding, and multi-thousand-row exports. When that happens, queue payloads must carry ids only, never patient data or tokens.
