#!/usr/bin/env node
/**
 * ADR-111 Phase 7 staging helper. Generates WG configs + firewall rules on
 * the current host, naming a single peer. Outputs go to a staging dir;
 * NOTHING is loaded into the kernel — `wg-quick up`, `nft -f`, `pfctl -f`
 * are operator-mediated.
 *
 * Usage:
 *   node scripts/phase7-stage.mjs <localNodeId> <peerNodeId> <peerPubkey> <peerMeshIP> <peerEndpoint>
 *
 * Where peerPubkey / peerMeshIP / peerEndpoint come from the peer host's
 * own staging run. The two hosts swap these out-of-band before activation.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const distRoot = join(__dirname, '..', 'dist');
const wgConfig = await import(join(distRoot, 'domain/value-objects/wg-config.js'));
const wgMesh = await import(join(distRoot, 'domain/services/wg-mesh-service.js'));
const wgFirewall = await import(join(distRoot, 'domain/services/wg-firewall-service.js'));
const trustLevel = await import(join(distRoot, 'domain/entities/trust-level.js'));

const [, , localNodeId, peerNodeId, peerPubkey, peerMeshIPArg, peerEndpoint] = process.argv;
if (!localNodeId || !peerNodeId || !peerPubkey || !peerMeshIPArg || !peerEndpoint) {
  console.error(`Usage: node scripts/phase7-stage.mjs <localNodeId> <peerNodeId> <peerPubkey> <peerMeshIP> <peerEndpoint>

If you don't yet have the peer's pubkey, run this on EACH host with
placeholder values (e.g. 'TBD-x44=' '10.50.0.0/32' 'tbd:51820') to
generate the local key, then exchange and re-run with real values.`);
  process.exit(1);
}

const stageDir = '/tmp/adr-111-stage';
if (!existsSync(stageDir)) mkdirSync(stageDir, { recursive: true });

// Idempotent: reuse a previously-generated key if present so subsequent runs
// with corrected peer args don't churn the pubkey. Key is mode 0600.
const keyFile = join(stageDir, `wg-key-${localNodeId}.json`);
let localKey;
if (existsSync(keyFile)) {
  const persisted = JSON.parse(readFileSync(keyFile, 'utf-8'));
  localKey = { publicKey: persisted.publicKey, privateKey: persisted.privateKey, createdAt: persisted.createdAt };
  console.log(`[reused existing key from ${keyFile}]`);
} else {
  localKey = wgConfig.generateWgKeyPair();
}
const localMeshIP = wgConfig.deriveMeshIP(localNodeId);
const peerMeshIP = peerMeshIPArg.startsWith('TBD')
  ? wgConfig.deriveMeshIP(peerNodeId)
  : peerMeshIPArg;

console.log('=== Local identity (this host) ===');
console.log(`nodeId:      ${localNodeId}`);
console.log(`meshIP:      ${localMeshIP}`);
console.log(`publicKey:   ${localKey.publicKey}     ← share this with the peer host`);
console.log(`platform:    ${process.platform}`);
console.log();
console.log('=== Peer identity (provided as arg) ===');
console.log(`nodeId:      ${peerNodeId}`);
console.log(`meshIP:      ${peerMeshIP}`);
console.log(`publicKey:   ${peerPubkey}`);
console.log(`endpoint:    ${peerEndpoint}`);
console.log();

// Persist local private key (mode 0600) for operator to move to .claude-flow/federation/
writeFileSync(
  join(stageDir, `wg-key-${localNodeId}.json`),
  JSON.stringify(
    { nodeId: localNodeId, ...localKey, meshIP: localMeshIP },
    null, 2,
  ),
  { mode: 0o600 },
);

// Build the wg-quick interface config naming the peer
const meshSvc = new wgMesh.WgMeshService({ listenPort: 51820 });
meshSvc.setLocalIdentity(localKey, localMeshIP);

// FederationNode-shaped object for the service. ATTESTED gets full mesh
// reachability in v1; the firewall service will narrow ports per
// WG_NETWORK_GATES once Phase 4 firewall rules load.
const fakePeer = {
  nodeId: peerNodeId,
  trustLevel: trustLevel.TrustLevel.ATTESTED,
  metadata: {
    wgPublicKey: peerPubkey,
    wgMeshIP: peerMeshIP,
    wgEndpoint: peerEndpoint,
  },
};

let interfaceConfig;
try {
  interfaceConfig = meshSvc.buildInterfaceConfig([fakePeer]);
} catch (e) {
  console.error('ERROR: buildInterfaceConfig refused — peer field validation failed.');
  console.error(`  Likely cause: peerPubkey / peerMeshIP / peerEndpoint format unexpected.`);
  console.error(`  ${e?.message ?? e}`);
  process.exit(2);
}
writeFileSync(join(stageDir, 'ruflo-fed.conf'), interfaceConfig);

// Firewall projection per OS
const fw = new wgFirewall.WgFirewallService();
const fwFile = process.platform === 'linux' ? 'ruflo-fed.nft' : 'ruflo-fed.pf';
const fwResult = fw.projectRules([fakePeer]);
writeFileSync(join(stageDir, fwFile), fwResult.content);

console.log('=== Staged files ===');
console.log(`  ${stageDir}/wg-key-${localNodeId}.json   (mode 0600 — local private key)`);
console.log(`  ${stageDir}/ruflo-fed.conf               (wg-quick config)`);
console.log(`  ${stageDir}/${fwFile}                    (firewall projection)`);
console.log();
console.log('=== Activation checklist (operator-mediated; NOT auto-run) ===');
console.log('  [ ] Cross-check: peer host ran the same staging with our local pubkey above?');
console.log('  [ ] Review ruflo-fed.conf for unexpected [Peer] blocks (defense vs compromised manifest)');
console.log('  [ ] Verify the AllowedIPs only includes the peer\'s mesh IP, not broader CIDR');
console.log('  [ ] Confirm UDP/51820 is open between the two hosts');
console.log();
console.log('=== Activation commands ===');
console.log(`  sudo install -m 0600 ${stageDir}/ruflo-fed.conf /etc/wireguard/ruflo-fed.conf`);
if (process.platform === 'linux') {
  console.log(`  sudo nft -f ${stageDir}/${fwFile}`);
} else {
  console.log(`  sudo pfctl -a ruflo-fed -f ${stageDir}/${fwFile}`);
}
console.log('  sudo wg-quick up ruflo-fed');
console.log();
console.log('=== Verification ===');
console.log('  sudo wg show ruflo-fed');
console.log(`  ping ${peerMeshIP.replace('/32', '')}    # mesh reachability`);
console.log();
console.log('=== Rollback ===');
console.log('  sudo wg-quick down ruflo-fed');
if (process.platform === 'linux') {
  console.log('  sudo nft delete table inet ruflo_fed');
} else {
  console.log('  sudo pfctl -a ruflo-fed -F all');
}
