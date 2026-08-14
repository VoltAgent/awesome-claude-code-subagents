FROM ghcr.io/huggingface/chat-ui-db:latest

# Switch to root for patching and file operations
USER root

# Bake .env.local with MODELS config (too large for Cloud Run env vars)
COPY dotenv-local.txt /app/.env.local

# RVF Security Patch — allow private Docker network MCP connections.
# HF Chat UI enforces HTTPS for MCP URLs (SSRF protection).
# In containerized deployments, MCP bridge runs on private Docker network.
# This patch allows HTTP for admin-configured MCP_SERVERS only.
COPY patch-mcp-url-safety.sh /tmp/patch-mcp-url-safety.sh
RUN sh /tmp/patch-mcp-url-safety.sh && rm /tmp/patch-mcp-url-safety.sh

# Copy branded welcome GIF into the SvelteKit static asset directory.
COPY static/chatui/omni-welcome.gif /app/build/client/chatui/omni-welcome.gif
COPY static/chatui/omni-welcome.gif /app/static/chatui/omni-welcome.gif

# Copy PWA icon (fixes 404 for /chat/chatui/icon-144x144.png)
COPY static/chatui/icon-144x144.png /app/build/client/chatui/icon-144x144.png
COPY static/chatui/icon-144x144.png /app/static/chatui/icon-144x144.png

# Switch back to non-root user
USER 1000
