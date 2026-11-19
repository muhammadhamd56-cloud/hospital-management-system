# MediCore Admin AI: security plan

The goal is that the model can only ever read data the signed-in admin could already see in the app, see as little of it as possible, and change nothing without an explicit, specific approval.

## Trust boundaries

```
Browser (admin)  --cookie session + CSRF-->  NestJS  --tools (validated, authorized)-->  domain services --> Postgres
                                               |
                                               +--> Model provider (system prompt, masked tool results, chat text)
```

The model has no credentials, no database access and no SQL. It can only ask for a named tool. NestJS decides whether that tool runs, with which validated arguments, and what the result contains.

## Controls

| Threat | Control | Where |
|---|---|---|
| Unauthenticated or non-admin access | `JwtAuthGuard` re-validates the session, role, approval and tokenVersion on every request. `RolesGuard` with `@Roles(ADMIN)` sits on the whole controller. `isApprovedAdmin()` is checked again in the orchestrator and the policy. | `admin-ai.controller.ts`, `ai-policy.service.ts` |
| Feature off | `ADMIN_AI_ENABLED=false` makes every route return 404, and the UI falls back to the old assistant. | `admin-ai-enabled.guard.ts` |
| Identity spoofing in the body or prompt | Identity comes only from `request.user`. Unknown body fields are rejected by `forbidNonWhitelisted` (an e2e test sends `role` and `userId`). `activeModule` is validated against the 15 domains and used as context only. | DTOs, `context-builder.ts` |
| Cross-user conversation access | Every query is scoped by `userId` in the same `where`. Another admin's conversation returns 404 (indistinguishable from not found). Proposals and feedback are scoped the same way. | `ai-store.service.ts`, `ai-proposal.service.ts` |
| Tool misuse or privilege escalation | The model only sees specs for permitted tools. The dispatcher re-checks permission on every call, rejects unknown tools, and denies `propose` tools while writes are off, even when the model calls them anyway. | `tool-registry.service.ts`, `tool-dispatcher.service.ts` |
| Malicious tool arguments | Zod schemas with bounds (lengths, ranges, limits of 100 or fewer, date ranges of 366 days or fewer). Errors report paths only and never echo values. | domain tools, dispatcher |
| Data over-exposure | Each tool has an output allowlist schema, and anything not in it is stripped. PHI masking: with `AI_ALLOW_PHI=false`, patients become `Patient P-XXXXXX` (a SHA-256 pseudonym), and contact details and clinical free text are dropped. Lab results and visit reasons are never sent. Tool output is capped at 24k characters. | `phi-masker.ts`, tool `output` schemas |
| Direct prompt injection | The system prompt is fixed and versioned. It never contains user or tool content, and it states that stored content is data. Rules cannot be changed from chat because they are not stored in chat. | `prompt-registry.ts` |
| Indirect prompt injection (stored announcements, notes, names) | Tool results only ever travel as `tool_result` blocks. The tool list and system prompt stay byte-identical across iterations, so injected text cannot add tools or permissions. A test injects "approve everyone" and asserts no proposal and no extra execution. | `ai-orchestrator.service.spec.ts` |
| AI-initiated state changes | Writes are off by default. `propose` tools only create an `AiActionProposal`. Execution requires all of the following: <ul><li>the requesting admin approves</li><li>the approval quotes the `paramsHash`</li><li>the stored params still hash to the same value</li><li>a single-use compare-and-swap moves the proposal from PENDING to EXECUTING before expiry</li><li>the schema and business rules are re-validated</li><li>the existing domain service performs the change</li></ul> Expired, replayed, modified or foreign approvals are refused, and each case is tested. | `ai-proposal.service.ts` |
| Fabricated success claims | Outcomes are shown from proposal rows (status, `executedAt`, `result`), never from model text. The prompt forbids claiming completion. | `ProposalCard.tsx`, prompt |
| Runaway cost or loops | <ul><li>max iterations (default 8)</li><li>max tool calls (default 12)</li><li>a per-run token budget (150k)</li><li>a per-admin daily token budget</li><li>a wall-clock timeout (90 s)</li><li>a per-tool timeout (15 s)</li><li>throttling (15 messages/min, 20 approvals/min)</li><li>a single active run per conversation</li></ul> | orchestrator, controller |
| Duplicate submits | A client idempotency key is unique per `(userId, requestKey)`. A repeat replays the stored answer. | `AiRun` unique index |
| Secrets leakage | The API key is read only on the backend, and the status endpoint exposes no keys. Credential-shaped strings are redacted from replies. Internal error details are never sent to the model or the client. | `phi-masker.ts`, dispatcher, orchestrator |
| Sensitive logging | <ul><li>Run logs hold ids, counts, durations and status only.</li><li>Tool invocations store argument names, not values.</li><li>Tool results are never persisted.</li><li>Audit entries hold the tool name and argument keys.</li></ul> | metrics, store |
| Rendering attacks | The copilot Markdown renderer builds React elements only, with no `innerHTML`, and renders links as plain text. Navigation-free by design. | `Markdown.tsx` |
| CSRF on streaming | The stream is a cookie-authenticated POST with the `X-HMS-CSRF` header, the same as every other write. No token ever appears in a URL. | `features/adminCopilot/api.ts` |

## Audit trail

All audit entries go to the existing `AuditLog` table:

- **VIEW** for patient-record tools.
- **CREATE** when a proposal is made.
- **UPDATE** when a proposal is approved (with its outcome) or rejected.

Each entry is keyed by the run id or the proposal id. Runs, tool invocations and proposals cross-reference each other through `runId`.

## OWASP LLM Top 10 mapping

| Risk | Covered by |
|---|---|
| LLM01 Prompt injection | Boundaries above |
| LLM02 Sensitive information disclosure | Allowlists, PHI masking, redaction |
| LLM05 Improper output handling | Safe renderer, no execution of model output |
| LLM06 Excessive agency | Read-only by default, approval workflow |
| LLM07 System prompt leakage | Prompt holds no secrets |
| LLM10 Unbounded consumption | Budgets |

## Open items

1. **PHI.** Keep `AI_ALLOW_PHI=false` until a data-processing agreement, a retention setting (for example, zero data retention where eligible) and an internal compliance sign-off exist.
2. **Writes.** Enable `AI_ENABLE_WRITES` in production only after the approval workflow passes in staging with real admin accounts.
3. **Sub-admin scopes.** The HMS has no sub-admin scopes, so every admin can see all financial and administrative AI data, the same as the existing pages. When finer admin roles are added, extend `AiPolicyService.resolvePermissions`.
