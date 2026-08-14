#!/usr/bin/env bash
# Run the full LongMemEval benchmark for AgentDB
# Usage: ./run-benchmark.sh [--mode raw|hybrid|full|baseline] [--limit N]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BENCH_DIR="$SCRIPT_DIR/.."
MODE="${1:---mode}"
MODE_VAL="${2:-raw}"

# Parse args
LIMIT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE_VAL="$2"; shift 2 ;;
    --limit) LIMIT="--limit $2"; shift 2 ;;
    *) shift ;;
  esac
done

echo "=== LongMemEval Benchmark for AgentDB ==="
echo "Mode: $MODE_VAL"
echo ""

# Step 1: Ensure dataset exists
if [ ! -f "$BENCH_DIR/data/longmemeval_oracle.json" ]; then
  echo "Dataset not found. Downloading..."
  bash "$SCRIPT_DIR/download-dataset.sh"
fi

# Step 2: Ingest conversations into AgentDB
echo "[1/3] Ingesting conversations into AgentDB..."
npx tsx "$BENCH_DIR/ingest.ts" --data "$BENCH_DIR/data" $LIMIT

# Step 3: Run evaluation
echo "[2/3] Running evaluation (mode=$MODE_VAL)..."
npx tsx "$BENCH_DIR/evaluate.ts" --mode "$MODE_VAL" --data "$BENCH_DIR/data" $LIMIT

# Step 4: Generate report
echo "[3/3] Generating report..."
npx tsx "$BENCH_DIR/report.ts" --mode "$MODE_VAL"

echo ""
echo "=== Benchmark complete ==="
echo "Results saved to: $BENCH_DIR/results/"
