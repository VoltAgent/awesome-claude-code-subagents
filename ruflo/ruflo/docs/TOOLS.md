# Adding Custom MCP Tools

## Overview

MCP (Model Context Protocol) tools let the AI call your backend services. Each tool has:
- A **definition** (name, description, input schema) — shown to the AI
- A **handler** in `executeTool()` — routes the call to your backend

## Step-by-Step

### 1. Add your backend URL

In `mcp-bridge/index.js`, add your service to `CLOUD_FUNCTIONS`:

```javascript
const CLOUD_FUNCTIONS = {
  myService: process.env.MY_SERVICE_URL || "https://my-service-abc123.run.app",
};
```

### 2. Define the tool

Add a tool object to the `TOOLS` array:

```javascript
{
  name: "lookup_customer",
  description: "Look up a customer by ID or name. Returns profile, account status, and recent activity.",
  inputSchema: {
    type: "object",
    properties: {
      customerId: { type: "string", description: "Customer ID (e.g., 'CUST-1234')" },
      name: { type: "string", description: "Customer name to search" },
    },
    required: [],  // neither is required — the AI can provide either
  },
}
```

**Tips for good tool descriptions:**
- Be specific about what it does and what it returns
- Include example values in property descriptions
- The AI uses descriptions to decide when to call the tool

### 3. Add the handler

In `executeTool()`, add a case for your tool:

```javascript
case "lookup_customer":
  return callCloudFunction(CLOUD_FUNCTIONS.myService, {
    action: "get_customer",
    customerId: args.customerId,
    name: args.name,
  });
```

### 4. Update the system prompt

In `config/config.json`, add the tool to `systemPrompt` so the AI knows when to use it:

```
3. **lookup_customer** — Look up customer profiles and account details.
   USE FOR: "who is customer X?", "find customer", any question mentioning a customer ID.
```

## Supported Input Types

| JSON Schema Type | Example |
|-----------------|---------|
| `string` | `{ type: "string" }` |
| `number` | `{ type: "number" }` |
| `boolean` | `{ type: "boolean" }` |
| `array` | `{ type: "array", items: { type: "string" } }` |
| `object` | `{ type: "object" }` |
| `enum` | `{ type: "string", enum: ["a", "b", "c"] }` |

## Backend Response Format

Your Cloud Function should return JSON. The MCP bridge wraps it in the MCP response format automatically.

```javascript
// Your backend returns:
{ "customer": { "id": "CUST-1234", "name": "Jane Doe", "status": "active" } }

// MCP bridge wraps it as:
{
  "jsonrpc": "2.0",
  "result": {
    "content": [{ "type": "text", "text": "{\"customer\":{...}}" }]
  }
}
```

## Multiple Actions per Tool

A single tool can support multiple actions:

```javascript
// Tool definition with enum actions
{
  name: "manage_orders",
  description: "Manage orders: list, search, create, or update.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "search", "create", "update"] },
      orderId: { type: "string" },
      query: { type: "string" },
      data: { type: "object" },
    },
    required: ["action"],
  },
}

// Handler routes based on action
case "manage_orders": {
  const payload = { action: args.action };
  if (args.action === "search") payload.query = args.query;
  if (args.action === "create") payload.data = args.data;
  if (args.orderId) payload.orderId = args.orderId;
  return callCloudFunction(CLOUD_FUNCTIONS.orders, payload);
}
```

## Testing Tools

```bash
# List all registered tools
curl -s -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

# Call a specific tool
curl -s -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"tools/call",
    "params":{"name":"lookup_customer","arguments":{"customerId":"CUST-1234"}}
  }' | jq '.result.content[0].text' -r | jq .
```
