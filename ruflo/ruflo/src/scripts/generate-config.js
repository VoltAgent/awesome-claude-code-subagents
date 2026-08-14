#!/usr/bin/env node
/**
 * Generates deployment files from config.json
 *
 * Usage:
 *   node scripts/generate-config.js [config-path]
 *
 * Outputs:
 *   - chat-ui/dotenv-local.txt    (baked into Docker image)
 *   - mcp-bridge/index.js         (updated with custom tools/endpoints)
 *   - chat-ui/cloudbuild.yaml     (with project-specific values)
 *   - mcp-bridge/cloudbuild.yaml  (with project-specific values)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const configPath = process.argv[2] || resolve(ROOT, "config/config.json");

if (!existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  console.error("Copy config/config.example.json to config/config.json and fill in your values.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf-8"));

// ---- Provider endpoints ----
const PROVIDER_ENDPOINTS = {
  gemini: {
    type: "openai",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  openai: {
    type: "openai",
    baseURL: "https://api.openai.com/v1",
  },
  openrouter: {
    type: "openai",
    baseURL: "https://openrouter.ai/api/v1",
  },
};

// ---- Build MCP bridge URL ----
const mcpBridgeService = config.gcp.serviceName?.mcpBridge || "mcp-bridge";
// For Docker Compose: use internal Docker network URL.
// For Cloud Run: deploy.sh replaces this with the real HTTPS URL after deployment.
const bridgeURL = process.env.MCP_BRIDGE_URL || `http://${mcpBridgeService}:3001`;

// ---- Build MODELS array ----
// All models route through the MCP bridge's /chat/completions proxy.
// The bridge resolves the correct upstream provider (OpenAI, Gemini, OpenRouter)
// from the model name and uses server-side API keys. No keys in the client config.
const models = (config.models || []).map((m) => {
  return {
    name: m.name,
    displayName: m.displayName || m.name,
    description: m.description || "",
    supportsTools: m.supportsTools !== false,
    ...(m.multimodal ? { multimodal: true } : {}),
    parameters: m.parameters || {},
    preprompt: config.systemPrompt || `You are ${config.brand.name}, a helpful AI assistant.`,
    endpoints: [{ type: "openai", baseURL: bridgeURL }],
  };
});

// ---- Generate dotenv-local.txt ----
const chatService = config.gcp.serviceName?.chatUi || "chat-ui";

let dotenv = `MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=${chatService}-db
PUBLIC_APP_NAME=${config.brand.name}
PUBLIC_ORIGIN=https://${config.brand.domain}
PUBLIC_APP_DESCRIPTION="${config.brand.description}"
LLM_SUMMARIZATION=true
ENABLE_DATA_EXPORT=true
ALLOW_IFRAME=false
USE_LOCAL_WEBSEARCH=true
OPENAI_BASE_URL=${bridgeURL}`;

// MCP_SERVERS: Each tool group is a separate MCP server (toggle-able in Chat UI).
// RVF security patch allows HTTP for admin-configured MCP_SERVERS
// on the private container network (not exposed to internet).
// For Cloud Run, deploy.sh replaces ${bridgeURL} with HTTPS URL.
const mcpGroups = config.mcpGroups || {
  core: true, intelligence: true, agents: true, memory: true, devtools: true,
  security: false, browser: false, neural: false,
  "agentic-flow": false, "claude-code": false, gemini: false, codex: false,
};
const groupDisplayNames = {
  core: "Core Tools",
  intelligence: "Intelligence & Learning",
  agents: "Agents & Orchestration",
  memory: "Memory & Knowledge",
  devtools: "Dev Tools & Analysis",
  security: "Security & Safety",
  browser: "Browser Automation",
  neural: "Neural & DAA",
  "agentic-flow": "Agentic Flow",
  "claude-code": "Claude Code",
  gemini: "Gemini",
  codex: "Codex",
};
const mcpServers = Object.entries(mcpGroups)
  .filter(([, enabled]) => enabled)
  .map(([name]) => ({
    name: groupDisplayNames[name] || name,
    url: `${bridgeURL}/mcp/${name}`,
  }));
dotenv += `\nMCP_SERVERS=\`${JSON.stringify(mcpServers)}\``;

// Auth
if (config.auth?.enabled) {
  dotenv += `
OPENID_PROVIDER_URL=https://accounts.google.com
OPENID_CLIENT_ID=${config.auth.clientId}
OPENID_SCOPES=${config.auth.scopes || "openid profile email"}
OPENID_NAME_CLAIM=${config.auth.nameClaim || "name"}
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
COOKIE_MAX_AGE=604800`;
}

// Models
dotenv += `\nMODELS=\`${JSON.stringify(models)}\``;

writeFileSync(resolve(ROOT, "chat-ui/dotenv-local.txt"), dotenv);
console.log("Generated: chat-ui/dotenv-local.txt");

// ---- Generate chat-ui/cloudbuild.yaml ----
const chatCloudbuild = `steps:
  # Build custom image with branded assets
  - name: 'gcr.io/cloud-builders/docker'
    args: [
      'build',
      '-t', 'gcr.io/\${PROJECT_ID}/${chatService}:\${_VERSION}',
      '-f', 'chat-ui/Dockerfile',
      'chat-ui'
    ]

  # Push versioned tag
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/\${PROJECT_ID}/${chatService}:\${_VERSION}']

  # Tag and push latest
  - name: 'gcr.io/cloud-builders/docker'
    args: [
      'tag',
      'gcr.io/\${PROJECT_ID}/${chatService}:\${_VERSION}',
      'gcr.io/\${PROJECT_ID}/${chatService}:latest'
    ]
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/\${PROJECT_ID}/${chatService}:latest']

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args: [
      'run', 'deploy', '${chatService}',
      '--image', 'gcr.io/\${PROJECT_ID}/${chatService}:\${_VERSION}',
      '--platform', 'managed',
      '--region', '${config.gcp.region}',
      '--port', '3000',
      '--memory', '2Gi',
      '--cpu', '2',
      '--min-instances', '1',
      '--max-instances', '10',
      '--timeout', '300',${config.gcp.vpcConnector ? `\n      '--vpc-connector', '${config.gcp.vpcConnector}',` : ""}
      '--allow-unauthenticated',
      '--set-secrets', '${config.auth?.enabled ? `OPENID_CLIENT_SECRET=${config.auth.clientSecretName || "google-client-secret"}:latest` : ""}'
    ]

substitutions:
  _VERSION: 'v1'

options:
  logging: CLOUD_LOGGING_ONLY
timeout: 1200s
`;

writeFileSync(resolve(ROOT, "chat-ui/cloudbuild.yaml"), chatCloudbuild);
console.log("Generated: chat-ui/cloudbuild.yaml");

// ---- Generate mcp-bridge/cloudbuild.yaml ----
const bridgeCloudbuild = `steps:
  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args: [
      'build',
      '-t', 'gcr.io/\${PROJECT_ID}/${mcpBridgeService}:\${_VERSION}',
      '-f', 'mcp-bridge/Dockerfile',
      'mcp-bridge'
    ]

  # Push versioned tag
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/\${PROJECT_ID}/${mcpBridgeService}:\${_VERSION}']

  # Tag and push latest
  - name: 'gcr.io/cloud-builders/docker'
    args: [
      'tag',
      'gcr.io/\${PROJECT_ID}/${mcpBridgeService}:\${_VERSION}',
      'gcr.io/\${PROJECT_ID}/${mcpBridgeService}:latest'
    ]
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/\${PROJECT_ID}/${mcpBridgeService}:latest']

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args: [
      'run', 'deploy', '${mcpBridgeService}',
      '--image', 'gcr.io/\${PROJECT_ID}/${mcpBridgeService}:\${_VERSION}',
      '--platform', 'managed',
      '--region', '${config.gcp.region}',
      '--port', '3001',
      '--memory', '512Mi',
      '--cpu', '1',
      '--min-instances', '0',
      '--max-instances', '5',
      '--timeout', '300',${config.gcp.vpcConnector ? `\n      '--vpc-connector', '${config.gcp.vpcConnector}',` : ""}
      '--allow-unauthenticated',
      '--set-env-vars', 'NODE_ENV=production',
      '--set-secrets', '${Object.entries(config.secrets || {}).map(([k, v]) => `${k.replace(/([A-Z])/g, "_$1").toUpperCase()}=${v}:latest`).join(",")}'
    ]

substitutions:
  _VERSION: 'v1'

options:
  logging: CLOUD_LOGGING_ONLY
timeout: 600s
`;

writeFileSync(resolve(ROOT, "mcp-bridge/cloudbuild.yaml"), bridgeCloudbuild);
console.log("Generated: mcp-bridge/cloudbuild.yaml");

console.log("\nDone! Next steps:");
console.log("  1. Edit mcp-bridge/index.js to add your custom tools");
console.log("  2. Run: bash scripts/deploy.sh");
