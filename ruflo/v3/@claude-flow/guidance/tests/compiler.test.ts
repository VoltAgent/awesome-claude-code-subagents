/**
 * Tests for the Guidance Compiler
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GuidanceCompiler } from '../src/compiler.js';

describe('GuidanceCompiler', () => {
  let compiler: GuidanceCompiler;

  beforeEach(() => {
    compiler = new GuidanceCompiler();
  });

  describe('compile', () => {
    it('should compile a basic guidance file into a policy bundle', () => {
      const content = `
# Safety Invariants

- [R001] Never commit hardcoded secrets (critical) @security verify:secrets-scan
- [R002] Always validate inputs at system boundaries @security
- [R003] Never force push to main or master (critical) @security [bash]

# Architecture

- [R010] Keep files under 500 lines @architecture
- [R011] Use typed interfaces for all public APIs @architecture

# Testing

- [R020] Write tests before implementation (TDD) @testing #testing
- [R021] Mock external dependencies in tests @testing
`;

      const bundle = compiler.compile(content);

      expect(bundle.constitution).toBeDefined();
      expect(bundle.shards).toBeDefined();
      expect(bundle.manifest).toBeDefined();

      // Constitution should have the safety rules
      expect(bundle.constitution.rules.length).toBeGreaterThan(0);

      // Manifest should list all rules
      expect(bundle.manifest.totalRules).toBeGreaterThan(0);
      expect(bundle.manifest.compiledAt).toBeGreaterThan(0);
    });

    it('should parse explicit rule IDs', () => {
      const content = `
# Rules
- [R001] Never expose API keys in code (critical) @security
- [R002] Always use parameterized queries @security
`;

      const bundle = compiler.compile(content);
      const ruleIds = bundle.manifest.rules.map(r => r.id);

      expect(ruleIds).toContain('R001');
      expect(ruleIds).toContain('R002');
    });

    it('should extract risk classes', () => {
      const content = `
# Rules
- [R001] Critical security rule (critical) @security
- [R002] High importance rule (high) @security
- [R003] Normal rule @general
`;

      const bundle = compiler.compile(content);
      const rules = bundle.manifest.rules;

      const r001 = rules.find(r => r.id === 'R001');
      expect(r001?.riskClass).toBe('critical');

      const r002 = rules.find(r => r.id === 'R002');
      expect(r002?.riskClass).toBe('high');

      const r003 = rules.find(r => r.id === 'R003');
      expect(r003?.riskClass).toBe('medium'); // default
    });

    it('should extract tool classes', () => {
      const content = `
# Rules
- [R001] Block dangerous bash commands [bash] @security
- [R002] Validate file edits [edit] @security
`;

      const bundle = compiler.compile(content);
      const allRules = [
        ...bundle.constitution.rules,
        ...bundle.shards.map(s => s.rule),
      ];

      const r001 = allRules.find(r => r.id === 'R001');
      expect(r001?.toolClasses).toContain('bash');

      const r002 = allRules.find(r => r.id === 'R002');
      expect(r002?.toolClasses).toContain('edit');
    });

    it('should extract verifiers', () => {
      const content = `
# Rules
- [R001] All tests must pass verify:tests-pass @testing
`;

      const bundle = compiler.compile(content);
      const r001 = bundle.manifest.rules.find(r => r.id === 'R001');
      expect(r001?.verifier).toBe('tests-pass');
    });

    it('should merge root and local files (local overrides)', () => {
      const root = `
# Rules
- [R001] Root rule version @security
- [R002] Only in root @general
`;

      const local = `
# Rules
- [R001] Local override version @security
- [R003] Only in local @testing
`;

      const bundle = compiler.compile(root, local);
      const allRules = [
        ...bundle.constitution.rules,
        ...bundle.shards.map(s => s.rule),
      ];

      // R001 should have local version
      const r001 = allRules.find(r => r.id === 'R001');
      expect(r001?.text).toContain('Local override version');

      // R002 should still exist from root
      const r002 = allRules.find(r => r.id === 'R002');
      expect(r002).toBeDefined();

      // R003 should exist from local
      const r003 = allRules.find(r => r.id === 'R003');
      expect(r003).toBeDefined();
    });

    it('should identify constitution sections', () => {
      const content = `
# Safety Invariants

- [R001] Never commit secrets (critical) @security

# Non-Negotiable Rules

- [R002] Always validate input (critical) @security

# Testing Guidelines

- [R010] Use TDD @testing
`;

      const bundle = compiler.compile(content);

      // Safety and non-negotiable sections should produce constitution rules
      expect(bundle.constitution.rules.length).toBeGreaterThan(0);
      expect(bundle.manifest.constitutionRules).toBeGreaterThan(0);
    });

    it('should generate a hash for the constitution', () => {
      const content = `
# Safety
- [R001] Rule one (critical) @security
`;

      const bundle = compiler.compile(content);
      expect(bundle.constitution.hash).toBeDefined();
      expect(bundle.constitution.hash.length).toBe(16);

      // Same content should produce same hash
      const bundle2 = compiler.compile(content);
      expect(bundle2.constitution.hash).toBe(bundle.constitution.hash);
    });
  });

  describe('parseGuidanceFile', () => {
    it('should handle empty content', () => {
      const rules = compiler.parseGuidanceFile('', 'root');
      expect(rules).toEqual([]);
    });

    it('should extract implicit rules from actionable bullet points', () => {
      const content = `
# Guidelines
- Must always run tests before committing
- Avoid using any type in TypeScript
- The sky is blue
`;

      const rules = compiler.parseGuidanceFile(content, 'root');

      // "Must always run tests" and "Avoid using any type" are actionable
      // "The sky is blue" is not actionable
      const actionable = rules.filter(r =>
        r.text.includes('tests') || r.text.includes('any type')
      );
      expect(actionable.length).toBeGreaterThan(0);
    });

    it('should infer intents from rule text', () => {
      const content = `
# Rules
- [R001] Fix the authentication bug @security
- [R002] Implement new feature @general
- [R003] Optimize database queries @performance
`;

      const rules = compiler.parseGuidanceFile(content, 'root');

      const r001 = rules.find(r => r.id === 'R001');
      expect(r001?.intents).toContain('security');

      const r003 = rules.find(r => r.id === 'R003');
      expect(r003?.intents).toContain('performance');
    });
  });
});
