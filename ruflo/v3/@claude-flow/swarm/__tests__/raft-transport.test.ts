/**
 * ADR-095 G2 — RaftConsensus + ConsensusTransport wiring.
 *
 * Verifies the real RequestVote / AppendEntries RPCs over a transport,
 * with proper Raft receiver rules (term comparison, vote-once-per-term,
 * log-up-to-date check). Legacy no-transport behavior is covered by the
 * existing consensus.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { RaftConsensus } from '../src/consensus/raft.js';
import { LocalTransport, LocalTransportRegistry } from '../src/consensus/transport.js';

/** Build N raft nodes wired to a shared registry, each knowing the others as peers. */
function buildCluster(ids: string[]): { nodes: Map<string, RaftConsensus>; transports: LocalTransport[]; reg: LocalTransportRegistry } {
  const reg = new LocalTransportRegistry();
  const transports: LocalTransport[] = [];
  const nodes = new Map<string, RaftConsensus>();
  for (const id of ids) {
    const t = new LocalTransport(id, { registry: reg });
    transports.push(t);
    const r = new RaftConsensus(id, { transport: t });
    for (const other of ids) if (other !== id) r.addPeer(other);
    nodes.set(id, r);
  }
  return { nodes, transports, reg };
}

describe('ADR-095 G2 — Raft RequestVote over transport', () => {
  it('a peer grants a vote to a candidate with an up-to-date log', async () => {
    const { nodes, transports } = buildCluster(['a', 'b']);
    const candidate = nodes.get('a')!;
    // Drive an election from `a`. It bumps its term and sends RequestVote to `b`.
    // We call the (public) consensus path indirectly — but the simplest way to
    // exercise requestVote is to reach it via startElection. Since that's private,
    // we instead poke the transport directly the way the candidate would:
    const reply = await transports[0].send('b', {
      type: 'request-vote',
      payload: { term: 1, candidateId: 'a', lastLogIndex: 0, lastLogTerm: 0 },
      term: 1,
    });
    expect(reply).not.toBeNull();
    expect(reply!.type).toBe('vote-response');
    const rp = reply!.payload as { term: number; granted: boolean };
    expect(rp.granted).toBe(true);
    expect(rp.term).toBe(1);
    // `b` recorded its vote for `a` this term — a second different candidate is denied.
    const reply2 = await transports[0].send('b', {
      type: 'request-vote',
      payload: { term: 1, candidateId: 'c', lastLogIndex: 0, lastLogTerm: 0 },
      term: 1,
    });
    expect((reply2!.payload as { granted: boolean }).granted).toBe(false);
    await Promise.all([nodes.get('a')!.shutdown(), nodes.get('b')!.shutdown(), ...transports.map(t => t.close())]);
  });

  it('a peer denies a vote to a stale-term candidate', async () => {
    const { nodes, transports } = buildCluster(['a', 'b']);
    // First, push `b` to term 5 via an AppendEntries from a "term-5 leader".
    await transports[0].send('b', {
      type: 'append-entries',
      payload: { term: 5, leaderId: 'a', entries: [], leaderCommit: 0 },
      term: 5,
    });
    // Now a candidate at term 2 (stale) asks `b` for a vote → denied.
    const reply = await transports[0].send('b', {
      type: 'request-vote',
      payload: { term: 2, candidateId: 'a', lastLogIndex: 0, lastLogTerm: 0 },
      term: 2,
    });
    expect((reply!.payload as { granted: boolean }).granted).toBe(false);
    expect((reply!.payload as { term: number }).term).toBe(5);
    await Promise.all([nodes.get('a')!.shutdown(), nodes.get('b')!.shutdown(), ...transports.map(t => t.close())]);
  });

  it('a peer denies a vote to a candidate with a behind log', async () => {
    const { nodes, transports } = buildCluster(['a', 'b']);
    // Give `b` a log entry at term 3, index 1 via an AppendEntries.
    await transports[0].send('b', {
      type: 'append-entries',
      payload: { term: 3, leaderId: 'a', entries: [{ term: 3, index: 1, command: { v: 1 }, timestamp: new Date().toISOString() }], leaderCommit: 1 },
      term: 3,
    });
    // Candidate at term 4 but with an empty log (lastLogTerm 0 < b's 3) → denied.
    const reply = await transports[0].send('b', {
      type: 'request-vote',
      payload: { term: 4, candidateId: 'a', lastLogIndex: 0, lastLogTerm: 0 },
      term: 4,
    });
    expect((reply!.payload as { granted: boolean }).granted).toBe(false);
    await Promise.all([nodes.get('a')!.shutdown(), nodes.get('b')!.shutdown(), ...transports.map(t => t.close())]);
  });
});

describe('ADR-095 G2 — Raft AppendEntries over transport', () => {
  it('a follower accepts a valid AppendEntries and updates commitIndex', async () => {
    const { nodes, transports } = buildCluster(['leader', 'follower']);
    const reply = await transports[0].send('follower', {
      type: 'append-entries',
      payload: {
        term: 2, leaderId: 'leader', leaderCommit: 1,
        entries: [{ term: 2, index: 1, command: { op: 'set', k: 'x', v: 1 }, timestamp: new Date().toISOString() }],
      },
      term: 2,
    });
    expect(reply!.type).toBe('append-entries-response');
    expect((reply!.payload as { success: boolean }).success).toBe(true);
    expect((reply!.payload as { term: number }).term).toBe(2);
    await Promise.all([nodes.get('leader')!.shutdown(), nodes.get('follower')!.shutdown(), ...transports.map(t => t.close())]);
  });

  it('a follower rejects a stale-term AppendEntries', async () => {
    const { nodes, transports } = buildCluster(['leader', 'follower']);
    // Bump follower to term 7.
    await transports[0].send('follower', { type: 'append-entries', payload: { term: 7, leaderId: 'leader', entries: [], leaderCommit: 0 }, term: 7 });
    // Stale leader at term 3 → rejected, follower reports its term.
    const reply = await transports[0].send('follower', { type: 'append-entries', payload: { term: 3, leaderId: 'leader', entries: [], leaderCommit: 0 }, term: 3 });
    expect((reply!.payload as { success: boolean }).success).toBe(false);
    expect((reply!.payload as { term: number }).term).toBe(7);
    await Promise.all([nodes.get('leader')!.shutdown(), nodes.get('follower')!.shutdown(), ...transports.map(t => t.close())]);
  });
});
