/**
 * ADR-095 G2 — FederationTransport: a ConsensusTransport backed by the
 * federation plugin's ADR-104 WS wire (agentic-flow/transport/loader).
 *
 * @claude-flow/swarm has zero runtime dependencies and shouldn't take a
 * hard dep on @claude-flow/plugin-agent-federation (the wiring would also
 * be circular-ish). So this adapter takes its WS primitives by injection:
 * pass an object that satisfies `AgenticFlowTransportLike` (which the
 * federation plugin's `loadQuicTransport` result does) plus a small amount
 * of consensus-level metadata (this node's id, how to address peers, who
 * the peers are).
 *
 * The agentic-flow transport is fire-and-forget message delivery; this
 * adapter layers request-response on top via per-message correlation ids
 * (`corr`) + a pending-replies map + per-call timeout. Stream multiplexing
 * (ADR-104 stream-mux) is used for the `streamId` so consensus traffic
 * doesn't interleave with application traffic on the same connection.
 *
 * Optional Ed25519 signing: when a keypair is supplied, outbound messages
 * are signed and inbound are verified against the sender's published
 * public key (resolved via `resolvePeerPublicKey`) before reaching the
 * handler. Fail-closed — an unverifiable inbound message is dropped.
 */

import { randomBytes } from 'node:crypto';
import type {
  ConsensusTransport,
  ConsensusMessage,
  ConsensusReply,
  ConsensusMessageHandler,
  NodeKeyPair,
} from './transport.js';
import { signMessage, verifyMessage } from './transport.js';

/**
 * Minimal shape of the agentic-flow transport (the `loadQuicTransport`
 * result). We only need send + onMessage + (optional) close. Keeping this
 * structural means swarm doesn't import agentic-flow.
 */
export interface AgenticFlowTransportLike {
  send(address: string, message: { type?: string; payload: unknown; streamId?: string }): Promise<void>;
  onMessage(handler: (msg: { from?: string; address?: string; type?: string; payload: unknown }) => void | Promise<void>): void;
  close?(): Promise<void> | void;
}

/** What we put on the wire — a ConsensusMessage plus correlation metadata. */
interface WireEnvelope {
  /** Correlation id — present on requests; the reply echoes it. */
  readonly corr?: string;
  /** True if this envelope is a reply to a `corr` request. */
  readonly isReply?: boolean;
  /** The consensus message. `from` is filled by us. */
  readonly msg: ConsensusMessage;
}

export interface FederationTransportOptions {
  /** This node's consensus id (the `from` on outbound messages). */
  readonly nodeId: string;
  /** Map a consensus nodeId → the WS address agentic-flow uses to reach it. Return undefined for unknown peers. */
  readonly addressOf: (nodeId: string) => string | undefined;
  /** Currently-known peer consensus node ids (excludes self — or includes; we filter). */
  readonly peerIds: () => readonly string[];
  /** Stream id for consensus traffic (ADR-104 stream-mux). Defaults to 'ruflo-consensus'. */
  readonly streamId?: string;
  /** Default per-`send` timeout in ms. Defaults to 5000. */
  readonly defaultTimeoutMs?: number;
  /** Optional Ed25519 keypair — signs outbound, verifies inbound. */
  readonly keyPair?: NodeKeyPair;
  /** Resolve a peer consensus nodeId → its Ed25519 public key PEM. Required if `keyPair` is set and you want verification. */
  readonly resolvePeerPublicKey?: (nodeId: string) => string | undefined;
}

export class FederationTransport implements ConsensusTransport {
  readonly nodeId: string;
  private readonly wire: AgenticFlowTransportLike;
  private readonly addressOf: (nodeId: string) => string | undefined;
  private readonly peerIdsFn: () => readonly string[];
  private readonly streamId: string;
  private readonly defaultTimeoutMs: number;
  private readonly keyPair?: NodeKeyPair;
  private readonly resolvePeerPublicKey?: (nodeId: string) => string | undefined;
  private handler: ConsensusMessageHandler | null = null;
  private closed = false;
  private seqCounter = 0;
  private readonly pending = new Map<string, { resolve: (r: ConsensusReply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly lastSeenSeq = new Map<string, number>();

  constructor(wire: AgenticFlowTransportLike, opts: FederationTransportOptions) {
    this.wire = wire;
    this.nodeId = opts.nodeId;
    this.addressOf = opts.addressOf;
    this.peerIdsFn = opts.peerIds;
    this.streamId = opts.streamId ?? 'ruflo-consensus';
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 5_000;
    this.keyPair = opts.keyPair;
    this.resolvePeerPublicKey = opts.resolvePeerPublicKey;

    this.wire.onMessage(async (raw) => {
      if (this.closed) return;
      const env = raw.payload as WireEnvelope | undefined;
      if (!env || !env.msg) return;
      const msg = env.msg;

      // Signature verification (if this node expects signed messages).
      if (this.keyPair && this.resolvePeerPublicKey) {
        const pub = this.resolvePeerPublicKey(msg.from);
        if (!pub || !verifyMessage(msg, pub)) return; // fail-closed: drop
        if (typeof msg.seq === 'number') {
          const last = this.lastSeenSeq.get(msg.from) ?? 0;
          if (msg.seq <= last) return; // replayed / out of order: drop
          this.lastSeenSeq.set(msg.from, msg.seq);
        }
      }

      // Reply to a pending `send`?
      if (env.isReply && env.corr) {
        const p = this.pending.get(env.corr);
        if (p) { clearTimeout(p.timer); this.pending.delete(env.corr); p.resolve(msg); }
        return;
      }

      // Inbound request → run the handler; if it returns a reply, send it back.
      if (this.handler) {
        const reply = await this.handler(msg);
        if (reply && env.corr) {
          const addr = this.addressOf(msg.from);
          if (addr) {
            const replyMsg = this.stamp({ ...reply, to: msg.from });
            await this.wire.send(addr, { type: 'consensus', payload: { corr: env.corr, isReply: true, msg: replyMsg } as WireEnvelope, streamId: this.streamId }).catch(() => {});
          }
        }
      }
    });
  }

  onMessage(handler: ConsensusMessageHandler): void {
    this.handler = handler;
  }

  peers(): readonly string[] {
    return this.peerIdsFn().filter(id => id !== this.nodeId);
  }

  private stamp(msg: Omit<ConsensusMessage, 'from'>): ConsensusMessage {
    const base: Omit<ConsensusMessage, 'signature'> = {
      ...msg,
      from: this.nodeId,
      seq: this.keyPair ? ++this.seqCounter : msg.seq,
    };
    return this.keyPair ? { ...base, signature: signMessage(base, this.keyPair.privateKeyPem) } : base;
  }

  async send(to: string, msg: Omit<ConsensusMessage, 'from'>, timeoutMs?: number): Promise<ConsensusReply> {
    if (this.closed) throw new Error('FederationTransport: closed');
    const addr = this.addressOf(to);
    if (!addr) throw new Error(`FederationTransport: no address for peer ${to}`);
    const corr = randomBytes(8).toString('hex');
    const stamped = this.stamp({ ...msg, to });
    const t = timeoutMs ?? this.defaultTimeoutMs;
    return new Promise<ConsensusReply>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(corr); reject(new Error(`FederationTransport: send to ${to} timed out (${t}ms)`)); }, t);
      this.pending.set(corr, { resolve, reject, timer });
      this.wire.send(addr, { type: 'consensus', payload: { corr, msg: stamped } as WireEnvelope, streamId: this.streamId })
        .catch((e) => { clearTimeout(timer); this.pending.delete(corr); reject(e instanceof Error ? e : new Error(String(e))); });
    });
  }

  async broadcast(msg: Omit<ConsensusMessage, 'from'>): Promise<void> {
    if (this.closed) throw new Error('FederationTransport: closed');
    const stamped = this.stamp(msg);
    await Promise.allSettled(this.peers().map(async (to) => {
      const addr = this.addressOf(to);
      if (!addr) return;
      await this.wire.send(addr, { type: 'consensus', payload: { msg: stamped } as WireEnvelope, streamId: this.streamId }).catch(() => {});
    }));
  }

  async close(): Promise<void> {
    this.closed = true;
    this.handler = null;
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('FederationTransport: closed')); }
    this.pending.clear();
    if (this.wire.close) await this.wire.close();
  }
}
