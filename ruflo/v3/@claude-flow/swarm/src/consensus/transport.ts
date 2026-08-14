/**
 * ADR-095 G2 — pluggable transport for hive-mind consensus protocols.
 *
 * The raft/byzantine/gossip consensus implementations historically used a
 * local `EventEmitter` for *everything* — both observability events
 * ("leader.elected", "consensus.achieved") AND inter-node messages
 * (append-entries, vote requests, pre-prepare/prepare/commit). The latter
 * never actually crossed a process or node boundary: a node "sent" a
 * message by `emit`ting it locally and synthesizing the peer's reply
 * inline. That's the single-process limitation #G2 names.
 *
 * This module separates the inter-node-message dimension behind a
 * `ConsensusTransport` interface. Two implementations:
 *
 *   - `LocalTransport` — an in-process registry. Multiple consensus
 *     instances in the same Node process share a registry and deliver
 *     messages to each other synchronously. Matches the current
 *     single-process behavior; the default so nothing breaks.
 *   - `FederationTransport` (separate file, ADR-104 wire) — serializes
 *     ConsensusMessages into federation envelopes, signs them with the
 *     node's Ed25519 key, sends over WS via agentic-flow/transport/loader,
 *     and dispatches inbound envelopes with signature verification.
 *
 * Observability events stay on the consensus class's own EventEmitter —
 * this is purely the messaging layer.
 *
 * No new dependencies: Ed25519 signing uses Node's built-in `crypto`
 * (`generateKeyPairSync('ed25519')` + `sign`/`verify` with `null` algorithm,
 * which is correct for Ed25519).
 */

import { createHash, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, createPrivateKey, createPublicKey } from 'node:crypto';

/** A message exchanged between consensus nodes. */
export interface ConsensusMessage {
  /** Protocol message type — e.g. 'append-entries', 'request-vote', 'pre-prepare', 'prepare', 'commit', 'gossip', 'gossip-ack'. */
  readonly type: string;
  /** Sender node id. */
  readonly from: string;
  /** Recipient node id. Omit for broadcast. */
  readonly to?: string;
  /** Protocol payload (term, log entries, vote, digest, …). */
  readonly payload: unknown;
  /** Raft term, when applicable. Lets the transport drop stale-term messages cheaply. */
  readonly term?: number;
  /** PBFT view number, when applicable. */
  readonly viewNumber?: number;
  /** Monotonic per-sender sequence number — replay defense. */
  readonly seq?: number;
  /** Ed25519 signature (base64) over `canonicalizeForSigning(msg)`. */
  readonly signature?: string;
}

/**
 * A reply to a `send()`. Protocols use this for the request-response legs
 * (request-vote → vote-response, append-entries → append-entries-response).
 * Broadcasts don't get replies; responses arrive via `onMessage`.
 */
export type ConsensusReply = ConsensusMessage | null;

export type ConsensusMessageHandler = (msg: ConsensusMessage) => Promise<ConsensusReply | void> | ConsensusReply | void;

export interface ConsensusTransport {
  /** This node's id (the one consensus protocols use as `from`). */
  readonly nodeId: string;
  /**
   * Send a message to a specific peer. Resolves with the peer's reply
   * (or `null` if the peer ack'd without a reply), rejects on timeout or
   * unreachable peer. `timeoutMs` defaults to the transport's configured value.
   */
  send(to: string, msg: Omit<ConsensusMessage, 'from'>, timeoutMs?: number): Promise<ConsensusReply>;
  /** Broadcast to all currently-reachable peers. Resolves once dispatched; replies (if any) arrive via onMessage. */
  broadcast(msg: Omit<ConsensusMessage, 'from'>): Promise<void>;
  /** Register the inbound-message handler. Calling again replaces the previous handler. */
  onMessage(handler: ConsensusMessageHandler): void;
  /** Currently-reachable peer node ids (excludes self). */
  peers(): readonly string[];
  /** Tear down. After close(), send/broadcast reject. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Ed25519 signing helpers — used by transports that sign messages on the wire.
// ---------------------------------------------------------------------------

export interface NodeKeyPair {
  /** Ed25519 private key in PKCS8 PEM. */
  readonly privateKeyPem: string;
  /** Ed25519 public key in SPKI PEM. */
  readonly publicKeyPem: string;
}

/** Generate a fresh Ed25519 keypair for a consensus node. */
export function generateNodeKeyPair(): NodeKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  };
}

/**
 * Recursively sort object keys so JSON serialization is deterministic
 * regardless of insertion order — at every nesting level, not just the top.
 * Arrays keep their order (order is semantically meaningful, e.g. log entries).
 */
function deepSortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(deepSortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = deepSortKeys(val);
    }
    return out;
  }
  return v;
}

/**
 * Canonical byte string for signing. Deterministic across hosts: deep-sorted-key
 * JSON of the message's content fields (everything except `signature`).
 */
export function canonicalizeForSigning(msg: Omit<ConsensusMessage, 'signature'>): Buffer {
  return Buffer.from(JSON.stringify(deepSortKeys(msg)), 'utf-8');
}

/** Stable digest of a message's content — handy for dedup and logging. */
export function messageDigest(msg: Omit<ConsensusMessage, 'signature'>): string {
  return createHash('sha256').update(canonicalizeForSigning(msg)).digest('hex');
}

/** Sign a message with an Ed25519 private key (PEM). Returns base64 signature. */
export function signMessage(msg: Omit<ConsensusMessage, 'signature'>, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  const sig = cryptoSign(null, canonicalizeForSigning(msg), key);
  return sig.toString('base64');
}

/**
 * Verify a signed message against a peer's Ed25519 public key (PEM).
 * Returns true iff the signature is present and valid over the message's
 * content fields. Fail-closed: a missing signature returns false.
 */
export function verifyMessage(msg: ConsensusMessage, publicKeyPem: string): boolean {
  if (typeof msg.signature !== 'string' || msg.signature.length === 0) return false;
  try {
    const { signature, ...content } = msg;
    const key = createPublicKey(publicKeyPem);
    return cryptoVerify(null, canonicalizeForSigning(content), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// LocalTransport — in-process registry. The default. Matches single-process.
// ---------------------------------------------------------------------------

/**
 * Shared registry of LocalTransport instances. Multiple consensus nodes in
 * the same process register here; send/broadcast deliver to peers' handlers.
 * Use a fresh registry per test to keep tests isolated.
 */
export class LocalTransportRegistry {
  private readonly nodes = new Map<string, LocalTransport>();

  register(t: LocalTransport): void {
    this.nodes.set(t.nodeId, t);
  }
  unregister(nodeId: string): void {
    this.nodes.delete(nodeId);
  }
  get(nodeId: string): LocalTransport | undefined {
    return this.nodes.get(nodeId);
  }
  peerIds(exclude: string): string[] {
    return [...this.nodes.keys()].filter(id => id !== exclude);
  }
}

/** Process-wide default registry. Tests should pass their own. */
export const defaultLocalRegistry = new LocalTransportRegistry();

export interface LocalTransportOptions {
  readonly registry?: LocalTransportRegistry;
  readonly defaultTimeoutMs?: number;
  /** Optional Ed25519 keypair — when set, outbound messages are signed and inbound are verified against the sender's pubkey (resolved via `resolvePeerPublicKey`). */
  readonly keyPair?: NodeKeyPair;
  /** Map a peer nodeId → its Ed25519 public key PEM. Required if `keyPair` is set and you want verification. */
  readonly resolvePeerPublicKey?: (nodeId: string) => string | undefined;
}

export class LocalTransport implements ConsensusTransport {
  readonly nodeId: string;
  private readonly registry: LocalTransportRegistry;
  private readonly defaultTimeoutMs: number;
  private readonly keyPair?: NodeKeyPair;
  private readonly resolvePeerPublicKey?: (nodeId: string) => string | undefined;
  private handler: ConsensusMessageHandler | null = null;
  private closed = false;
  private seqCounter = 0;
  /** Per-sender last-seen seq for replay defense (only used when signed). */
  private readonly lastSeenSeq = new Map<string, number>();

  constructor(nodeId: string, opts: LocalTransportOptions = {}) {
    this.nodeId = nodeId;
    this.registry = opts.registry ?? defaultLocalRegistry;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 5_000;
    this.keyPair = opts.keyPair;
    this.resolvePeerPublicKey = opts.resolvePeerPublicKey;
    this.registry.register(this);
  }

  onMessage(handler: ConsensusMessageHandler): void {
    this.handler = handler;
  }

  peers(): readonly string[] {
    return this.registry.peerIds(this.nodeId);
  }

  private stamp(msg: Omit<ConsensusMessage, 'from'>): ConsensusMessage {
    const base: Omit<ConsensusMessage, 'signature'> = {
      ...msg,
      from: this.nodeId,
      seq: this.keyPair ? ++this.seqCounter : msg.seq,
    };
    if (this.keyPair) {
      return { ...base, signature: signMessage(base, this.keyPair.privateKeyPem) };
    }
    return base;
  }

  /** Deliver an inbound message to a target's handler, with optional sig + replay checks. */
  private async deliver(target: LocalTransport, msg: ConsensusMessage): Promise<ConsensusReply> {
    if (target.closed) throw new Error(`LocalTransport: peer ${target.nodeId} is closed`);
    // Verification path — only when the *target* expects signed messages.
    if (target.keyPair && target.resolvePeerPublicKey) {
      const pub = target.resolvePeerPublicKey(msg.from);
      if (!pub || !verifyMessage(msg, pub)) {
        throw new Error(`LocalTransport: signature verification failed for message from ${msg.from}`);
      }
      // Replay defense: seq must be strictly increasing per sender.
      if (typeof msg.seq === 'number') {
        const last = target.lastSeenSeq.get(msg.from) ?? 0;
        if (msg.seq <= last) throw new Error(`LocalTransport: replayed/out-of-order seq from ${msg.from} (${msg.seq} <= ${last})`);
        target.lastSeenSeq.set(msg.from, msg.seq);
      }
    }
    if (!target.handler) return null;
    const reply = await target.handler(msg);
    return (reply ?? null) as ConsensusReply;
  }

  async send(to: string, msg: Omit<ConsensusMessage, 'from'>, timeoutMs?: number): Promise<ConsensusReply> {
    if (this.closed) throw new Error('LocalTransport: closed');
    const target = this.registry.get(to);
    if (!target) throw new Error(`LocalTransport: unreachable peer ${to}`);
    const stamped = this.stamp(msg);
    const t = timeoutMs ?? this.defaultTimeoutMs;
    return Promise.race([
      this.deliver(target, stamped),
      new Promise<ConsensusReply>((_, rej) => setTimeout(() => rej(new Error(`LocalTransport: send to ${to} timed out (${t}ms)`)), t)),
    ]);
  }

  async broadcast(msg: Omit<ConsensusMessage, 'from'>): Promise<void> {
    if (this.closed) throw new Error('LocalTransport: closed');
    const stamped = this.stamp(msg);
    await Promise.allSettled(
      this.registry.peerIds(this.nodeId).map(id => {
        const target = this.registry.get(id);
        return target ? this.deliver(target, stamped).catch(() => {}) : Promise.resolve();
      }),
    );
  }

  async close(): Promise<void> {
    this.closed = true;
    this.handler = null;
    this.registry.unregister(this.nodeId);
  }
}
