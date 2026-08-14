# ADR-117 — Run neural-trader heavy jobs on the Managed Agent cloud runtime

**Status**: Accepted (2026-05-12)
**Date**: 2026-05-12
**Authors**: claude (drafted with rUv)
**Related**: ADR-115 (Claude Managed Agents as the cloud agent runtime — `managed_agent_*` MCP tools in `ruflo-agent`) · `ruflo-neural-trader` plugin (`neural-trader` npm — Rust/NAPI engine, 112+ MCP tools, 4 agents, 7 skills incl. the new `trader-cloud-backtest`) · ADR-026 (3-tier model routing) · ADR-112 (MCP tool discoverability) · #1931 (ruflo-agent / managed agents tracking) · [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview)
**Supersedes**: nothing

## Context

`ruflo-neural-trader` wraps the `neural-trader` npm package (Rust/NAPI engine): walk-forward backtests, Monte-Carlo simulation, parameter sweeps, LSTM/Transformer/N-BEATS training, regime detection, risk metrics (VaR/CVaR, Kelly, circuit breakers). The expensive jobs — a multi-year walk-forward with thousands of Monte-Carlo paths, a parameter sweep over a strategy grid, training a Transformer on a long history — are **long-running (minutes to hours), CPU/compute-heavy, and async**. Today they run one of two places:

- **Locally** — ties up the dev box, bounded by local cores, and you can't close the laptop on a 40-minute sweep.
- **A WASM sandbox (`wasm_agent_*`)** — too constrained: no Rust/NAPI native build, no multi-minute compute, no real filesystem for the data + artifacts.

ADR-115 added a third runtime — **Anthropic Claude Managed Agents** (`managed_agent_*` in the `ruflo-agent` plugin): a cloud container with pre-installed packages (`pip`/`npm`/`apt`/`cargo`/`gem`/`go`), network access, a persistent filesystem, and a managed agent loop. That is *exactly* the shape neural-trader's heavy jobs want. The `managed_agent_*` tools shipped in `3.7.0-alpha.27` and are validated end-to-end — so the building blocks exist; this ADR is about wiring neural-trader to them as a first-class flow (not just "you could call those tools").

## Decision

**Add a "cloud backtest/train" recipe to `ruflo-neural-trader` that dispatches heavy `neural-trader` jobs to a Managed Agent cloud container, via the `managed_agent_*` tools — no new MCP tools, no new dependencies, just orchestration.**

### Surface

- **`plugins/ruflo-neural-trader/skills/trader-cloud-backtest/SKILL.md`** — the recipe:
  1. `managed_agent_create({ packages: { npm: ["neural-trader"], apt: ["build-essential"] }, initScript: "npm install -g neural-trader >/dev/null 2>&1 || true; node -e \"require('neural-trader')\" >/dev/null 2>&1", system: "<neural-trader operator prompt>", name: "nt-cloud", networking: "unrestricted" })` → a container with `neural-trader` pre-installed at start (so the agent doesn't reinstall mid-run; `apt: build-essential` only if there's no prebuilt NAPI binary for the container arch — neural-trader ships prebuilds, so usually omit it).
  2. `managed_agent_prompt({ sessionId, message: "Run `npx neural-trader --backtest --strategy <name> --symbol <TICKER> --period <range> --walk-forward --mc-paths <N>`. Report total/annualized return, Sharpe, Sortino, max-DD, win rate, profit factor, # trades, and 95% CVaR. Write the equity curve to /tmp/equity.csv and the trade log to /tmp/trades.csv. Then stop.", maxWaitMs: <generous> })` → the cloud agent runs it, streams the trace, and returns the metrics in `assistantText` + `toolUses`.
  3. `managed_agent_events({ sessionId })` if needed for the full transcript / to read `cat /tmp/equity.csv`.
  4. **Locally**, ingest the result: `memory_store({ key: "backtest-<strategy>-<ts>", value: <metrics+params>, namespace: "trading-backtests" })`; if Sharpe > threshold, `agentdb_pattern-store`; and record the run's container time + tokens to the `cost-tracking` namespace.
  5. `managed_agent_terminate({ sessionId, environmentId })` — immediately, results in hand. (For a *sweep* across strategies, reuse one environment + one session for the whole sweep — one `managed_agent_prompt` that runs all the configs — rather than N sessions.)
- **`/trader cloud <backtest|train|sweep> …`** subcommand in `commands/trader.md` — thin entry to the skill.
- The `trading-strategist` / `backtest-engineer` agents decide **locally** which runtime: a quick sanity check or a single short backtest → run it locally with the existing `trader-backtest` skill; a long walk-forward, a big MC count, a parameter sweep, or model training → dispatch to the cloud recipe. (Same WASM-vs-local-vs-managed decision pattern as `ruflo-agent`.)

### Cost optimization (the "optimize" requirement)

A cloud session bills container time + tokens until terminated, so the recipe is built to minimize both:

1. **Install once, in `initScript`** — `neural-trader` lands at container start, not via an agent tool call mid-run.
2. **Reuse the environment** — create the environment once; spawn a session per job (or one session per sweep). Don't re-provision per backtest.
3. **Pre-flight cheap** — before a 1000-path / multi-year run, the recipe first runs a 1-path / 3-month smoke to catch a bad strategy name or symbol — fail in seconds, not after 20 cloud-minutes.
4. **Batch sweeps** — a parameter grid is *one* `managed_agent_prompt` (one container), not N sessions; the agent loops the configs inside the container.
5. **Terminate eagerly** — `managed_agent_terminate` the instant the metrics + artifacts are pulled; never leave an idle billing container. A `ruflo doctor` / GC check (per #1931) catches orphans.
6. **Cheap agent model** — the agent loop is *orchestration* (it shells out to the Rust engine and reports numbers); route it to Haiku/Sonnet (ADR-026), never Opus. The compute is in `neural-trader`, not the LM.
7. **Estimate before kicking off** — the skill prints an estimated container-minutes × rate + token cost (from the job size) before the `managed_agent_create`, so a long sweep is a deliberate choice.

### Security / data

- If the backtest pulls from a **private market-data feed**, the credentials go in the environment's `environment` (env-var) block — the user provides them; never hardcode (per the project's "don't expose keys" rule). A `restricted` networking policy can pin the container to only the data host.
- `neural-trader` runs native Rust in the container — that's fine: it's in Anthropic's isolated container, not on the user's machine (strictly better isolation than the local runtime).
- Requires `ANTHROPIC_API_KEY` + Managed Agents beta access (the `managed_agent_*` prereq). Without it the skill degrades: it tells the user to fall back to the local `trader-backtest` skill.

### Out of scope (future)

- Wiring `ruflo mcp start` as the cloud agent's `mcpServers` so the cloud agent can write to ruflo memory / cost-tracking *directly* — needs a publicly reachable HTTP ruflo MCP server (ADR-115 follow-up). Until then, ruflo-memory ingestion happens *locally* after `managed_agent_events`.
- The same recipe applies to `ruflo-market-data` (ingest a large feed in the cloud, vectorize OHLCV) — note it, don't build it here.

### Implementation (shipped with this ADR)

- `plugins/ruflo-neural-trader/skills/trader-cloud-backtest/SKILL.md` — the recipe (provision-once · pre-flight-cheap · run · ingest-locally · terminate-eagerly), `allowed-tools` scoped to `managed_agent_*` + `memory_*` + `agentdb_pattern-store` + `Bash`/`Read` (no wildcard grant).
- `commands/trader.md` — the `/trader cloud <backtest|train|sweep> …` subcommand entry.
- `scripts/smoke.sh` — step 2 now asserts the 7th skill (`trader-cloud-backtest`) exists, references `managed_agent_create`, and names the local `trader-backtest` fallback (the contract for "cloud recipe present + degrades").
- `README.md` — overview + skills table + Architecture-Decisions + Related-Plugins cross-refs to this ADR / ADR-115 / `ruflo-agent`.
- No new MCP tools, no new dependencies — the `managed_agent_*` tools (ADR-115) shipped in `3.7.0-alpha.27` and the recipe is pure orchestration on top of them.

## Consequences

### Positive

- **The right runtime for the workload.** Long backtests / sweeps / training are exactly what Managed Agents is for; this stops them tying up the dev box or being stuck inside the WASM sandbox.
- **No new code surface to maintain.** It's a recipe-skill over `managed_agent_*` — no new MCP tools, no new deps, no new runtime. Reuses everything ADR-115 already shipped + validated.
- **Cost-conscious by construction.** The optimization rules above (install-once, reuse-env, pre-flight, batch sweeps, terminate-eagerly, cheap agent model, pre-estimate) are baked into the recipe, not bolted on.
- **Prototype→production path.** Iterate a strategy locally with `trader-backtest`; when it's worth a serious 2-year/1000-path validation or a Transformer train, dispatch to the cloud — same plugin, same agents.
- **Generalizes.** The "heavy-job → managed-agent recipe" pattern transfers to `ruflo-market-data` and any other compute-heavy plugin.

### Negative

- **Real cost.** A long cloud backtest = a long-lived billing container. The optimization rules mitigate it but don't eliminate it; the estimate + the eager-terminate + the GC check are load-bearing.
- **Beta exposure.** Managed Agents is beta (`managed-agents-2026-04-01`); the recipe inherits that churn.
- **Two execution paths for backtests** (local `trader-backtest` vs cloud `trader-cloud-backtest`) — the agents must pick correctly; a parity smoke (same tiny backtest on both, diff the metrics shape) keeps them aligned.
- **Data-feed credentials in the cloud.** If the feed is private, its creds now live in a cloud environment's env block — one more place a secret can leak; the user owns it, and `restricted` networking limits the blast radius.

### Neutral

- Opt-in; users who don't invoke the cloud recipe see no change. The local `trader-backtest` stays the default.
- "Adopt the cloud runtime for a heavy workload" — not a new pattern, just applying ADR-115 to neural-trader. Same posture as `ruflo-agent` adopting Managed Agents.

## Links

- ADR-115 — Claude Managed Agents as the cloud agent runtime (`managed_agent_*`); ADR-115 §"Implementation" + §"Future: a third runtime (Claude Agent SDK / ADR-116)"
- `ruflo-neural-trader` — `plugins/ruflo-neural-trader/README.md`; `neural-trader` npm: https://www.npmjs.com/package/neural-trader
- ADR-026 — 3-tier model routing (route the cloud-agent *loop* to Haiku/Sonnet)
- ADR-112 — MCP tool discoverability (the new `/trader cloud` skill/command must comply)
- #1931 — ruflo-agent / managed agents tracking (orphaned-session GC, `ruflo mcp start` HTTP server for the cloud-MCP combo)
- Claude Managed Agents: https://platform.claude.com/docs/en/managed-agents/overview
