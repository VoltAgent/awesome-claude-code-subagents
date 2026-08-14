/**
 * Tests for Capability Algebra
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapabilityAlgebra,
  createCapabilityAlgebra,
  type Capability,
  type CapabilityScope,
  type CapabilityConstraint,
} from '../src/capabilities.js';

// ============================================================================
// Test Helpers
// ============================================================================

let algebra: CapabilityAlgebra;

function grantBasic(overrides: {
  scope?: CapabilityScope;
  resource?: string;
  actions?: string[];
  grantedBy?: string;
  grantedTo?: string;
  constraints?: CapabilityConstraint[];
  expiresAt?: number | null;
  delegatable?: boolean;
} = {}): Capability {
  return algebra.grant({
    scope: overrides.scope ?? 'tool',
    resource: overrides.resource ?? 'bash',
    actions: overrides.actions ?? ['execute'],
    grantedBy: overrides.grantedBy ?? 'authority-1',
    grantedTo: overrides.grantedTo ?? 'agent-1',
    constraints: overrides.constraints,
    expiresAt: overrides.expiresAt,
    delegatable: overrides.delegatable,
  });
}

// ============================================================================
// Grant Tests
// ============================================================================

describe('CapabilityAlgebra', () => {
  beforeEach(() => {
    algebra = new CapabilityAlgebra();
  });

  describe('grant', () => {
    it('should create a capability with correct fields', () => {
      const cap = algebra.grant({
        scope: 'tool',
        resource: 'bash',
        actions: ['execute', 'read'],
        grantedBy: 'authority-1',
        grantedTo: 'agent-1',
        constraints: [{ type: 'rate-limit', params: { max: 10 } }],
        expiresAt: Date.now() + 60_000,
        delegatable: true,
      });

      expect(cap.id).toBeTruthy();
      expect(cap.scope).toBe('tool');
      expect(cap.resource).toBe('bash');
      expect(cap.actions).toEqual(['execute', 'read']);
      expect(cap.constraints).toHaveLength(1);
      expect(cap.constraints[0].type).toBe('rate-limit');
      expect(cap.grantedBy).toBe('authority-1');
      expect(cap.grantedTo).toBe('agent-1');
      expect(cap.grantedAt).toBeLessThanOrEqual(Date.now());
      expect(cap.expiresAt).toBeGreaterThan(Date.now());
      expect(cap.delegatable).toBe(true);
      expect(cap.revoked).toBe(false);
      expect(cap.revokedAt).toBeNull();
      expect(cap.attestations).toEqual([]);
      expect(cap.parentCapabilityId).toBeNull();
    });

    it('should default to non-delegatable with no expiry and no constraints', () => {
      const cap = algebra.grant({
        scope: 'memory',
        resource: 'shared',
        actions: ['read'],
        grantedBy: 'auth',
        grantedTo: 'agent',
      });

      expect(cap.delegatable).toBe(false);
      expect(cap.expiresAt).toBeNull();
      expect(cap.constraints).toEqual([]);
    });

    it('should store the capability and make it retrievable', () => {
      const cap = grantBasic();
      const retrieved = algebra.getCapability(cap.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(cap.id);
    });

    it('should index the capability by agent', () => {
      grantBasic({ grantedTo: 'agent-A' });
      grantBasic({ grantedTo: 'agent-A', resource: 'edit' });
      grantBasic({ grantedTo: 'agent-B' });

      expect(algebra.getCapabilities('agent-A')).toHaveLength(2);
      expect(algebra.getCapabilities('agent-B')).toHaveLength(1);
      expect(algebra.getCapabilities('agent-C')).toHaveLength(0);
    });
  });

  // ============================================================================
  // Restrict Tests
  // ============================================================================

  describe('restrict', () => {
    it('should create a new capability with tighter actions', () => {
      const original = grantBasic({ actions: ['read', 'write', 'delete'] });
      const restricted = algebra.restrict(original, { actions: ['read', 'write'] });

      expect(restricted.id).not.toBe(original.id);
      expect(restricted.actions).toEqual(['read', 'write']);
      expect(restricted.parentCapabilityId).toBe(original.id);
    });

    it('should never loosen actions (cannot add actions not in original)', () => {
      const original = grantBasic({ actions: ['read'] });
      const restricted = algebra.restrict(original, { actions: ['read', 'write', 'delete'] });

      // Only 'read' should survive since original only has 'read'
      expect(restricted.actions).toEqual(['read']);
    });

    it('should union constraints (only add, never remove)', () => {
      const original = grantBasic({
        constraints: [{ type: 'rate-limit', params: { max: 10 } }],
      });
      const restricted = algebra.restrict(original, {
        constraints: [{ type: 'budget', params: { limit: 100 } }],
      });

      expect(restricted.constraints).toHaveLength(2);
      expect(restricted.constraints[0].type).toBe('rate-limit');
      expect(restricted.constraints[1].type).toBe('budget');
    });

    it('should never extend expiry', () => {
      const futureExpiry = Date.now() + 60_000;
      const farFutureExpiry = Date.now() + 120_000;

      const original = grantBasic({ expiresAt: futureExpiry });
      const restricted = algebra.restrict(original, { expiresAt: farFutureExpiry });

      // Should keep the original (tighter) expiry
      expect(restricted.expiresAt).toBe(futureExpiry);
    });

    it('should allow shortening expiry', () => {
      const futureExpiry = Date.now() + 60_000;
      const soonerExpiry = Date.now() + 30_000;

      const original = grantBasic({ expiresAt: futureExpiry });
      const restricted = algebra.restrict(original, { expiresAt: soonerExpiry });

      expect(restricted.expiresAt).toBe(soonerExpiry);
    });

    it('should set expiry when original has no expiry', () => {
      const original = grantBasic({ expiresAt: null });
      const newExpiry = Date.now() + 30_000;
      const restricted = algebra.restrict(original, { expiresAt: newExpiry });

      expect(restricted.expiresAt).toBe(newExpiry);
    });

    it('should not promote delegatable from false to true', () => {
      const original = grantBasic({ delegatable: false });
      const restricted = algebra.restrict(original, { delegatable: true });

      // Cannot promote; original stays false
      expect(restricted.delegatable).toBe(false);
    });

    it('should allow downgrading delegatable from true to false', () => {
      const original = grantBasic({ delegatable: true });
      const restricted = algebra.restrict(original, { delegatable: false });

      expect(restricted.delegatable).toBe(false);
    });
  });

  // ============================================================================
  // Delegate Tests
  // ============================================================================

  describe('delegate', () => {
    it('should create a child capability with parentCapabilityId', () => {
      const parent = grantBasic({ delegatable: true, grantedTo: 'agent-A' });
      const child = algebra.delegate(parent, 'agent-B');

      expect(child.parentCapabilityId).toBe(parent.id);
      expect(child.grantedTo).toBe('agent-B');
      expect(child.grantedBy).toBe('agent-A');
      expect(child.id).not.toBe(parent.id);
    });

    it('should fail when capability is not delegatable', () => {
      const nonDelegatable = grantBasic({ delegatable: false });

      expect(() => algebra.delegate(nonDelegatable, 'agent-B')).toThrow(
        /not delegatable/
      );
    });

    it('should fail when capability is revoked', () => {
      const cap = grantBasic({ delegatable: true });
      algebra.revoke(cap.id);

      expect(() => algebra.delegate(cap, 'agent-B')).toThrow(
        /revoked/
      );
    });

    it('should fail when capability is expired', () => {
      const cap = grantBasic({ delegatable: true, expiresAt: Date.now() - 1_000 });

      expect(() => algebra.delegate(cap, 'agent-B')).toThrow(
        /expired/
      );
    });

    it('should apply further restrictions during delegation', () => {
      const parent = grantBasic({
        delegatable: true,
        actions: ['read', 'write', 'delete'],
      });

      const child = algebra.delegate(parent, 'agent-B', {
        actions: ['read'],
        delegatable: false,
      });

      expect(child.actions).toEqual(['read']);
      expect(child.delegatable).toBe(false);
    });

    it('should inherit scope and resource from parent', () => {
      const parent = grantBasic({
        delegatable: true,
        scope: 'file',
        resource: '/src/**',
      });

      const child = algebra.delegate(parent, 'agent-B');

      expect(child.scope).toBe('file');
      expect(child.resource).toBe('/src/**');
    });

    it('should add delegated constraints on top of parent constraints', () => {
      const parent = grantBasic({
        delegatable: true,
        constraints: [{ type: 'rate-limit', params: { max: 100 } }],
      });

      const child = algebra.delegate(parent, 'agent-B', {
        constraints: [{ type: 'budget', params: { limit: 50 } }],
      });

      expect(child.constraints).toHaveLength(2);
    });
  });

  // ============================================================================
  // Expire Tests
  // ============================================================================

  describe('expire', () => {
    it('should set expiresAt to now', () => {
      const cap = grantBasic({ expiresAt: Date.now() + 60_000 });
      const before = Date.now();

      algebra.expire(cap.id);

      const updated = algebra.getCapability(cap.id)!;
      expect(updated.expiresAt).toBeGreaterThanOrEqual(before);
      expect(updated.expiresAt).toBeLessThanOrEqual(Date.now());
    });

    it('should cause subsequent checks to deny access', () => {
      const cap = grantBasic({ grantedTo: 'agent-1' });

      // Before expiry, should be allowed
      const resultBefore = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(resultBefore.allowed).toBe(true);

      // Expire and check again
      algebra.expire(cap.id);

      const resultAfter = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(resultAfter.allowed).toBe(false);
    });

    it('should be a no-op for unknown capability IDs', () => {
      // Should not throw
      algebra.expire('nonexistent-id');
    });
  });

  // ============================================================================
  // Revoke Tests
  // ============================================================================

  describe('revoke', () => {
    it('should mark capability as revoked', () => {
      const cap = grantBasic();
      algebra.revoke(cap.id);

      const updated = algebra.getCapability(cap.id)!;
      expect(updated.revoked).toBe(true);
      expect(updated.revokedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should cascade revocation to all delegated children', () => {
      const root = grantBasic({ delegatable: true, grantedTo: 'agent-A' });
      const child = algebra.delegate(root, 'agent-B');
      const grandchild = algebra.delegate(child, 'agent-C');

      algebra.revoke(root.id);

      expect(algebra.getCapability(root.id)!.revoked).toBe(true);
      expect(algebra.getCapability(child.id)!.revoked).toBe(true);
      expect(algebra.getCapability(grandchild.id)!.revoked).toBe(true);
    });

    it('should deny access after revocation', () => {
      grantBasic({ grantedTo: 'agent-1' });

      const beforeRevoke = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(beforeRevoke.allowed).toBe(true);

      const caps = algebra.getCapabilities('agent-1');
      algebra.revoke(caps[0].id);

      const afterRevoke = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(afterRevoke.allowed).toBe(false);
    });

    it('should be a no-op for unknown capability IDs', () => {
      algebra.revoke('nonexistent-id');
    });

    it('should not affect sibling capabilities', () => {
      const root = grantBasic({ delegatable: true, grantedTo: 'agent-A' });
      const child1 = algebra.delegate(root, 'agent-B');
      const child2 = algebra.delegate(root, 'agent-C');

      algebra.revoke(child1.id);

      expect(algebra.getCapability(child1.id)!.revoked).toBe(true);
      expect(algebra.getCapability(child2.id)!.revoked).toBe(false);
      expect(algebra.getCapability(root.id)!.revoked).toBe(false);
    });
  });

  // ============================================================================
  // Attest Tests
  // ============================================================================

  describe('attest', () => {
    it('should add an attestation with timestamp', () => {
      const cap = grantBasic();
      const before = Date.now();

      algebra.attest(cap.id, {
        attesterId: 'auditor-1',
        claim: 'Passed security review',
        evidence: 'audit-report-2026-01.pdf',
        signature: 'abc123hex',
      });

      const updated = algebra.getCapability(cap.id)!;
      expect(updated.attestations).toHaveLength(1);
      expect(updated.attestations[0].attesterId).toBe('auditor-1');
      expect(updated.attestations[0].claim).toBe('Passed security review');
      expect(updated.attestations[0].evidence).toBe('audit-report-2026-01.pdf');
      expect(updated.attestations[0].signature).toBe('abc123hex');
      expect(updated.attestations[0].attestedAt).toBeGreaterThanOrEqual(before);
    });

    it('should support multiple attestations', () => {
      const cap = grantBasic();

      algebra.attest(cap.id, {
        attesterId: 'auditor-1',
        claim: 'Claim A',
        evidence: null,
        signature: 'sig1',
      });
      algebra.attest(cap.id, {
        attesterId: 'auditor-2',
        claim: 'Claim B',
        evidence: null,
        signature: 'sig2',
      });

      const updated = algebra.getCapability(cap.id)!;
      expect(updated.attestations).toHaveLength(2);
    });

    it('should be a no-op for unknown capability IDs', () => {
      algebra.attest('nonexistent', {
        attesterId: 'x',
        claim: 'test',
        evidence: null,
        signature: 'sig',
      });
      // No throw
    });
  });

  // ============================================================================
  // Check Tests
  // ============================================================================

  describe('check', () => {
    it('should allow when a matching capability exists', () => {
      grantBasic({
        scope: 'tool',
        resource: 'bash',
        actions: ['execute'],
        grantedTo: 'agent-1',
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');

      expect(result.allowed).toBe(true);
      expect(result.capabilities).toHaveLength(1);
      expect(result.reason).toContain('Allowed');
    });

    it('should deny when no capability exists for the agent', () => {
      const result = algebra.check('unknown-agent', 'tool', 'bash', 'execute');

      expect(result.allowed).toBe(false);
      expect(result.capabilities).toHaveLength(0);
      expect(result.reason).toContain('No capabilities');
    });

    it('should deny when the action is not in the capability', () => {
      grantBasic({
        scope: 'tool',
        resource: 'bash',
        actions: ['read'],
        grantedTo: 'agent-1',
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');

      expect(result.allowed).toBe(false);
    });

    it('should deny when the scope does not match', () => {
      grantBasic({
        scope: 'file',
        resource: 'bash',
        actions: ['execute'],
        grantedTo: 'agent-1',
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(result.allowed).toBe(false);
    });

    it('should deny when the resource does not match', () => {
      grantBasic({
        scope: 'tool',
        resource: 'edit',
        actions: ['execute'],
        grantedTo: 'agent-1',
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(result.allowed).toBe(false);
    });

    it('should respect expiry', () => {
      grantBasic({
        scope: 'tool',
        resource: 'bash',
        actions: ['execute'],
        grantedTo: 'agent-1',
        expiresAt: Date.now() - 1_000, // Already expired
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(result.allowed).toBe(false);
    });

    it('should respect revocation', () => {
      const cap = grantBasic({
        scope: 'tool',
        resource: 'bash',
        actions: ['execute'],
        grantedTo: 'agent-1',
      });

      algebra.revoke(cap.id);

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(result.allowed).toBe(false);
    });

    it('should collect active constraints in result', () => {
      grantBasic({
        grantedTo: 'agent-1',
        constraints: [
          { type: 'rate-limit', params: { max: 10 } },
          { type: 'budget', params: { limit: 100 } },
        ],
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');

      expect(result.allowed).toBe(true);
      expect(result.constraints).toHaveLength(2);
    });

    it('should deny when rate-limit constraint is exceeded via context', () => {
      grantBasic({
        grantedTo: 'agent-1',
        constraints: [{ type: 'rate-limit', params: { max: 5 } }],
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute', {
        currentUsage: 5,
      });

      expect(result.allowed).toBe(false);
    });

    it('should deny when budget constraint is exceeded via context', () => {
      grantBasic({
        grantedTo: 'agent-1',
        constraints: [{ type: 'budget', params: { limit: 100 } }],
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute', {
        budgetUsed: 100,
      });

      expect(result.allowed).toBe(false);
    });

    it('should match multiple capabilities and return all', () => {
      grantBasic({
        grantedTo: 'agent-1',
        scope: 'tool',
        resource: 'bash',
        actions: ['execute'],
      });
      grantBasic({
        grantedTo: 'agent-1',
        scope: 'tool',
        resource: 'bash',
        actions: ['execute', 'read'],
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');

      expect(result.allowed).toBe(true);
      expect(result.capabilities).toHaveLength(2);
    });
  });

  // ============================================================================
  // Compose Tests
  // ============================================================================

  describe('compose', () => {
    it('should intersect actions', () => {
      const cap1 = grantBasic({ actions: ['read', 'write', 'delete'] });
      const cap2 = grantBasic({ actions: ['read', 'write', 'execute'] });

      const composed = algebra.compose(cap1, cap2);

      expect(composed.actions).toEqual(['read', 'write']);
    });

    it('should union constraints', () => {
      const cap1 = grantBasic({
        constraints: [{ type: 'rate-limit', params: { max: 10 } }],
      });
      const cap2 = grantBasic({
        constraints: [{ type: 'budget', params: { limit: 50 } }],
      });

      const composed = algebra.compose(cap1, cap2);

      expect(composed.constraints).toHaveLength(2);
      expect(composed.constraints[0].type).toBe('rate-limit');
      expect(composed.constraints[1].type).toBe('budget');
    });

    it('should pick the tightest expiry when both have expiry', () => {
      const sooner = Date.now() + 30_000;
      const later = Date.now() + 60_000;

      const cap1 = grantBasic({ expiresAt: sooner });
      const cap2 = grantBasic({ expiresAt: later });

      const composed = algebra.compose(cap1, cap2);

      expect(composed.expiresAt).toBe(sooner);
    });

    it('should use the non-null expiry when one has no expiry', () => {
      const expiry = Date.now() + 30_000;

      const cap1 = grantBasic({ expiresAt: expiry });
      const cap2 = grantBasic({ expiresAt: null });

      const composed = algebra.compose(cap1, cap2);

      expect(composed.expiresAt).toBe(expiry);
    });

    it('should result in null expiry when both have no expiry', () => {
      const cap1 = grantBasic({ expiresAt: null });
      const cap2 = grantBasic({ expiresAt: null });

      const composed = algebra.compose(cap1, cap2);

      expect(composed.expiresAt).toBeNull();
    });

    it('should be delegatable only if both are delegatable', () => {
      const cap1 = grantBasic({ delegatable: true });
      const cap2 = grantBasic({ delegatable: false });

      const composed = algebra.compose(cap1, cap2);

      expect(composed.delegatable).toBe(false);
    });

    it('should throw when scopes differ', () => {
      const cap1 = grantBasic({ scope: 'tool' });
      const cap2 = grantBasic({ scope: 'file' });

      expect(() => algebra.compose(cap1, cap2)).toThrow(/different scopes/);
    });

    it('should throw when resources differ', () => {
      const cap1 = grantBasic({ resource: 'bash' });
      const cap2 = grantBasic({ resource: 'edit' });

      expect(() => algebra.compose(cap1, cap2)).toThrow(/different resources/);
    });
  });

  // ============================================================================
  // isSubset Tests
  // ============================================================================

  describe('isSubset', () => {
    it('should return true when inner is a strict subset', () => {
      const outer = grantBasic({ actions: ['read', 'write', 'delete'] });
      const inner = grantBasic({ actions: ['read'] });

      expect(algebra.isSubset(inner, outer)).toBe(true);
    });

    it('should return true when inner equals outer', () => {
      const outer = grantBasic({ actions: ['read', 'write'] });
      const inner = grantBasic({ actions: ['read', 'write'] });

      expect(algebra.isSubset(inner, outer)).toBe(true);
    });

    it('should return false when inner has actions not in outer', () => {
      const outer = grantBasic({ actions: ['read'] });
      const inner = grantBasic({ actions: ['read', 'write'] });

      expect(algebra.isSubset(inner, outer)).toBe(false);
    });

    it('should return false when scopes differ', () => {
      const outer = grantBasic({ scope: 'tool', actions: ['read'] });
      const inner = grantBasic({ scope: 'file', actions: ['read'] });

      expect(algebra.isSubset(inner, outer)).toBe(false);
    });

    it('should return false when resources differ', () => {
      const outer = grantBasic({ resource: 'bash', actions: ['read'] });
      const inner = grantBasic({ resource: 'edit', actions: ['read'] });

      expect(algebra.isSubset(inner, outer)).toBe(false);
    });

    it('should return false when inner never expires but outer does', () => {
      const outer = grantBasic({ expiresAt: Date.now() + 60_000, actions: ['read'] });
      const inner = grantBasic({ expiresAt: null, actions: ['read'] });

      expect(algebra.isSubset(inner, outer)).toBe(false);
    });

    it('should return false when inner expires after outer', () => {
      const outer = grantBasic({ expiresAt: Date.now() + 30_000, actions: ['read'] });
      const inner = grantBasic({ expiresAt: Date.now() + 60_000, actions: ['read'] });

      expect(algebra.isSubset(inner, outer)).toBe(false);
    });

    it('should return true when inner expires before outer', () => {
      const outer = grantBasic({ expiresAt: Date.now() + 60_000, actions: ['read'] });
      const inner = grantBasic({ expiresAt: Date.now() + 30_000, actions: ['read'] });

      expect(algebra.isSubset(inner, outer)).toBe(true);
    });

    it('should return true when outer has no expiry', () => {
      const outer = grantBasic({ expiresAt: null, actions: ['read'] });
      const inner = grantBasic({ expiresAt: Date.now() + 30_000, actions: ['read'] });

      expect(algebra.isSubset(inner, outer)).toBe(true);
    });
  });

  // ============================================================================
  // getDelegationChain Tests
  // ============================================================================

  describe('getDelegationChain', () => {
    it('should return a single-element chain for root capabilities', () => {
      const root = grantBasic();
      const chain = algebra.getDelegationChain(root.id);

      expect(chain).toHaveLength(1);
      expect(chain[0].id).toBe(root.id);
    });

    it('should return the full chain from root to leaf', () => {
      const root = grantBasic({ delegatable: true, grantedTo: 'A' });
      const child = algebra.delegate(root, 'B');
      const grandchild = algebra.delegate(child, 'C');

      const chain = algebra.getDelegationChain(grandchild.id);

      expect(chain).toHaveLength(3);
      expect(chain[0].id).toBe(root.id);
      expect(chain[1].id).toBe(child.id);
      expect(chain[2].id).toBe(grandchild.id);
    });

    it('should return empty for unknown capability IDs', () => {
      const chain = algebra.getDelegationChain('nonexistent');
      expect(chain).toHaveLength(0);
    });

    it('should work for intermediate nodes in the chain', () => {
      const root = grantBasic({ delegatable: true, grantedTo: 'A' });
      const child = algebra.delegate(root, 'B');
      algebra.delegate(child, 'C');

      const chain = algebra.getDelegationChain(child.id);

      expect(chain).toHaveLength(2);
      expect(chain[0].id).toBe(root.id);
      expect(chain[1].id).toBe(child.id);
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('createCapabilityAlgebra', () => {
    it('should create a fresh CapabilityAlgebra instance', () => {
      const instance = createCapabilityAlgebra();
      expect(instance).toBeInstanceOf(CapabilityAlgebra);
      expect(instance.getCapabilities('any')).toEqual([]);
    });
  });

  // ============================================================================
  // Constraint Evaluation Tests
  // ============================================================================

  describe('constraint evaluation via check', () => {
    it('should deny when time-window start is in the future', () => {
      grantBasic({
        grantedTo: 'agent-1',
        constraints: [{
          type: 'time-window',
          params: { start: Date.now() + 60_000 },
        }],
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(result.allowed).toBe(false);
    });

    it('should deny when time-window end is in the past', () => {
      grantBasic({
        grantedTo: 'agent-1',
        constraints: [{
          type: 'time-window',
          params: { end: Date.now() - 60_000 },
        }],
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(result.allowed).toBe(false);
    });

    it('should allow when within time-window', () => {
      grantBasic({
        grantedTo: 'agent-1',
        constraints: [{
          type: 'time-window',
          params: { start: Date.now() - 60_000, end: Date.now() + 60_000 },
        }],
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute');
      expect(result.allowed).toBe(true);
    });

    it('should deny when condition context key does not match expected value', () => {
      grantBasic({
        grantedTo: 'agent-1',
        constraints: [{
          type: 'condition',
          params: { key: 'environment', value: 'production' },
        }],
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute', {
        environment: 'development',
      });
      expect(result.allowed).toBe(false);
    });

    it('should allow when condition context matches', () => {
      grantBasic({
        grantedTo: 'agent-1',
        constraints: [{
          type: 'condition',
          params: { key: 'environment', value: 'production' },
        }],
      });

      const result = algebra.check('agent-1', 'tool', 'bash', 'execute', {
        environment: 'production',
      });
      expect(result.allowed).toBe(true);
    });
  });
});
