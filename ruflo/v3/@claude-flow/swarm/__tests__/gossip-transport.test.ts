/**
 * ADR-095 G2 — GossipConsensus + ConsensusTransport wiring.
 *
 * Verifies gossip messages actually go over the transport to neighbors and
 * inbound gossip is routed back into the merge logic (dedup by id). Legacy
 * no-transport behavior is covered by consensus.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { GossipConsensus } from '../src/consensus/gossip.js';
import { LocalTransport, LocalTransportRegistry, type ConsensusMessage } from '../src/consensus/transport.js';

describe('ADR-095 G2 — GossipConsensus transport wiring', () => {
  it('gossip messages to a neighbor go over the transport', async () => {
    const reg = new LocalTransportRegistry();
    const tA = new LocalTransport('a', { registry: reg });
    const tB = new LocalTransport('b', { registry: reg });
    const received: ConsensusMessage[] = [];
    tB.onMessage((m) => { received.push(m); });

    const a = new GossipConsensus('a', { transport: tA, gossipIntervalMs: 1_000_000 }); // disable the auto-loop for the test
    // Reach into the private node to register a neighbor (gossip needs one to send to).
    (a as unknown as { node: { neighbors: Set<string> } }).node.neighbors.add('b');

    // Drive a gossip send by calling the private sendToNeighbor through a public path:
    // `propose` queues a proposal message; the gossip loop drains it. We disabled the
    // loop, so call the private drainer directly.
    await (a as unknown as { sendToNeighbor: (id: string, m: unknown) => Promise<void> }).sendToNeighbor('b', {
      id: 'gm-1', type: 'state', senderId: 'a', version: 1, payload: { k: 'v' }, timestamp: new Date(), ttl: 5, hops: 0, path: [],
    });

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('gossip');
    expect(received[0].from).toBe('a');
    const gm = received[0].payload as { id: string; hops: number; path: string[] };
    expect(gm.id).toBe('gm-1');
    expect(gm.hops).toBe(1);            // incremented on the way out
    expect(gm.path).toEqual(['b']);     // appended

    await a.shutdown(); await tA.close(); await tB.close();
  });

  it('inbound gossip is processed and deduped by id', async () => {
    const reg = new LocalTransportRegistry();
    const tSender = new LocalTransport('sender', { registry: reg });
    const tB = new LocalTransport('b', { registry: reg });

    const b = new GossipConsensus('b', { transport: tB, gossipIntervalMs: 1_000_000 });
    const processed: string[] = [];
    // Spy on processReceivedMessage by wrapping seenMessages.add (every processed
    // message marks itself seen first).
    const node = (b as unknown as { node: { seenMessages: { add: (id: string) => void } } }).node;
    const origAdd = node.seenMessages.add.bind(node.seenMessages);
    node.seenMessages.add = (id: string) => { processed.push(id); return origAdd(id); };

    const gm = { id: 'gm-42', type: 'state' as const, senderId: 'sender', version: 1, payload: { x: 1 }, timestamp: new Date().toISOString(), ttl: 5, hops: 1, path: ['b'] };
    // Send the same gossip message twice over the transport.
    await tSender.send('b', { type: 'gossip', payload: gm });
    await tSender.send('b', { type: 'gossip', payload: gm });

    // First arrival processed; second deduped (seenMessages.add not called again for gm-42).
    expect(processed.filter(id => id === 'gm-42').length).toBe(1);

    await b.shutdown(); await tSender.close(); await tB.close();
  });

  it('non-gossip inbound messages are ignored', async () => {
    const reg = new LocalTransportRegistry();
    const tSender = new LocalTransport('sender', { registry: reg });
    const tB = new LocalTransport('b', { registry: reg });
    const b = new GossipConsensus('b', { transport: tB, gossipIntervalMs: 1_000_000 });
    const node = (b as unknown as { node: { seenMessages: { add: (id: string) => void } } }).node;
    const seen: string[] = [];
    const origAdd = node.seenMessages.add.bind(node.seenMessages);
    node.seenMessages.add = (id: string) => { seen.push(id); return origAdd(id); };

    await tSender.send('b', { type: 'request-vote', payload: { candidateId: 'sender' }, term: 1 });
    expect(seen.length).toBe(0); // not a gossip message → not processed

    await b.shutdown(); await tSender.close(); await tB.close();
  });
});
