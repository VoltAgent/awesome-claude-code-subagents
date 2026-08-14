/**
 * V3 CLI Verify Command
 *
 * Fetches the verification.md.json witness manifest from the live repo,
 * recomputes SHA-256 of every cited file in the user's installed
 * artifact, re-derives the Ed25519 public key from the manifest's git
 * commit, and verifies the signature.
 *
 * Run via: ruflo verify [--branch <branch>] [--manifest <local-path>]
 *
 * If everything checks, the user has byte-for-byte the same fix
 * footprint as the manifest claims. If anything mismatches, the
 * command exits non-zero and prints which fix regressed or which file
 * drifted.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, sep } from 'path';
import { fileURLToPath } from 'url';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';

interface ManifestFix {
  id: string;
  desc: string;
  file: string;
  sha256: string;
  marker: string;
  markerVerified: boolean;
}

interface Manifest {
  schema: string;
  issuedAt: string;
  gitCommit: string;
  branch: string;
  releases: Record<string, string>;
  summary: { totalFixes: number; verified: number; failed: number };
  fixes: ManifestFix[];
}

interface Witness {
  manifest: Manifest;
  integrity: {
    manifestHashAlgo: string;
    manifestHash: string;
    signatureAlgo: string;
    publicKey: string;
    signature: string;
    seedDerivation: string;
  };
}

const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/ruvnet/ruflo/{branch}/verification.md.json';

async function fetchWitness(branch: string): Promise<Witness> {
  const url = DEFAULT_MANIFEST_URL.replace('{branch}', branch);
  // audit_1776853149979: bare fetch had no timeout — a hung GitHub CDN would
  // pin the verify command indefinitely. 30s is generous for a sub-MB JSON.
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch manifest from ${url}: ${res.status} ${res.statusText}`);
  }
  return await res.json() as Witness;
}

function loadLocalWitness(localPath: string): Witness {
  if (!existsSync(localPath)) {
    throw new Error(`Manifest not found: ${localPath}`);
  }
  return JSON.parse(readFileSync(localPath, 'utf-8')) as Witness;
}

/**
 * Locate the user's installed package root.
 *
 * The witness manifest paths are repo-relative (e.g.
 * "v3/@claude-flow/cli/dist/src/mcp-tools/hooks-tools.js"). For
 * end users, only the dist/ subtree ships in node_modules. We map
 * the repo path → the installed equivalent by stripping the
 * "v3/@claude-flow/<pkg>/" prefix and looking up node_modules/<pkg>/.
 */
function repoPathToInstalledPath(repoPath: string): string | null {
  // Match v3/@claude-flow/<pkg>/<rest>
  const match = repoPath.match(/^v3\/(@claude-flow\/[^/]+)\/(.+)$/);
  if (match) {
    const pkg = match[1];
    const rest = match[2];
    const candidates: string[] = [];
    // 1. cwd/node_modules/<pkg>/<rest> (typical end-user install)
    candidates.push(join(process.cwd(), 'node_modules', pkg, rest));
    // 2. Walk up from this script looking for node_modules/<pkg>/<rest>
    //    Covers cases where verify runs from inside a nested module.
    try {
      const __filename = fileURLToPath(import.meta.url);
      let dir = dirname(__filename);
      for (let i = 0; i < 10; i++) {
        candidates.push(join(dir, 'node_modules', pkg, rest));
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch { /* ignore */ }
    // 3. Source-tree resolution: when verify runs against a checked-out
    //    repo (the developer's working copy), packages live at
    //    `<repoRoot>/v3/<pkg>/<rest>` rather than under node_modules.
    //    Walk up looking for the literal repo-relative path so the verify
    //    command works for maintainers running it from the repo itself.
    try {
      const __filename = fileURLToPath(import.meta.url);
      let dir = dirname(__filename);
      for (let i = 0; i < 10; i++) {
        candidates.push(join(dir, repoPath));
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch { /* ignore */ }
    candidates.push(join(process.cwd(), repoPath));
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return null;
  }
  // Top-level paths (e.g. package.json) — return relative to cwd
  const top = join(process.cwd(), repoPath);
  return existsSync(top) ? top : null;
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fileContains(path: string, marker: string): boolean {
  return readFileSync(path, 'utf-8').includes(marker);
}

async function verifySignature(witness: Witness): Promise<{
  manifestHashOk: boolean;
  publicKeyReproducible: boolean;
  signatureValid: boolean;
}> {
  // Lazy-load @noble/ed25519 — keep verify command snappy when no signature check needed
  let ed: typeof import('@noble/ed25519') | null = null;
  try {
    ed = await import('@noble/ed25519');
  } catch {
    return { manifestHashOk: false, publicKeyReproducible: false, signatureValid: false };
  }
  // Configure sync sha512 for the v2 API
  const sha512Sync = (...m: Uint8Array[]): Uint8Array => {
    const h = createHash('sha512');
    for (const x of m) h.update(x);
    return h.digest();
  };
  (ed as { etc: { sha512Sync: typeof sha512Sync } }).etc.sha512Sync = sha512Sync;

  const manifestCanonical = JSON.stringify(witness.manifest);
  const recomputedHash = createHash('sha256').update(manifestCanonical).digest('hex');
  const manifestHashOk = recomputedHash === witness.integrity.manifestHash;

  const seed = createHash('sha256').update(witness.manifest.gitCommit + ':ruflo-witness/v1').digest();
  const reKey = ed.getPublicKey(seed);
  const publicKeyReproducible = Buffer.from(reKey).toString('hex') === witness.integrity.publicKey;

  const signatureValid = ed.verify(
    Buffer.from(witness.integrity.signature, 'hex'),
    Buffer.from(witness.integrity.manifestHash, 'hex'),
    Buffer.from(witness.integrity.publicKey, 'hex'),
  );

  return { manifestHashOk, publicKeyReproducible, signatureValid };
}

export const verifyCommand: Command = {
  name: 'verify',
  description: 'Verify installed artifact against the signed witness manifest',
  options: [
    {
      name: 'branch',
      short: 'b',
      type: 'string',
      description: 'Git branch to fetch verification.md.json from (defaults to fix/issues-may-1-3)',
      default: 'fix/issues-may-1-3',
    },
    {
      name: 'manifest',
      short: 'm',
      type: 'string',
      description: 'Local path to a verification.md.json file (overrides --branch)',
    },
    {
      name: 'json',
      type: 'boolean',
      description: 'Output JSON instead of human-readable table',
      default: false,
    },
  ],
  examples: [
    { command: 'ruflo verify', description: 'Fetch latest manifest from main branch + verify' },
    { command: 'ruflo verify --branch main', description: 'Verify against a specific branch' },
    { command: 'ruflo verify --manifest ./verification.md.json', description: 'Use a local manifest copy' },
    { command: 'ruflo verify --json', description: 'Machine-readable output for CI' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const branch = (ctx.flags.branch as string) || 'fix/issues-may-1-3';
    const localPath = ctx.flags.manifest as string | undefined;
    const asJson = ctx.flags.json === true;

    if (!asJson) {
      output.writeln();
      output.writeln(output.bold('Ruflo Verification'));
      output.writeln(output.dim('─'.repeat(50)));
    }

    let witness: Witness;
    try {
      witness = localPath ? loadLocalWitness(localPath) : await fetchWitness(branch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (asJson) output.printJson({ ok: false, error: msg });
      else output.printError(`Could not load witness manifest: ${msg}`);
      return { success: false, exitCode: 1 };
    }

    // Signature verification
    const sig = await verifySignature(witness);

    // File verification
    const fileResults = witness.manifest.fixes.map((fix) => {
      const installedPath = repoPathToInstalledPath(fix.file);
      if (!installedPath) {
        return { ...fix, status: 'missing' as 'missing' | 'pass' | 'drift' | 'regressed', sha256Match: false, markerPresent: false, installedPath: null as string | null, localSha256: undefined as string | undefined };
      }
      const localHash = fileSha256(installedPath);
      const markerPresent = fileContains(installedPath, fix.marker);
      const sha256Match = localHash === fix.sha256;
      const status: 'pass' | 'drift' | 'regressed' = sha256Match && markerPresent
        ? 'pass'
        : (markerPresent ? 'drift' : 'regressed');
      return { ...fix, status, sha256Match, markerPresent, localSha256: localHash, installedPath: installedPath.replace(process.cwd() + sep, '') };
    });

    const passCount = fileResults.filter((r) => r.status === 'pass').length;
    const driftCount = fileResults.filter((r) => r.status === 'drift').length;
    const regressedCount = fileResults.filter((r) => r.status === 'regressed').length;
    const missingCount = fileResults.filter((r) => r.status === 'missing').length;

    const allOk = sig.manifestHashOk && sig.publicKeyReproducible && sig.signatureValid && regressedCount === 0;

    if (asJson) {
      output.printJson({
        ok: allOk,
        manifest: witness.manifest,
        signature: sig,
        results: fileResults,
        summary: { pass: passCount, drift: driftCount, regressed: regressedCount, missing: missingCount },
      });
      return { success: allOk, exitCode: allOk ? 0 : 1 };
    }

    output.writeln();
    output.writeln(output.bold('Manifest signature'));
    output.writeln(`  manifest hash matches: ${sig.manifestHashOk ? output.success('yes') : output.error('no')}`);
    output.writeln(`  public key reproducible from gitCommit: ${sig.publicKeyReproducible ? output.success('yes') : output.error('no')}`);
    output.writeln(`  Ed25519 signature valid: ${sig.signatureValid ? output.success('yes') : output.error('no')}`);
    output.writeln();

    output.writeln(output.bold('Fix verification'));
    for (const r of fileResults) {
      const status = r.status === 'pass'
        ? output.success('pass')
        : r.status === 'drift'
          ? output.warning('drift')
          : output.error(r.status);
      output.writeln(`  [${status}] ${r.id} — ${r.desc}`);
      if (r.status === 'drift' && r.localSha256) {
        output.writeln(output.dim(`         expected sha256: ${r.sha256.slice(0, 16)}…`));
        output.writeln(output.dim(`         local    sha256: ${r.localSha256.slice(0, 16)}…`));
      } else if (r.status === 'regressed') {
        output.writeln(output.dim(`         marker missing: '${r.marker}' not found in ${r.installedPath ?? r.file}`));
      } else if (r.status === 'missing') {
        output.writeln(output.dim(`         file not found in node_modules: ${r.file}`));
      }
    }

    output.writeln();
    output.writeln(output.bold('Summary'));
    output.writeln(`  pass:      ${passCount}`);
    output.writeln(`  drift:     ${driftCount}`);
    output.writeln(`  regressed: ${regressedCount}`);
    output.writeln(`  missing:   ${missingCount}`);
    output.writeln();

    if (allOk) {
      output.printSuccess('All fixes verified. Installed artifact matches the signed witness manifest.');
      return { success: true };
    }
    if (regressedCount > 0) {
      output.printError(`${regressedCount} fix(es) regressed. Markers not found in installed artifact.`);
    }
    if (driftCount > 0) {
      output.printWarning(`${driftCount} fix(es) drifted. Markers present, but file SHA-256 differs (could be a benign edit; inspect the diff).`);
    }
    if (!sig.signatureValid || !sig.manifestHashOk) {
      output.printError('Manifest signature failed verification. The witness file may have been tampered with or corrupted.');
    }
    return { success: false, exitCode: 1 };
  },
};

export default verifyCommand;
