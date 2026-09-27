# Running Paperclip locally with Claude Code agents

This document records exactly how this fork was set up to run entirely on one
Linux machine, with its agents executing through the local **Claude Code CLI**
(`claude`) via the `claude_local` adapter. No hosted runtime, no API keys, and
no Docker are required.

## Machine / toolchain versions

| Tool | Version used | Notes |
| --- | --- | --- |
| OS | Ubuntu 24.04 (Linux) | virtual desktop on `DISPLAY=:5` |
| Node.js | v24.21.0 | repo pins Node 24 (`.nvmrc`); needs ≥ 24.11 |
| pnpm | 9.15.4 | activated via `corepack` (repo pins `packageManager: pnpm@9.15.4`) |
| Claude Code CLI | `claude` 2.x | installed at `~/.local/bin/claude`, logged in with a Claude subscription |

pnpm was enabled without root by pointing corepack at a writable bin dir:

```sh
corepack enable --install-directory ~/.local/bin
```

## Database — zero-config embedded Postgres

Paperclip ships an **embedded PostgreSQL**. When `DATABASE_URL` is left unset,
the server creates and manages its own instance under
`~/.paperclip/instances/default/db` and runs all migrations automatically on
startup. No Docker or system Postgres is needed. (The repo's
`docker/docker-compose.yml` remains available if you prefer external Postgres,
but it was not used here.)

## Environment file

`.env` lives at the repo root and is git-ignored (never committed). Variable
**names** only:

| Variable | Purpose |
| --- | --- |
| `PORT` | API/UI port (`3100`) |
| `SERVE_UI` | serve the UI from the same origin as the API |
| `BETTER_AUTH_SECRET` | session signing secret; also the fallback that signs per-run agent JWTs |
| `PAPERCLIP_AGENT_JWT_SECRET` | signs the per-run local-agent JWT that becomes the agent's `PAPERCLIP_API_KEY` |
| `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET` | signs tool actions |

`DATABASE_URL` is intentionally **absent** so the embedded Postgres is used.

> **Important:** the dev server process runs with its working directory set to
> `server/`, so it does not automatically pick up the repo-root `.env`. Start it
> with `PAPERCLIP_ENV_FILE_PATH` pointing at the repo-root `.env` (or export the
> variables directly). Without the agent JWT secret, runs still work but log
> `local agent jwt secret missing ... running without injected PAPERCLIP_API_KEY`.

## Native runner disabled (no Rust toolchain here)

By default `experimental.enableNativeRunner` is `true`, which makes `pnpm dev`
build the Rust `paperclip-runnerd` binary (`cargo build`) and routes heartbeat
runs through it. This machine has no `cargo`, so the native runner is turned
**off** — heartbeat runs then use the in-process ("legacy") executor, which
spawns the `claude` CLI directly. That is exactly what we want for Claude Code
agents, and it removes the Rust build dependency entirely.

The flag is persisted once into the singleton `instance_settings` row before
first boot with a small helper (`packages/db/disable-native-runner.mjs`):

```sh
cd packages/db && ./node_modules/.bin/tsx disable-native-runner.mjs
# -> instance_settings.experimental = {"enableNativeRunner":false}
```

## How to start it

```sh
# from the repo root
pnpm install

# one-time: disable the native runner (see above)
cd packages/db && ./node_modules/.bin/tsx disable-native-runner.mjs && cd ../..

# start the dev server (embedded PG + API + UI on :3100)
PAPERCLIP_ENV_FILE_PATH="$PWD/.env" \
BETTER_AUTH_SECRET=... PAPERCLIP_AGENT_JWT_SECRET=... \
PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=... \
PORT=3100 SERVE_UI=true \
pnpm dev > /tmp/paperclip-dev.log 2>&1 &

# wait for it, then open the UI
curl -sf http://localhost:3100/ >/dev/null && echo up
```

On first boot the server applies all migrations, then binds `127.0.0.1:3100`.
Open <http://localhost:3100> and complete onboarding (create a company, its
first agent, and connect the model).

## Adapter configuration

### Enabled on this machine

- **`claude_local` (Claude Code)** — the main adapter. It shells out to the
  local `claude` CLI (default command `claude`, resolved from `PATH`). Auth uses
  the CLI's own logged-in **Claude subscription** (`~/.claude/.credentials.json`)
  — no `ANTHROPIC_API_KEY` needed. In the hire flow choose **Claude Code** →
  **Claude Subscription**; Paperclip runs a live connection test before saving.
  Execution engine defaults to ACP (`claude-agent-acp`), with a plain Claude-CLI
  mode also available.
- **`process` (bash/CLI)** — a generic shell-command executor. Needs only a
  shell; no external account. Available for agents that should run arbitrary
  local commands.

### Not enabled (require accounts / software this machine does not have)

| Adapter | Type | What it would need |
| --- | --- | --- |
| Codex | `codex_local` | `codex` CLI + `OPENAI_API_KEY` or a ChatGPT login |
| Cursor / Cursor Cloud | `cursor` / `cursor_cloud` | Cursor CLI/SDK + a Cursor account |
| Gemini CLI | `gemini_local` | `gemini` CLI + `GOOGLE_GEMINI_API_KEY` or Google login |
| Grok | `grok_local` | `grok` CLI + xAI device login |
| Kimi Code | `kimi_local` | `kimi` CLI + Moonshot/Kimi login |
| OpenCode | `opencode_local` | `opencode` CLI + a provider (e.g. OpenRouter) login |
| Pi | `pi_local` | `pi` CLI + its backend auth |
| Hermes / Hermes Gateway | `hermes_local` / `hermes_gateway` | a running Hermes CLI / gateway endpoint |
| OpenClaw Gateway | `openclaw_gateway` | a reachable OpenClaw gateway URL + token |
| Paperclip Runner | `paperclip_runner` | the Rust `paperclip-runnerd` binary (needs a `cargo`/Rust toolchain) plus a provider |
| HTTP | `http` | an HTTP endpoint (per-endpoint auth) |

No accounts were created and no keys were invented for any of the above.

## How to watch agents work

- **Dashboard** `/AGE/dashboard` — agents enabled, month spend, run activity.
- **Agents** `/AGE/agents` — list / org chart; each agent has Runtime
  (adapter, model, **Run Policy → Advanced → Max concurrent runs**), Budgets,
  Runs, and Costs.
- **Tasks** `/AGE/issues` — create a task, assign it to an agent; assignment
  wakes the agent (wake-on-demand). The task page streams the live run.
- **Runs** `/AGE/agents/<agent>/runs/<run>` — the run transcript, token usage,
  duration, and cost.

## Org created for this setup

Company **Agent Lab** (goal: *"Maintain and improve this Paperclip fork"*) with
three agents, all on `claude_local`, each with a small monthly budget
(`$5.00` = `500` cents) and heartbeat **Max concurrent runs = 1** so only one
agent runs at a time:

- **Ada (CEO)** — sets priorities, delegates.
- **Tom (CTO)** — reviews technical work; reports to CEO.
- **Ellie (Engineer)** — implements tasks in the fork's workspace; reports to CTO.

A "Paperclip Fork" project points its primary workspace at this local checkout
(`sourceType: local_path`), so tasks operate on the repository. The Engineer
completed an end-to-end task (add a section to `doc/DEVELOPING.md`) — editing
the file, committing, pushing, and opening a PR — driven entirely by the local
`claude` CLI.
