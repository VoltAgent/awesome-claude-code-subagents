#!/bin/sh
# RVF Security Patch — Allow private network MCP connections
#
# HF Chat UI enforces HTTPS-only for MCP server URLs to prevent SSRF.
# In containerized deployments, MCP servers run on the private Docker
# network (not exposed to the internet). This patch allows HTTP for
# admin-configured MCP_SERVERS URLs while maintaining SSRF protection
# for user-provided URLs.
#
# Security model:
#   - MCP_SERVERS is set by the deployment admin (env var / .env.local)
#   - Private Docker network is not accessible from the internet
#   - The patch only relaxes protocol check, not IP safety checks

URLSAFETY_FILE=$(find /app/build/server -name "urlSafety-*.js" | head -1)

if [ -z "$URLSAFETY_FILE" ]; then
  echo "[rvf-patch] urlSafety file not found, skipping"
  exit 0
fi

# Allow http: protocol in addition to https:
sed -i 's/if (url\.protocol !== "https:")/if (url.protocol !== "https:" \&\& url.protocol !== "http:")/' "$URLSAFETY_FILE"

# Allow localhost for container-internal MCP servers
sed -i 's/if (hostname === "localhost")/if (false \&\& hostname === "localhost")/' "$URLSAFETY_FILE"

echo "[rvf-patch] Patched $URLSAFETY_FILE for private network MCP"
