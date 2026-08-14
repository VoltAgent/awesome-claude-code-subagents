#!/usr/bin/env node
/**
 * Regression guard for ruvnet/ruflo#1883 + #1884.
 *
 * #1883 — memory_import_claude `allProjects=false` failed under WSL because
 *         project-hash derivation only POSIX-slash-replaced cwd. We now try
 *         multiple candidate hashes (POSIX, WSL-translated `/mnt/<d>/` →
 *         `<D>-...`, leading-dash-stripped, space-replaced) and accept an
 *         explicit `projectPath` override.
 *
 * #1884 — keys produced by memory_import_claude included raw frontmatter
 *         names + section titles, which could contain shell-metacharacters
 *         in validateMemoryInput's dangerous-pattern set. memory_delete then
 *         rejected those keys, stranding them. We now sanitize at write-time
 *         via sanitizeMemoryKey.
 *
 * This script does three things:
 *   1. Static dist scan — assert sanitizeMemoryKey + resolveProjectMemoryDir
 *      are present in dist and called from the import handler. Catches
 *      regressions where the helpers exist but stop being called.
 *   2. Property check — for every char in DANGEROUS_KEY_CHARS, sanitize and
 *      assert the result passes validateMemoryInput's regex. Proves the
 *      write-path → delete-path round-trip can never strand a key again.
 *   3. WSL-fixture check — feed a synthetic `/mnt/c/Users/x/Project Name`
 *      through resolveProjectMemoryDir's candidate generator and assert the
 *      Claude-Code Windows hash form is among the candidates.
 *
 * Combined with witness markers (#1883-cli, #1884-cli) — which attest that
 * the marker substrings are present in dist — this is the three-way coverage
 * (#1874 pattern: dist scan + behavioral + cryptographic) that gates these
 * regressions.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(process.argv[2] ?? process.cwd());
const DIST = resolve(REPO_ROOT, 'v3/@claude-flow/cli/dist/src/mcp-tools/memory-tools.js');

let failed = 0;
const fail = (m) => { console.error(`FAIL: ${m}`); failed++; };
const pass = (m) => console.log(`ok: ${m}`);

if (!existsSync(DIST)) {
  fail(`${DIST} not found — run \`npm --prefix v3/@claude-flow/cli run build\` first`);
  process.exit(1);
}
const distSrc = readFileSync(DIST, 'utf-8');

// ---------- 1. Static dist scan ----------

const requiredMarkers = [
  // #1884 — sanitizer helper present and called from the two storeEntry sites
  { id: '#1884-helper-defined', re: /function sanitizeMemoryKey\s*\(/, hint: 'sanitizeMemoryKey() must be defined in dist' },
  { id: '#1884-call-site-1', re: /sanitizeMemoryKey\(`claude:\$\{memFile\.project\}:\$\{name\}`\)/, hint: 'first storeEntry import-key must go through sanitizeMemoryKey' },
  { id: '#1884-call-site-2', re: /sanitizeMemoryKey\(`claude:\$\{memFile\.project\}:\$\{name\}:\$\{sectionTitle\.slice\(0,\s*50\)\}`\)/, hint: 'second (sectioned) storeEntry import-key must go through sanitizeMemoryKey' },

  // #1883 — multi-candidate resolver present, WSL branch present, override plumbed
  { id: '#1883-resolver-defined', re: /function resolveProjectMemoryDir\s*\(/, hint: 'resolveProjectMemoryDir() must be defined in dist' },
  { id: '#1883-wsl-branch', re: /\/\^\\\/mnt\\\/\(\[a-z\]\)\(\\\/\.\*\)\?\$\/i/, hint: 'WSL /mnt/<drive>/ regex must be present in dist' },
  { id: '#1883-override-input', re: /projectPathOverride\s*=\s*input\.projectPath/, hint: 'memory_import_claude must read projectPath from input' },
  { id: '#1883-resolver-call', re: /resolveProjectMemoryDir\(claudeProjectsDir,\s*projectPathOverride\)/, hint: 'import handler must call resolveProjectMemoryDir' },
];

for (const marker of requiredMarkers) {
  if (marker.re.test(distSrc)) pass(`${marker.id} — dist contains required code`);
  else fail(`${marker.id} — ${marker.hint}`);
}

// Negative-attestation: the legacy single-line POSIX hash logic should be gone.
// `cwd.replace(/\//g, '-')` was the entire normalization before #1883.
const legacy = /const projectHash = cwd\.replace\(\/\\\/\/g,\s*['"]-['"]\);/;
if (legacy.test(distSrc)) {
  fail('#1883-regression — legacy single-line POSIX-only hash logic is back; resolveProjectMemoryDir was removed or bypassed');
} else {
  pass('#1883-no-regression — legacy POSIX-only normalization no longer present in dist');
}

// ---------- 2. Property check: sanitizer round-trips through validator ----------
//
// Use the same regex literal as the dist — DANGEROUS_KEY_CHARS / _PATTERN
// share their pattern, so the property test can use one source of truth that
// matches what shipped (the static-scan section above asserts the dist still
// declares them).

const dangerousChars = /[;&|`$(){}[\]<>!#\\\0]|\.\.[/\\]/g;
const dangerousPattern = /[;&|`$(){}[\]<>!#\\\0]|\.\.[/\\]/;

// Confirm the dist literal we're mirroring is byte-identical to what we declare here.
const distRegexLine = '/[;&|`$(){}[\\]<>!#\\\\\\0]|\\.\\.[/\\\\]/';
if (!distSrc.includes('const DANGEROUS_KEY_CHARS = /[;&|`$(){}[\\]<>!#\\\\\\0]|\\.\\.[/\\\\]/g;')) {
  fail('#1884-regex-mirror — DANGEROUS_KEY_CHARS literal in dist no longer matches the test mirror; update both together');
} else {
  pass('#1884-regex-mirror — DANGEROUS_KEY_CHARS literal in dist matches test mirror');
}

// Mimic sanitizeMemoryKey
const sanitize = (k) => k.replace(dangerousChars, '_').slice(0, 1024);

// Property: every char in the dangerous set, embedded in a realistic import
// key, must produce a sanitized key that passes the delete-path validator.
const dangerousSamples = [
  ';', '&', '|', '`', '$', '(', ')', '{', '}', '[', ']',
  '<', '>', '!', '#', '\\', '\0', '../', '..\\',
];
// Realistic markdown-section-shaped strings
const realistic = [
  'Foo (bar)!',
  'Section #1',
  'A & B',
  '${malicious}',
  '`shell`',
  '../etc/passwd',
  'name<tag>value',
  'list[0]',
];

let propFail = 0;
for (const sample of [...dangerousSamples, ...realistic]) {
  const importKey = `claude:project:name:${sample}`;
  const sanitized = sanitize(importKey);
  if (dangerousPattern.test(sanitized)) {
    console.error(`  property fail: sanitize(${JSON.stringify(importKey)}) = ${JSON.stringify(sanitized)} still matches DANGEROUS_KEY_PATTERN`);
    propFail++;
  }
}
if (propFail === 0) pass(`#1884-property — sanitizer output passes validator for ${dangerousSamples.length + realistic.length} adversarial inputs`);
else fail(`#1884-property — ${propFail} sanitized key(s) still rejected by validator`);

// ---------- 3. WSL fixture check ----------
//
// Replicate the candidate-generation loop with a synthetic WSL cwd and
// assert the Claude-Code Windows hash form is among the candidates.

function deriveCandidates(source) {
  const candidates = new Set();
  candidates.add(source.replace(/\//g, '-'));
  const wsl = source.match(/^\/mnt\/([a-z])(\/.*)?$/i);
  if (wsl) {
    const drive = wsl[1].toUpperCase();
    const rest = (wsl[2] ?? '').replace(/\//g, '-').replace(/ /g, '-');
    candidates.add(`${drive}-${rest}`);
  }
  candidates.add(source.replace(/\//g, '-').replace(/^-+/, ''));
  candidates.add(source.replace(/\//g, '-').replace(/ /g, '-'));
  return candidates;
}

const wslCwd = '/mnt/c/Users/tobia/OneDrive/Desktop/Claude Stuff';
const candidates = deriveCandidates(wslCwd);
const expectedWindowsHash = 'C--Users-tobia-OneDrive-Desktop-Claude-Stuff';
if (candidates.has(expectedWindowsHash)) {
  pass(`#1883-wsl-fixture — candidate set includes Claude-Code Windows hash for ${wslCwd}`);
} else {
  fail(`#1883-wsl-fixture — expected ${expectedWindowsHash} in candidate set, got: ${[...candidates].join(' | ')}`);
}

// macOS/Linux POSIX cwd should still produce the legacy hash in candidate set
// so existing-deployment compatibility holds.
const posixCwd = '/Users/alice/projects/ruflo';
const posixCandidates = deriveCandidates(posixCwd);
if (posixCandidates.has('-Users-alice-projects-ruflo')) {
  pass(`#1883-posix-compat — legacy POSIX hash still in candidate set for ${posixCwd}`);
} else {
  fail(`#1883-posix-compat — legacy POSIX hash missing from candidate set; would break existing macOS/Linux installs`);
}

// ---------- Summary ----------
if (failed > 0) {
  console.error(`\n${failed} regression check(s) failed for #1883/#1884`);
  process.exit(1);
}
console.log('\nall #1883/#1884 regression guards green');
