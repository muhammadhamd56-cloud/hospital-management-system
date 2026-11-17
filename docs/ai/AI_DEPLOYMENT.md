# MediCore Admin AI: deployment, configuration and rollback

## Environment variables (backend only, on Render)

| Variable | Default | Notes |
|---|---|---|
| `ADMIN_AI_ENABLED` | `false` | Master switch. When false, `/api/admin-ai/*` returns 404 and admins keep the old assistant. `AI_ENABLED` is accepted as an alias. |
| `AI_PROVIDER` | `anthropic` | Adapter key. |
| `AI_MODEL` | `claude-opus-5-5` | Any model the adapter supports. |
| `AI_API_KEY` | — | Falls back to `ANTHROPIC_API_KEY`. Never exposed to the frontend. |
| `AI_MAX_OUTPUT_TOKENS` | `4096` | Per model call. |
| `AI_REQUEST_TIMEOUT` | `90000` | Milliseconds of wall clock per message. |
| `AI_MAX_TOOL_CALLS` | `12` | Per message. |
| `AI_MAX_ITERATIONS` | `8` | Model round trips per message. |
| `AI_RUN_TOKEN_BUDGET` | `150000` | Tokens per message. |
| `AI_DAILY_BUDGET` | `500000` | Tokens per admin per UTC day; `0` means unlimited. |
| `AI_ALLOW_PHI` | `false` | Keep false until the compliance review is approved. |
| `AI_ENABLE_WRITES` | `false` | Proposal tools and approvals. Enable only after staging sign-off. |
| `AI_RAG_ENABLED` | `false` | Reserved; nothing is implemented yet. |
| `AI_PROPOSAL_TTL_MINUTES` | `15` | How long a proposal can be approved. |
| `AI_MAX_RETRIES` | `2` | SDK retries on 429 and 5xx responses. |

No frontend variables are needed. The UI discovers the feature through `GET /api/admin-ai/status`.

## Rollout

1. **Deploy the code with every flag at its default.** The feature is invisible, so this is safe on its own.
2. **Apply the database migration.** Render's start command already runs `prisma migrate deploy` (`npm run prisma:deploy` does the same manually). The migration only creates tables, enums and indexes. Never use `migrate reset` or `db push` against production.
3. **Turn the feature on read-only.** Set `AI_API_KEY` and `ADMIN_AI_ENABLED=true`, keeping `AI_ENABLE_WRITES=false` and `AI_ALLOW_PHI=false`. Redeploy.
4. **Verify:**
   - `GET /api/health` returns 200.
   - Signed in as an admin, `GET /api/admin-ai/status` reports `providerConfigured: true`.
   - The Copilot button appears. Ask "What is the current bed occupancy?" and check that the answer streams in progressively.
   - **SSE through Vercel:** if the answer arrives all at once instead of progressively, the rewrite is buffering. The feature still works but without live streaming. Check the response headers for `content-type: text/event-stream`.
   - `GET /api/admin-ai/usage` shows the run.
   - Non-admin accounts get 403. The Render logs show one `ai_run` JSON line per message, with no message text in it.
5. **Turn on writes later, if wanted.** After staging tests of approve, reject, expire and replay with real admin accounts, set `AI_ENABLE_WRITES=true`. Start with one admin team, and review the `AuditLog` rows where `entityType = 'AiActionProposal'`.

## Rollback

| Situation | Action |
|---|---|
| Disable quickly | Set `ADMIN_AI_ENABLED=false` and redeploy (or restart). The UI falls back automatically, and no data is touched. |
| Stop writes only | Set `AI_ENABLE_WRITES=false`. Pending proposals can no longer be approved (403), and they expire on their own. |
| Revert code | Redeploy the previous commit. The AI tables are additive and unused by other code, so they can stay. |
| Remove AI tables (optional, irreversible) | Back up first. Then drop `AiFeedback`, `AiToolInvocation`, `AiActionProposal`, `AiMessage`, `AiRun` and `AiConversation`, and the enums `AiMessageRole`, `AiRunStatus`, `AiToolStatus`, `AiProposalStatus` and `AiFeedbackRating`. Write this as a new forward migration; never edit or delete the applied one. |

## Known deployment caveat (pre-existing)

`render.yaml` starts `node dist/main`, but `npm run build` currently emits `dist/src/main.js` (checked locally). Confirm the entry path on Render before relying on the blueprint. This was not changed here.
