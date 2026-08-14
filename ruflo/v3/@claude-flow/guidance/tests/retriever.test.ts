/**
 * Tests for the Shard Retriever and Intent Classifier
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ShardRetriever, HashEmbeddingProvider } from '../src/retriever.js';
import { GuidanceCompiler } from '../src/compiler.js';
import type { PolicyBundle } from '../src/types.js';

describe('ShardRetriever', () => {
  let retriever: ShardRetriever;
  let bundle: PolicyBundle;

  beforeEach(async () => {
    const compiler = new GuidanceCompiler();
    bundle = compiler.compile(`
# Safety Invariants

- [R001] Never commit hardcoded secrets (critical) @security verify:secrets-scan
- [R002] Always validate inputs at system boundaries (critical) @security

# Architecture

- [R010] Keep files under 500 lines @architecture
- [R011] Use typed interfaces for all public APIs @architecture
- [R012] Respect bounded context boundaries @architecture #architecture

# Testing

- [R020] Write tests before implementation (TDD) @testing #testing
- [R021] Mock external dependencies in unit tests @testing

# Performance

- [R030] Use HNSW for vector search @performance #performance
- [R031] Batch database operations @performance
- [R032] Profile before optimizing @performance #debug

# Deployment

- [R040] Never force push to main (critical) @security #deployment [bash]
- [R041] Run full test suite before deploy @deployment #deployment
`);

    retriever = new ShardRetriever(new HashEmbeddingProvider(128));
    await retriever.loadBundle(bundle);
  });

  describe('classifyIntent', () => {
    it('should classify bug fix tasks', () => {
      const result = retriever.classifyIntent('Fix the authentication error in login flow');
      expect(result.intent).toBe('bug-fix');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify feature tasks', () => {
      const result = retriever.classifyIntent('Add a new user profile page with avatar upload');
      expect(result.intent).toBe('feature');
    });

    it('should classify security tasks', () => {
      const result = retriever.classifyIntent('Patch the SQL injection vulnerability in user search');
      expect(result.intent).toBe('security');
    });

    it('should classify refactor tasks', () => {
      const result = retriever.classifyIntent('Refactor the auth module to reduce complexity');
      expect(result.intent).toBe('refactor');
    });

    it('should classify performance tasks', () => {
      const result = retriever.classifyIntent('Optimize database query performance for user search');
      expect(result.intent).toBe('performance');
    });

    it('should classify testing tasks', () => {
      const result = retriever.classifyIntent('Add unit tests for the payment service');
      expect(result.intent).toBe('testing');
    });

    it('should classify deployment tasks', () => {
      const result = retriever.classifyIntent('Deploy the new release to production');
      expect(result.intent).toBe('deployment');
    });

    it('should return general for ambiguous tasks', () => {
      const result = retriever.classifyIntent('Update the README');
      // Could be docs or general
      expect(['docs', 'general']).toContain(result.intent);
    });
  });

  describe('retrieve', () => {
    it('should always include the constitution', async () => {
      const result = await retriever.retrieve({
        taskDescription: 'Add a simple utility function',
      });

      expect(result.constitution).toBeDefined();
      expect(result.constitution.rules.length).toBeGreaterThan(0);
    });

    it('should retrieve relevant shards', async () => {
      const result = await retriever.retrieve({
        taskDescription: 'Fix the SQL injection vulnerability in user search',
        maxShards: 5,
      });

      expect(result.shards.length).toBeGreaterThan(0);
      expect(result.shards.length).toBeLessThanOrEqual(5);
    });

    it('should detect task intent', async () => {
      const result = await retriever.retrieve({
        taskDescription: 'Optimize the HNSW search performance for large datasets',
      });

      expect(result.detectedIntent).toBe('performance');
    });

    it('should respect maxShards limit', async () => {
      const result = await retriever.retrieve({
        taskDescription: 'Implement comprehensive testing suite',
        maxShards: 2,
      });

      expect(result.shards.length).toBeLessThanOrEqual(2);
    });

    it('should allow intent override', async () => {
      const result = await retriever.retrieve({
        taskDescription: 'Do something general',
        intent: 'security',
      });

      expect(result.detectedIntent).toBe('security');
    });

    it('should produce combined policy text', async () => {
      const result = await retriever.retrieve({
        taskDescription: 'Write new tests for the API',
      });

      expect(result.policyText).toBeDefined();
      expect(result.policyText.length).toBeGreaterThan(0);
      // Should include constitution
      expect(result.policyText).toContain('Constitution');
    });

    it('should report retrieval latency', async () => {
      const result = await retriever.retrieve({
        taskDescription: 'Any task',
      });

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('loadBundle', () => {
    it('should load and index shards', async () => {
      expect(retriever.shardCount).toBeGreaterThan(0);
    });

    it('should load constitution', () => {
      const constitution = retriever.getConstitution();
      expect(constitution).toBeDefined();
      expect(constitution!.rules.length).toBeGreaterThan(0);
    });
  });
});
