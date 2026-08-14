---
name: trader
description: Neural trading via npx neural-trader — strategies, backtesting, signals, risk, portfolio optimization
---
$ARGUMENTS
Manage neural trading strategies via the `neural-trader` npm package. Parse subcommand from $ARGUMENTS.

Usage: /trader <subcommand> [options]

Subcommands:
- `strategy create <name> --type <momentum|mean-reversion|pairs|adaptive>` -- Create a strategy
- `backtest <strategy> --symbol <TICKER> --period <range>` -- Run backtest (Rust/NAPI, 8-19x faster)
- `train <model> --symbol <TICKER>` -- Train neural model (lstm, transformer, nbeats)
- `signal scan [--strategy <name>]` -- Scan for trading signals via anomaly detection
- `risk assess [--symbol <TICKER>]` -- Calculate risk metrics (VaR, Sharpe, drawdown)
- `portfolio optimize [--risk-target <number>]` -- Optimize allocation via mean-variance
- `live --broker <name> [--swarm enabled]` -- Start live trading with optional swarm coordination
- `history` -- View trade history and performance summary
- `cloud <backtest|train|sweep> <strategy-or-model> --symbol <TICKER> [--period 2020-2024] [--mc-paths 1000]` -- Run a HEAVY job (long walk-forward, big Monte-Carlo, parameter sweep, model training) on an Anthropic Managed Agent cloud container instead of locally. Needs `ANTHROPIC_API_KEY`. See the `trader-cloud-backtest` skill + ADR-117. (Cost: a cloud session bills container time + tokens until terminated — the skill installs neural-trader once, reuses the env, pre-flights cheap, terminates eagerly.)

Steps by subcommand:

**strategy create**:
1. Run: `npx neural-trader --strategy <type> --symbol <TICKER> --create`
2. Store strategy config in memory:
   `npx @claude-flow/cli@latest memory store --key "strategy-NAME" --value "CONFIG" --namespace trading-strategies`

**backtest**:
1. Run: `npx neural-trader --backtest --strategy <name> --symbol <TICKER> --period <range> --walk-forward`
2. Capture Sharpe ratio, max drawdown, win rate, profit factor from output
3. Store results:
   `npx @claude-flow/cli@latest memory store --key "backtest-ID" --value "RESULTS" --namespace trading-backtests`
4. If Sharpe > 1.5, train SONA:
   `npx @claude-flow/cli@latest neural train --pattern-type trading-strategy --epochs 10`

**train**:
1. Run: `npx neural-trader --model <lstm|transformer|nbeats> --symbol <TICKER> --confidence 0.95`
2. Capture predictions and confidence intervals from output

**signal scan**:
1. Run: `npx neural-trader --signal scan --symbols <TICKERS>`
2. If --strategy specified, run: `npx neural-trader --signal scan --strategy <name>`
3. Store signals:
   `npx @claude-flow/cli@latest memory store --key "signal-TIMESTAMP" --value "SIGNALS" --namespace trading-signals`

**risk assess**:
1. Run: `npx neural-trader --risk assess --symbol <TICKER>`
   or: `npx neural-trader --var --symbol <TICKER> --investment <amount>`
2. Run: `npx neural-trader --risk-tolerance 0.02 --symbol <TICKER>` for position sizing
3. Store assessment:
   `npx @claude-flow/cli@latest memory store --key "risk-ID" --value "METRICS" --namespace trading-risk`

**portfolio optimize**:
1. Run: `npx neural-trader --portfolio optimize`
   or: `npx neural-trader --portfolio optimize --risk-target <number>`
2. Run: `npx neural-trader --portfolio rebalance` to generate trade plan
3. Store allocation:
   `npx @claude-flow/cli@latest memory store --key "portfolio-TIMESTAMP" --value "ALLOCATION" --namespace trading-portfolio`

**live**:
1. Run: `npx neural-trader --broker <name> --strategy <name> --swarm enabled`
2. Monitor output for trade executions and risk alerts
3. Circuit breakers auto-enforce: daily 3% loss halt, weekly 5% size reduction

**history**:
1. Search memory: `npx @claude-flow/cli@latest memory search --query "trade history" --namespace trading-history`
2. Show recent trades with PnL, strategy attribution, and aggregate metrics
