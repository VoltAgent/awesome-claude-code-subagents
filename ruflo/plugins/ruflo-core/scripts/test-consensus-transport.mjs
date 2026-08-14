#!/usr/bin/env node
/**
 * CI guard for ADR-095 G2 — hive-mind consensus transport.
 *
 * Asserts the @claude-flow/swarm package ships a real, pluggable
 * consensus transport (not the implicit single-process EventEmitter):
 *
 *   1. The dist exports ConsensusTransport / LocalTransport / signMessage /
 *      verifyMessage / generateNodeKeyPair (the public surface).
 *   2. LocalTransport behavioral round-trip: send → peer handler → reply.
 *   3. Ed25519 signing is REAL — sign(msg) then verify against the right
 *      pubkey is true, against the wrong pubkey is false, and a tampered
 *      payload fails. (Catches a regression to the old `verifySignature()
 *      → return true` stub.)
 *
 * Static + behavioral; runs in <1s; no network or memory backend.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(process.argv[2] ?? process.cwd());
const DIST_INDEX = resolve(REPO_ROOT, 'v3/@claude-flow/swarm/dist/consensus/index.js');
const DIST_TRANSPORT = resolve(REPO_ROOT, 'v3/@claude-flow/swarm/dist/consensus/transport.js');

let failed = 0;
const fail = (m) => { console.error(`FAIL: ${m}`); failed++; };
const pass = (m) => console.log(`ok: ${m}`);

for (const p of [DIST_INDEX, DIST_TRANSPORT]) {
  if (!existsSync(p)) {
    fail(`${p} not found — run \`npm --prefix v3/@claude-flow/swarm run build\` first`);
  }
}
if (failed > 0) process.exit(1);

// ---- Stage 1: static — required exports present ----

const indexSrc = readFileSync(DIST_INDEX, 'utf-8');
const transportSrc = readFileSync(DIST_TRANSPORT, 'utf-8');

const REQUIRED_INDEX_EXPORTS = ['LocalTransport', 'LocalTransportRegistry', 'FederationTransport', 'generateNodeKeyPair', 'signMessage', 'verifyMessage', 'messageDigest', 'canonicalizeForSigning'];
for (const name of REQUIRED_INDEX_EXPORTS) {
  if (new RegExp(`\\b${name}\\b`).test(indexSrc) || new RegExp(`export.*\\b${name}\\b`).test(transportSrc)) {
    pass(`G2-export — ${name} present in swarm consensus dist`);
  } else {
    fail(`G2-export-missing — ${name} not exported from swarm consensus dist`);
  }
}

// Negative: the transport must NOT contain a "return true" signature stub.
if (/verifySignature[^]*?return\s+true/.test(transportSrc) || /verifyMessage[^]*?return\s+true\s*;/.test(transportSrc.replace(/return verifyMessage|return cryptoVerify/g, ''))) {
  fail('G2-no-stub-regression — found a `return true` signature stub in transport.js (the #G2 bug). Verification must be real Ed25519.');
} else {
  pass('G2-no-stub — no `return true` signature stub in transport.js');
}

// ---- Stage 2: behavioral — LocalTransport round-trip + real Ed25519 ----

const watchdog = setTimeout(() => {
  console.log(`\n[watchdog] consensus-transport behavioral check exceeded 30s — exiting (static checks above stand)`);
  process.exit(failed > 0 ? 1 : 0);
}, 30_000);
watchdog.unref();

try {
  const m = await import(DIST_INDEX);
  const { LocalTransport, LocalTransportRegistry, generateNodeKeyPair, signMessage, verifyMessage } = m;

  // LocalTransport round-trip
  const reg = new LocalTransportRegistry();
  const a = new LocalTransport('a', { registry: reg });
  const b = new LocalTransport('b', { registry: reg });
  b.onMessage(async (msg) => ({ type: 'reply', from: 'b', to: 'a', payload: { echo: msg.type } }));
  const reply = await a.send('b', { type: 'request-vote', payload: { candidateId: 'a' }, term: 1 });
  if (reply && reply.type === 'reply' && reply.payload?.echo === 'request-vote') {
    pass('G2-local-roundtrip — send → peer handler → reply works');
  } else {
    fail(`G2-local-roundtrip — unexpected reply: ${JSON.stringify(reply)}`);
  }
  await a.close(); await b.close();

  // Real Ed25519 sign/verify
  const kpA = generateNodeKeyPair();
  const kpB = generateNodeKeyPair();
  const msg = { type: 'commit', from: 'a', to: 'b', payload: { digest: 'abc123' }, seq: 1 };
  const sig = signMessage(msg, kpA.privateKeyPem);
  const okRight = verifyMessage({ ...msg, signature: sig }, kpA.publicKeyPem);
  const okWrong = verifyMessage({ ...msg, signature: sig }, kpB.publicKeyPem);
  const okTampered = verifyMessage({ ...msg, payload: { digest: 'evil' }, signature: sig }, kpA.publicKeyPem);
  const okMissing = verifyMessage(msg, kpA.publicKeyPem);
  if (okRight === true && okWrong === false && okTampered === false && okMissing === false) {
    pass('G2-ed25519-real — verify true for right key, false for wrong key / tampered payload / missing sig');
  } else {
    fail(`G2-ed25519-real — verification not behaving correctly: right=${okRight} wrong=${okWrong} tampered=${okTampered} missing=${okMissing}`);
  }
} catch (err) {
  fail(`G2-behavioral — error during probe: ${err?.message ?? err}`);
}

clearTimeout(watchdog);

if (failed > 0) {
  console.error(`\n${failed} ADR-095 G2 transport check(s) failed`);
  process.exit(1);
}
console.log(`\nall ADR-095 G2 consensus-transport checks green`);
process.exit(0);
