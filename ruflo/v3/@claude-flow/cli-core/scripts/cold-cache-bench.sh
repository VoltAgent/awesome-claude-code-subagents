#!/bin/bash
# Cold-cache benchmark — @claude-flow/cli@latest vs @claude-flow/cli-core@alpha
#
# Measures the wall-time gap from spawnSync('npx', [pkg, 'memory', 'list'])
# in a fresh npm cache (the user-visible cost when plugin skills spawn the
# CLI for the first time on a developer's machine).
#
# Safety: redirects npm cache to a temp dir via NPM_CONFIG_CACHE so this
# never wipes the user's ~/.npm/_npx (per project memory feedback).
#
# Usage:  bash v3/@claude-flow/cli-core/scripts/cold-cache-bench.sh
# Result: prints a markdown table with min/mean/max per condition.

set -u
RUNS=${RUNS:-3}
BENCH_CACHE=$(mktemp -d -t npx-bench-cache.XXXXXX)
trap "rm -rf $BENCH_CACHE" EXIT
TIMEFORMAT='%R'

time_pkg () {
  local pkg="$1"
  local t
  { t=$( { time NPM_CONFIG_CACHE="$BENCH_CACHE" npx -y "$pkg" memory list --limit 1 >/dev/null 2>&1; } 2>&1 ); } 2>/dev/null
  echo "$t"
}

echo "## Cold-cache benchmark — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Workload: npx -y <pkg> memory list --limit 1"
echo "Cache:    $BENCH_CACHE (redirected, not ~/.npm)"
echo "Runs:     $RUNS per condition"
echo ""

declare -a CC CW KC KW
for i in $(seq 1 $RUNS); do
  rm -rf "$BENCH_CACHE"
  v=$(time_pkg "@claude-flow/cli@latest");      echo "cli  cold #$i: ${v}s";  CC+=("$v")
  v=$(time_pkg "@claude-flow/cli@latest");      echo "cli  warm #$i: ${v}s";  CW+=("$v")
done
for i in $(seq 1 $RUNS); do
  rm -rf "$BENCH_CACHE"
  v=$(time_pkg "@claude-flow/cli-core@alpha");  echo "core cold #$i: ${v}s";  KC+=("$v")
  v=$(time_pkg "@claude-flow/cli-core@alpha");  echo "core warm #$i: ${v}s";  KW+=("$v")
done

echo ""
python3 - <<PY
def stats(arr):
    nums = [float(x) for x in arr if x]
    return min(nums), sum(nums)/len(nums), max(nums)
cc, cw = "${CC[*]}".split(), "${CW[*]}".split()
kc, kw = "${KC[*]}".split(), "${KW[*]}".split()
print("## Results (seconds, real wall-time)")
print()
print("| Condition          |   Min |  Mean |   Max |")
print("|--------------------|------:|------:|------:|")
for label, arr in [("cli  cold-cache", cc), ("cli  warm-cache", cw),
                   ("core cold-cache", kc), ("core warm-cache", kw)]:
    mn, me, mx = stats(arr)
    print(f"| {label:18} | {mn:5.2f} | {me:5.2f} | {mx:5.2f} |")
print()
print("## Speedup")
_, m_cc, _ = stats(cc); _, m_cw, _ = stats(cw)
_, m_kc, _ = stats(kc); _, m_kw, _ = stats(kw)
print(f"  cold-cache: {m_cc/m_kc:.1f}x  (cli {m_cc:.2f}s vs core {m_kc:.2f}s)")
print(f"  warm-cache: {m_cw/m_kw:.1f}x  (cli {m_cw:.2f}s vs core {m_kw:.2f}s)")
PY
