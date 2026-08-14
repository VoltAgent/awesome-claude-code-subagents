#!/bin/bash
# =============================================================================
# Deploy Chat UI + MCP Bridge to Google Cloud Run
# White-label package — configure via config/config.json
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Load config
CONFIG_FILE="${1:-config/config.json}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: Config file not found: $CONFIG_FILE"
  echo "Copy config/config.example.json to config/config.json and fill in values."
  exit 1
fi

PROJECT_ID=$(cat "$CONFIG_FILE" | python3 -c "import json,sys; print(json.load(sys.stdin)['gcp']['projectId'])")
REGION=$(cat "$CONFIG_FILE" | python3 -c "import json,sys; print(json.load(sys.stdin)['gcp'].get('region','us-central1'))")
BRAND_NAME=$(cat "$CONFIG_FILE" | python3 -c "import json,sys; print(json.load(sys.stdin)['brand']['name'])")
DOMAIN=$(cat "$CONFIG_FILE" | python3 -c "import json,sys; print(json.load(sys.stdin)['brand']['domain'])")
CHAT_SERVICE=$(cat "$CONFIG_FILE" | python3 -c "import json,sys; print(json.load(sys.stdin)['gcp'].get('serviceName',{}).get('chatUi','chat-ui'))")
BRIDGE_SERVICE=$(cat "$CONFIG_FILE" | python3 -c "import json,sys; print(json.load(sys.stdin)['gcp'].get('serviceName',{}).get('mcpBridge','mcp-bridge'))")

VERSION="v$(date +%Y%m%d%H%M)"

echo "============================================"
echo "Deploying: $BRAND_NAME"
echo "Project:   $PROJECT_ID"
echo "Region:    $REGION"
echo "Domain:    $DOMAIN"
echo "Version:   $VERSION"
echo "============================================"

# --- Step 1: Generate config files ---
echo ""
echo ">>> Step 1/4: Generating deployment files..."
node scripts/generate-config.js "$CONFIG_FILE"

# --- Step 2: Deploy MCP Bridge ---
echo ""
echo ">>> Step 2/4: Deploying MCP Bridge ($BRIDGE_SERVICE)..."

gcloud builds submit \
  --config=mcp-bridge/cloudbuild.yaml \
  --substitutions=_VERSION="$VERSION" \
  --project="$PROJECT_ID" \
  --region="$REGION" 2>&1 | tail -15

MCP_BRIDGE_URL=$(gcloud run services describe "$BRIDGE_SERVICE" \
  --platform=managed \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)" 2>/dev/null)

echo "MCP Bridge deployed: $MCP_BRIDGE_URL"

# --- Step 3: Update dotenv with real MCP bridge URL and deploy Chat UI ---
echo ""
echo ">>> Step 3/4: Deploying Chat UI ($CHAT_SERVICE)..."

# Replace placeholder with actual MCP bridge URL
sed -i "s|__MCP_BRIDGE_URL__|${MCP_BRIDGE_URL}|g" chat-ui/dotenv-local.txt

gcloud builds submit \
  --config=chat-ui/cloudbuild.yaml \
  --substitutions=_VERSION="$VERSION" \
  --project="$PROJECT_ID" \
  --region="$REGION" 2>&1 | tail -15

CHAT_URL=$(gcloud run services describe "$CHAT_SERVICE" \
  --platform=managed \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)" 2>/dev/null)

echo "Chat UI deployed: $CHAT_URL"

# --- Step 4: Map custom domain (optional) ---
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "chat.example.com" ]; then
  echo ""
  echo ">>> Step 4/4: Mapping custom domain..."

  gcloud run domain-mappings create \
    --service="$CHAT_SERVICE" \
    --domain="$DOMAIN" \
    --region="$REGION" \
    --project="$PROJECT_ID" 2>&1 || echo "Domain mapping may already exist"

  echo ""
  echo "Add a CNAME DNS record:"
  echo "  $DOMAIN -> ghs.googlehosted.com"
else
  echo ""
  echo ">>> Step 4/4: Skipping domain mapping (using Cloud Run URL)"
fi

# --- Done ---
echo ""
echo "============================================"
echo "Deployment Complete: $BRAND_NAME"
echo "============================================"
echo ""
echo "Services:"
echo "  MCP Bridge:  $MCP_BRIDGE_URL"
echo "  Chat UI:     $CHAT_URL"
[ -n "$DOMAIN" ] && [ "$DOMAIN" != "chat.example.com" ] && echo "  Domain:      https://$DOMAIN"
echo ""
echo "Test:"
echo "  curl $MCP_BRIDGE_URL/health"
echo "  curl -X POST $MCP_BRIDGE_URL/mcp -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'"
echo ""
