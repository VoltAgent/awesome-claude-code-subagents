/**
 * ADR-095 G2 — FederationTransport tests.
 *
 * Uses a mock AgenticFlowTransportLike: a tiny in-memory mesh where
 * `send(address, msg)` delivers to the node registered at that address.
 * That's enough to exercise the request-response correlation, broadcast,
 * timeout, and Ed25519-signing paths without a real WS.
 */
import { describe, it, expect } from 'vitest';
import {
  FederationTransport,
  type AgenticFlowTransportLike,
} from '../src/consensus/federation-transport.js';
import { generateNodeKeyPair, type ConsensusMessage } from '../src/consensus/transport.js';

/** A mock mesh of agentic-flow-like transports keyed by address. */
class MockMesh {
  private readonly nodes = new Map<string, MockWire>();
  register(address: string, w: MockWire) { this.nodes.set(address, w); }
  deliver(address: string, msg: { from?: string; type?: string; payload: unknown }) {
    const target = this.nodes.get(address);
    if (target) queueMicrotask(() => target.receive(msg));
  }
}

class MockWire implements AgenticFlowTransportLike {
  private handler: ((m: { from?: string; type?: string; payload: unknown }) => void | Promise<void>) | null = null;
  constructor(private readonly mesh: MockMesh, address: string) {
    mesh.register(address, this);
  }
  async send(address: string, message: { type?: string; payload: unknown; streamId?: string }): Promise<void> {
    // Stamp `from` from the embedded msg.from so the mesh can route replies.
    const env = message.payload as { msg?: { from?: string } };
    this.mesh.deliver(address, { from: env?.msg?.from, type: message.type, payload: message.payload });
  }
  onMessage(handler: (m: { from?: string; type?: string; payload: unknown }) => void | Promise<void>): void {
    this.handler = handler;
  }
  receive(m: { from?: string; type?: string; payload: unknown }) {
    void this.handler?.(m);
  }
  close(): void { /* noop */ }
}

function build(ids: string[]) {
  const mesh = new MockMesh();
  const addr: Record<string, string> = {};
  ids.forEach((id) => { addr[id] = `ws://${id}:9101`; });
  const addressOf = (id: string) => addr[id];
  const transports = new Map<string, FederationTransport>();
  for (const id of ids) {
    const wire = new MockWire(mesh, addr[id]);
    transports.set(id, new FederationTransport(wire, { nodeId: id, addressOf, peerIds: () => ids }));
  }
  return { transports, addressOf };
}

describe('ADR-095 G2 — FederationTransport', () => {
  it('send → peer handler → reply round-trips via correlation id', async () => {
    const { transports } = build(['a', 'b']);
    transports.get('b')!.onMessage(async (msg) => {
      expect(msg.from).toBe('a');
      return { type: 'vote-response', from: 'b', to: 'a', payload: { granted: true, term: msg.term } };
    });
    const reply = await transports.get('a')!.send('b', { type: 'request-vote', payload: { candidateId: 'a' }, term: 1 });
    expect(reply).not.toBeNull();
    expect(reply!.type).toBe('vote-response');
    expect((reply!.payload as { granted: boolean }).granted).toBe(true);
    await transports.get('a')!.close(); await transports.get('b')!.close();
  });

  it('broadcast reaches every peer (no replies expected)', async () => {
    const { transports } = build(['a', 'b', 'c']);
    const seenB: string[] = []; const seenC: string[] = [];
    transports.get('b')!.onMessage((m) => { seenB.push(m.type); });
    transports.get('c')!.onMessage((m) => { seenC.push(m.type); });
    await transports.get('a')!.broadcast({ type: 'pre-prepare', payload: { digest: 'd1' }, viewNumber: 0 });
    await new Promise(r => setTimeout(r, 10)); // let microtasks drain
    expect(seenB).toEqual(['pre-prepare']);
    expect(seenC).toEqual(['pre-prepare']);
    for (const t of transports.values()) await t.close();
  });

  it('send to a peer with no address rejects', async () => {
    const { transports } = build(['a']);
    await expect(transports.get('a')!.send('ghost', { type: 'x', payload: {} })).rejects.toThrow(/no address/);
    await transports.get('a')!.close();
  });

  it('send times out if no reply arrives', async () => {
    const { transports } = build(['a', 'b']);
    transports.get('b')!.onMessage(() => { /* no reply */ });
    await expect(transports.get('a')!.send('b', { type: 'x', payload: {} }, 50)).rejects.toThrow(/timed out/);
    await transports.get('a')!.close(); await transports.get('b')!.close();
  });

  it('peers() excludes self', async () => {
    const { transports } = build(['a', 'b', 'c']);
    expect(new Set(transports.get('a')!.peers())).toEqual(new Set(['b', 'c']));
    for (const t of transports.values()) await t.close();
  });

  it('signs outbound + verifies inbound when keypairs are configured', async () => {
    const mesh = new MockMesh();
    const addr: Record<string, string> = { a: 'ws://a:9101', b: 'ws://b:9101' };
    const addressOf = (id: string) => addr[id];
    const kpA = generateNodeKeyPair(); const kpB = generateNodeKeyPair();
    const pubs: Record<string, string> = { a: kpA.publicKeyPem, b: kpB.publicKeyPem };
    const resolvePeerPublicKey = (id: string) => pubs[id];

    const wireA = new MockWire(mesh, addr.a);
    const wireB = new MockWire(mesh, addr.b);
    const a = new FederationTransport(wireA, { nodeId: 'a', addressOf, peerIds: () => ['a', 'b'], keyPair: kpA, resolvePeerPublicKey });
    const b = new FederationTransport(wireB, { nodeId: 'b', addressOf, peerIds: () => ['a', 'b'], keyPair: kpB, resolvePeerPublicKey });

    let received: ConsensusMessage | null = null;
    b.onMessage((m) => { received = m; return { type: 'ack', from: 'b', payload: {} }; });
    const reply = await a.send('b', { type: 'commit', payload: { digest: 'x' } });
    expect(reply).not.toBeNull();
    expect(received).not.toBeNull();
    expect(received!.signature).toBeTruthy();
    expect(received!.seq).toBe(1);
    await a.close(); await b.close();
  });

  it('drops an unsigned inbound message at a signing-enabled node', async () => {
    const mesh = new MockMesh();
    const addr: Record<string, string> = { a: 'ws://a:9101', b: 'ws://b:9101' };
    const addressOf = (id: string) => addr[id];
    const kpB = generateNodeKeyPair();
    const resolvePeerPublicKey = (id: string) => (id === 'b' ? kpB.publicKeyPem : undefined);

    const wireA = new MockWire(mesh, addr.a);
    const wireB = new MockWire(mesh, addr.b);
    const a = new FederationTransport(wireA, { nodeId: 'a', addressOf, peerIds: () => ['a', 'b'] }); // no keypair → unsigned
    const b = new FederationTransport(wireB, { nodeId: 'b', addressOf, peerIds: () => ['a', 'b'], keyPair: kpB, resolvePeerPublicKey });

    let handlerCalled = false;
    b.onMessage(() => { handlerCalled = true; return { type: 'ack', from: 'b', payload: {} }; });
    // The unsigned message is dropped at `b`, so `a`'s send never gets a reply → times out.
    await expect(a.send('b', { type: 'commit', payload: {} }, 50)).rejects.toThrow(/timed out/);
    expect(handlerCalled).toBe(false);
    await a.close(); await b.close();
  });
});
