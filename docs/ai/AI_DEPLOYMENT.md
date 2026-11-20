# MediCore Admin AI: deployment, configuration and rollback

The Admin AI Copilot runs on a **local model served by [Ollama](https://ollama.com)**. The backend calls Ollama's HTTP API (`POST {AI_BASE_URL}/api/chat`) directly with `fetch`; there is no AI SDK and no hosted model provider. The browser never talks to Ollama.

> **Status:** the Ollama adapter is covered by unit tests with a mocked `fetch`, and the e2e suite uses a fake provider. The default model (`qwen2.5:3b`, 8k context) was chosen from a benchmark against a real Ollama on the target machine (see [Choosing a model](#choosing-a-model)), but **the copilot itself has not yet been run end to end against Ollama**.

## Environment variables (backend only)

| Variable | Default | Notes |
|---|---|---|
| `ADMIN_AI_ENABLED` | `false` | Master switch. When false, `/api/admin-ai/*` returns 404 and the copilot button is not shown. `AI_ENABLED` is accepted as an alias. |
| `AI_PROVIDER` | `ollama` | Adapter key. `ollama` is the only registered adapter. |
| `AI_BASE_URL` | `http://localhost:11434` | The Ollama server, as seen from the backend. Must be an `http` or `https` URL; anything else leaves the provider "not configured" (503). A trailing slash is stripped. |
| `AI_MODEL` | `qwen2.5:3b` | An Ollama model tag that supports tool calling. It must already be pulled on the Ollama server (a missing model gives "model not available, pull it with Ollama first"). |
| `AI_API_KEY` | — | Optional. Sent as `Authorization: Bearer …` only when set, for an Ollama behind an authenticating proxy. A plain local Ollama needs none. Never exposed to the frontend. |
| `AI_CONTEXT_TOKENS` | `8192` | Sent as Ollama `options.num_ctx` (allowed 2048–262144). Ollama's own small default would truncate the system prompt and the tool schemas; larger values cost memory (see [Choosing a model](#choosing-a-model)). |
| `AI_MAX_OUTPUT_TOKENS` | `4096` | Per model call (sent as `options.num_predict`). |
| `AI_REQUEST_TIMEOUT` | `300000` | Milliseconds of wall clock per message (5 min). A 3B model on a laptop CPU needs roughly 30 s to 2 min for an answer that uses a tool. |
| `AI_MAX_TOOL_CALLS` | `12` | Per message. |
| `AI_MAX_ITERATIONS` | `8` | Model round trips per message. |
| `AI_RUN_TOKEN_BUDGET` | `150000` | Tokens per message. |
| `AI_DAILY_BUDGET` | `500000` | Tokens per admin per UTC day; `0` means unlimited. With a local model this limits load on the machine rather than spend. |
| `AI_ALLOW_PHI` | `false` | Keep false until the compliance review is approved. PHI masking applies even though the model is local. |
| `AI_ENABLE_WRITES` | `false` | Proposal tools and approvals. Enable only after staging sign-off. |
| `AI_RAG_ENABLED` | `false` | Reserved; nothing is implemented yet. |
| `AI_PROPOSAL_TTL_MINUTES` | `15` | How long a proposal can be approved. |
| `AI_MAX_RETRIES` | `2` | Retries on a refused connection and on 429/5xx responses, before any output has streamed. A stream that fails midway is not retried. |

No frontend variables are needed. The UI discovers the feature through `GET /api/admin-ai/status`.

## Setting up Ollama

1. **Install Ollama** on the machine that will run the model (see ollama.com for the installer). It listens on `http://localhost:11434` by default.
2. **Choose a model that supports tool calling.** The copilot only works through tools, so a model without tool support cannot answer. Ollama's model library marks tool-capable models with a "tools" tag. Size the model to the hardware: it has to fit in GPU memory (or RAM) together with the `AI_CONTEXT_TOKENS` context. Larger context windows use more memory.
3. **Pull it:** `ollama pull qwen2.5:3b` (the default), then check it with `ollama list`.
4. **Point the backend at it** in `backend/api/.env`: `AI_BASE_URL` (default `http://localhost:11434`), `AI_MODEL=<model>`, and `AI_CONTEXT_TOKENS` if the default 8192 is too large or too small for the model and machine.
5. If Ollama runs on a **different machine** than the backend, make it listen on a reachable address (Ollama's `OLLAMA_HOST` setting), keep it on a private network or behind HTTPS, and put an authenticating proxy in front of it if anything else can reach it (then set `AI_API_KEY`). Over plain `http`, prompts and tool results cross the network unencrypted.

**Where the data goes:** with a local Ollama, prompts, chat history and tool results stay on the machine running Ollama. If `AI_BASE_URL` points at another host, they go to that host. PHI masking (`AI_ALLOW_PHI=false`) still applies in both cases.

## Choosing a model

Benchmark from 2026-11-20 on the target machine: Intel Core i7-8665U laptop (4 cores, 8 threads), 15.8 GB RAM with about 5 GB free, integrated Intel UHD 620 (so CPU-only inference), Ollama 0.40.16. Each model received the copilot's real system prompt and tool specs at temperature 0, with four admin questions (beds, overdue invoices, pending signups, a settings question).

| Model | Correct tool | Arguments | Memory at 8k context | Generation | Result |
| --- | --- | --- | --- | --- | --- |
| `qwen2.5:3b` | 4 of 4 | correctly typed | 2.4 GB | ~7 tokens/s | **Default** |
| `llama3.2:3b` | 4 of 4 | numbers and booleans sent as strings (`"100"`, `"true"`), which the tool validators reject, so the model needs another round trip | 3.1 GB (fails to load at 16k) | ~6 tokens/s | Works, but slower in practice |
| `qwen3:4b` | — | — | does not load at 8k on this machine | — | Does not fit; at 4k it loads but leaks its reasoning into the answer even with thinking off |

Findings that affect configuration:

- **Prompt size dominates latency on CPU.** All 39 read tools are about 5,700 prompt tokens and took about 190 s before the first output token. The subset for the domains the intent router picks (2–12 tools, about 900–2,400 tokens) took 10–55 s. The orchestrator currently sends every permitted tool; sending only the routed subset is planned.
- **An answer that uses a tool needs at least two model calls** (pick the tool, then answer from its result), so expect 30 s to 2 min per question on this hardware. That is why `AI_REQUEST_TIMEOUT` defaults to 5 minutes.
- **Windows commit limit, not free RAM, is the ceiling.** With a fixed 4 GB page file there was only about 3.6 GB of committable memory left, which is why `qwen3:4b` failed at 8k while 5 GB of RAM was free. A system-managed page file raises the limit but makes inference page to disk.
- **Embeddings** (for the planned knowledge engine): `nomic-embed-text` produced 768-dimension vectors at about 1.1 chunks per second (chunks of ~1,500 characters), so embedding the whole repository (~4,000 chunks) takes about an hour once; later re-indexing must be incremental.

On a machine with a GPU or more memory, a larger tool-capable model and a bigger `AI_CONTEXT_TOKENS` will be faster and more reliable; rerun the comparison there before changing the default.

## Render limitation

The backend's production host is Render, and a Render service **cannot reach an Ollama running on a local machine**. `render.yaml` therefore keeps `ADMIN_AI_ENABLED="false"` (and sets `AI_MODEL`, the safety flags, and `AI_BASE_URL` / `AI_API_KEY` as `sync: false`). Today the copilot can only be used where the backend and an Ollama server can reach each other, for example a local development setup. A "Local AI Bridge" that would let the hosted API reach a self-hosted Ollama is planned as a later phase and does not exist yet.

## Rollout (local or any host that can reach Ollama)

1. **Deploy the code with every flag at its default.** The feature is invisible, so this is safe on its own.
2. **Apply the database migrations.** Render's start command already runs `prisma migrate deploy` (`npm run prisma:deploy` does the same manually). The AI migrations (`20261117183437_admin_ai_copilot`, `20261118164101_fk_indexes_and_ai_message_run`) only create tables, enums, indexes and one foreign key. Never use `migrate reset` or `db push` against production.
3. **Start Ollama and pull the model** (see above).
4. **Turn the feature on read-only.** Set `AI_BASE_URL`, `AI_MODEL` and `ADMIN_AI_ENABLED=true`, keeping `AI_ENABLE_WRITES=false` and `AI_ALLOW_PHI=false`. Restart the backend.
5. **Verify:**
   - `GET /api/health` returns 200.
   - Signed in as an admin, `GET /api/admin-ai/status` reports `providerConfigured: true`, `provider: "ollama"` and the expected `model`. (`providerConfigured` only means the URL and model are set; it does not contact Ollama.)
   - The Copilot button appears. Ask "What is the current bed occupancy?" and check that the answer streams in progressively and uses a tool.
   - If the run fails with "Can't reach the AI model server", Ollama is not running or `AI_BASE_URL` is wrong. "The AI model … is not available" means the model was not pulled.
   - **SSE through a proxy:** if the answer arrives all at once instead of progressively, a proxy is buffering. The feature still works but without live streaming. Check the response headers for `content-type: text/event-stream`.
   - `GET /api/admin-ai/usage` shows the run.
   - Non-admin accounts get 403. The backend logs show one `ai_run` JSON line per message, with no message text in it.
6. **Turn on writes later, if wanted.** After staging tests of approve, reject, expire and replay with real admin accounts, set `AI_ENABLE_WRITES=true`. Start with one admin team, and review the `AuditLog` rows where `entityType = 'AiActionProposal'`.

## Rollback

| Situation | Action |
|---|---|
| Disable quickly | Set `ADMIN_AI_ENABLED=false` and restart. The copilot button disappears, and no data is touched. |
| Stop writes only | Set `AI_ENABLE_WRITES=false`. Pending proposals can no longer be approved (403), and they expire on their own. |
| Revert code | Redeploy the previous commit. The AI tables are additive and unused by other code, so they can stay. |
| Remove AI tables (optional, irreversible) | Back up first. Then drop `AiFeedback`, `AiToolInvocation`, `AiActionProposal`, `AiMessage`, `AiRun` and `AiConversation`, and the enums `AiMessageRole`, `AiRunStatus`, `AiToolStatus`, `AiProposalStatus` and `AiFeedbackRating`. Write this as a new forward migration; never edit or delete an applied one. |
