# ADR-109 — Receive-side inbound dispatch

- Status: **Accepted — Implemented (alpha.10)**
- Date: 2026-05-09
- Authors: claude (drafted with rUv)
- Related: [ADR-097](./ADR-097-federation-budget-circuit-breaker.md), [ADR-104](./ADR-104-federation-wire-transport.md), [ADR-105](./ADR-105-federation-v1-state-snapshot.md)

## Context

In `alpha.9`, the federation plugin auto-binds a transport listener (`transport.listen(port)`) when `config.port` is set. Inbound bytes arrive at the WebSocket server and are queued in the transport's per-address message queue. **But the coordinator never wakes up to consume them.** Federation today is one-directional in a meaningful sense: peers can SEND to each other (transport.send works end-to-end), but the receiver's coordinator doesn't know any envelopes arrived.

Concretely, the WebSocketFallbackTransport's `onmessage` handler in `agentic-flow/transport/quic-loader.ts`:

```typescript
ws.on('message', (raw: RawData) => {
  const message = JSON.parse(raw.toString()) as AgentMessage;
  const queue = this.messageQueue.get(remoteAddr) ?? [];
  queue.push(message);
  this.messageQueue.set(remoteAddr, queue);
});
```

Pushes to the in-memory queue, full stop. The federation plugin doesn't poll, doesn't subscribe, doesn't dispatch.

## Decision

Add a **receive loop** in `plugin.ts` that:

1. After `transport.listen()` succeeds, registers an inbound message handler
2. For each received `AgentMessage`, reconstructs the `FederationEnvelope` from the `payload` field (the sender wrapped it there in `sendToNode`)
3. Verifies the envelope's HMAC + Ed25519 signature
4. Routes to the appropriate handler:
   - `messageType: 'task' | 'task-assignment'` → emit `federation:inbound-task` event
   - `messageType: 'memory-query'` → emit `federation:inbound-query` event
   - `messageType: 'context-share'` → store in PII-scrubbed inbound context
   - Unknown messageType → audit log as `message_received` with `metadata.unknown=true`
5. Audit log every inbound delivery (success OR rejection)

### Why event emission, not direct callback

Inbound messages are integrator-routed. Federation plugin's job is to *deliver* the envelope safely (verified, scrubbed, audited) and let the host application decide what to do with it. The plugin's `eventBus.emit('federation:inbound-task', envelope)` is the contract; the integrator subscribes via `context.eventBus.on(...)`.

This keeps the plugin responsibility-bounded: it's the trusted boundary between wire and app, not a task scheduler.

### Adding `onInboundMessage` to the transport interface

The current `AgentTransport` interface (in `agentic-flow/transport/loader`) doesn't expose an inbound subscription. We need to extend it WITHOUT breaking existing consumers:

```typescript
// New optional method on AgentTransport
onMessage?(handler: (address: string, message: AgentMessage) => void | Promise<void>): void;
```

Implementation in `WebSocketFallbackTransport`: add a private `messageHandlers: Set<...>` set, fire each registered handler on every `onmessage`. Keep the existing queue-based `receive()` API for callers that prefer poll over push.

Companion change to upstream agentic-flow's PR #153 (already open). Federation plugin uses optional chaining (`transport.onMessage?.(...)`) so it gracefully degrades if running against an older agentic-flow that doesn't have the hook yet.

### Handler signature

```typescript
type InboundHandler = (address: string, message: AgentMessage) => void | Promise<void>;
```

`address` is the sender's address (e.g. `192.168.1.42:54321` from the WS upgrade headers). `message.metadata.sourceNodeId` is the cryptographic identity claim — handler must verify the signature against `discovery.getPeer(sourceNodeId).publicKey` before trusting any other field.

## Implementation plan

### Step 1 — Upstream `onMessage` hook (companion to PR #153)

In `agentic-flow/src/transport/quic-loader.ts`:

```typescript
private messageHandlers = new Set<(address: string, message: AgentMessage) => void | Promise<void>>();

onMessage(handler: (address: string, message: AgentMessage) => void | Promise<void>): void {
  this.messageHandlers.add(handler);
}

// In the existing onmessage callbacks (both server-side and client-side):
ws.on('message', (raw: RawData) => {
  try {
    const message = JSON.parse(raw.toString()) as AgentMessage;
    // Existing queue push (preserves receive() API)
    const queue = this.messageQueue.get(addr) ?? [];
    queue.push(message);
    this.messageQueue.set(addr, queue);
    // New: fan out to handlers
    for (const h of this.messageHandlers) {
      Promise.resolve(h(addr, message)).catch((err) =>
        logger.warn('Inbound handler threw', { addr, err })
      );
    }
  } catch (err) { /* ... */ }
});
```

### Step 2 — Federation plugin subscribes

In `v3/@claude-flow/plugin-agent-federation/src/plugin.ts`, after `transport.listen()`:

```typescript
if (transport && typeof transport.onMessage === 'function') {
  transport.onMessage(async (address, message) => {
    await dispatchInbound(address, message, {
      coordinator: this.coordinator!,
      discovery,
      audit,
      verifyEnvelope: verifyBytes,
      eventBus: context.eventBus,
      logger: context.logger,
    });
  });
}
```

### Step 3 — Add `dispatchInbound` to a new file

`src/application/inbound-dispatcher.ts`:
- verifies signature against discovery's known peer
- audits + emits the right event by messageType
- short-circuits if peer is SUSPENDED/EVICTED at receive time (mirror of the outbound short-circuit)

### Step 4 — Tests

`__tests__/unit/inbound-dispatcher.test.ts`:
- happy path: signed envelope from known peer → audit `message_received` + event emitted
- unknown peer (not in discovery) → audit `message_rejected` + event NOT emitted
- bad signature → same rejection
- peer SUSPENDED → reject with `PEER_SUSPENDED` (defense-in-depth: outbound side should already short-circuit, but receive side enforces too)
- unknown messageType → emitted as generic `federation:inbound` with metadata.unknown=true

## Anti-goals

- **No request/reply correlation built into the dispatcher.** Some messageTypes are RPC-like (memory-query expects a response); correlation is the integrator's job via `message.id` / `metadata`. Dispatcher emits the event, integrator's handler sends the reply via `coordinator.sendMessage`.
- **No automatic message acknowledgement.** WebSocket already provides delivery confirmation at the transport layer; we don't add an app-layer ACK.
- **No rate limiting in the dispatcher.** That's the breaker's job — Phase 2.b's failure-ratio counter already covers "this peer is sending too much garbage."

## Security invariants (test-pinned)

1. Inbound message from peer NOT in discovery → rejected (no event, audit `message_rejected`)
2. Inbound message with bad signature → rejected (no event, audit `message_rejected`)
3. Inbound message from SUSPENDED/EVICTED peer → rejected with constant-string reason (no oracle leak)
4. `dispatchInbound` is async-tolerant — handler errors surface as audit log entries, never crash the listener
5. Unknown messageType is audited but doesn't crash — emitted as generic event with metadata.unknown

## Implementation status

| Step | Status |
|---|---|
| Upstream `onMessage` hook in agentic-flow | **Implemented this iteration — companion commit to PR #153** |
| `inbound-dispatcher.ts` | **Implemented** |
| `plugin.ts` subscription wiring | **Implemented** |
| Tests | **Implemented (5 specs)** |
| Validated mac↔ruvultra round-trip with both directions | **Implemented — alpha.10 release smoke** |

## Decision review trigger

Re-open when:
- Federation needs request/reply correlation primitives (today integrators DIY)
- Inbound dispatcher becomes a bottleneck (today single-threaded handler)
- We add a non-WebSocket transport with different inbound semantics (e.g. HTTP/3 server push)
