#!/usr/bin/env bash
# Download LongMemEval dataset from HuggingFace
# Source: https://github.com/xiaowu0162/LongMemEval

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../data"

mkdir -p "$DATA_DIR"

echo "Downloading LongMemEval dataset..."

BASE_URL="https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main"

for file in longmemeval_oracle.json longmemeval_s_cleaned.json longmemeval_m_cleaned.json; do
  if [ -f "$DATA_DIR/$file" ]; then
    echo "  [skip] $file (already exists)"
  else
    echo "  [download] $file"
    curl -L -o "$DATA_DIR/$file" "$BASE_URL/$file"
  fi
done

echo ""
echo "Dataset downloaded to: $DATA_DIR"
echo "Files:"
ls -lh "$DATA_DIR"/*.json 2>/dev/null || echo "  (no files found)"
