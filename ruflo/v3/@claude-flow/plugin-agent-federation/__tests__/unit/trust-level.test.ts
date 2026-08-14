/**
 * TrustLevel Entity Tests
 *
 * Validates trust level enum values, capability gates per level,
 * operation permission checks, and human-readable labels.
 */

import { describe, it, expect } from 'vitest';
import {
  TrustLevel,
  TRUST_TRANSITION_THRESHOLDS,
  CAPABILITY_GATES,
  isOperationAllowed,
  getTrustLevelLabel,
} from '../../src/domain/entities/trust-level.js';

describe('TrustLevel', () => {
  describe('enum values', () => {
    it('should define UNTRUSTED as 0', () => {
      expect(TrustLevel.UNTRUSTED).toBe(0);
    });

    it('should define VERIFIED as 1', () => {
      expect(TrustLevel.VERIFIED).toBe(1);
    });

    it('should define ATTESTED as 2', () => {
      expect(TrustLevel.ATTESTED).toBe(2);
    });

    it('should define TRUSTED as 3', () => {
      expect(TrustLevel.TRUSTED).toBe(3);
    });

    it('should define PRIVILEGED as 4', () => {
      expect(TrustLevel.PRIVILEGED).toBe(4);
    });

    it('should have exactly 5 trust levels', () => {
      const numericValues = Object.values(TrustLevel).filter(
        (v) => typeof v === 'number'
      );
      expect(numericValues).toHaveLength(5);
    });
  });

  describe('TRUST_TRANSITION_THRESHOLDS', () => {
    it('should define thresholds for 1->2 transition', () => {
      const threshold = TRUST_TRANSITION_THRESHOLDS['1->2'];
      expect(threshold).toBeDefined();
      expect(threshold.upgradeScore).toBe(0.7);
      expect(threshold.downgradeScore).toBe(0.5);
      expect(threshold.minInteractions).toBe(50);
    });

    it('should define thresholds for 2->3 transition', () => {
      const threshold = TRUST_TRANSITION_THRESHOLDS['2->3'];
      expect(threshold).toBeDefined();
      expect(threshold.upgradeScore).toBe(0.85);
      expect(threshold.downgradeScore).toBe(0.65);
      expect(threshold.minInteractions).toBe(500);
    });

    it('should define thresholds for 3->4 transition', () => {
      const threshold = TRUST_TRANSITION_THRESHOLDS['3->4'];
      expect(threshold).toBeDefined();
      expect(threshold.upgradeScore).toBe(0.95);
      expect(threshold.downgradeScore).toBe(0.8);
      expect(threshold.minInteractions).toBe(5000);
    });

    it('should require progressively higher scores for each level', () => {
      const t12 = TRUST_TRANSITION_THRESHOLDS['1->2'];
      const t23 = TRUST_TRANSITION_THRESHOLDS['2->3'];
      const t34 = TRUST_TRANSITION_THRESHOLDS['3->4'];
      expect(t12.upgradeScore).toBeLessThan(t23.upgradeScore);
      expect(t23.upgradeScore).toBeLessThan(t34.upgradeScore);
    });

    it('should require progressively more interactions for each level', () => {
      const t12 = TRUST_TRANSITION_THRESHOLDS['1->2'];
      const t23 = TRUST_TRANSITION_THRESHOLDS['2->3'];
      const t34 = TRUST_TRANSITION_THRESHOLDS['3->4'];
      expect(t12.minInteractions).toBeLessThan(t23.minInteractions);
      expect(t23.minInteractions).toBeLessThan(t34.minInteractions);
    });

    it('should always have downgradeScore less than upgradeScore', () => {
      for (const [, threshold] of Object.entries(TRUST_TRANSITION_THRESHOLDS)) {
        expect(threshold.downgradeScore).toBeLessThan(threshold.upgradeScore);
      }
    });
  });

  describe('CAPABILITY_GATES', () => {
    it('should allow UNTRUSTED only discovery', () => {
      const caps = CAPABILITY_GATES[TrustLevel.UNTRUSTED];
      expect(caps).toEqual(['discovery']);
    });

    it('should allow VERIFIED discovery, status, and ping', () => {
      const caps = CAPABILITY_GATES[TrustLevel.VERIFIED];
      expect(caps).toContain('discovery');
      expect(caps).toContain('status');
      expect(caps).toContain('ping');
      expect(caps).not.toContain('send');
    });

    it('should allow ATTESTED send, receive, and query-redacted', () => {
      const caps = CAPABILITY_GATES[TrustLevel.ATTESTED];
      expect(caps).toContain('send');
      expect(caps).toContain('receive');
      expect(caps).toContain('query-redacted');
      expect(caps).not.toContain('share-context');
    });

    it('should allow TRUSTED share-context and collaborative-task', () => {
      const caps = CAPABILITY_GATES[TrustLevel.TRUSTED];
      expect(caps).toContain('share-context');
      expect(caps).toContain('collaborative-task');
      expect(caps).not.toContain('full-memory');
    });

    it('should allow PRIVILEGED full-memory and remote-spawn', () => {
      const caps = CAPABILITY_GATES[TrustLevel.PRIVILEGED];
      expect(caps).toContain('full-memory');
      expect(caps).toContain('remote-spawn');
    });

    it('should have each higher level as a superset of lower levels', () => {
      const levels = [
        TrustLevel.UNTRUSTED,
        TrustLevel.VERIFIED,
        TrustLevel.ATTESTED,
        TrustLevel.TRUSTED,
        TrustLevel.PRIVILEGED,
      ];

      for (let i = 1; i < levels.length; i++) {
        const lowerCaps = CAPABILITY_GATES[levels[i - 1]];
        const higherCaps = CAPABILITY_GATES[levels[i]];
        for (const cap of lowerCaps) {
          expect(higherCaps).toContain(cap);
        }
      }
    });
  });

  describe('isOperationAllowed', () => {
    it('should allow discovery for UNTRUSTED', () => {
      expect(isOperationAllowed(TrustLevel.UNTRUSTED, 'discovery')).toBe(true);
    });

    it('should deny send for UNTRUSTED', () => {
      expect(isOperationAllowed(TrustLevel.UNTRUSTED, 'send')).toBe(false);
    });

    it('should deny send for VERIFIED', () => {
      expect(isOperationAllowed(TrustLevel.VERIFIED, 'send')).toBe(false);
    });

    it('should allow send for ATTESTED', () => {
      expect(isOperationAllowed(TrustLevel.ATTESTED, 'send')).toBe(true);
    });

    it('should deny full-memory for TRUSTED', () => {
      expect(isOperationAllowed(TrustLevel.TRUSTED, 'full-memory')).toBe(false);
    });

    it('should allow full-memory for PRIVILEGED', () => {
      expect(isOperationAllowed(TrustLevel.PRIVILEGED, 'full-memory')).toBe(true);
    });

    it('should deny unknown operations at any level', () => {
      expect(isOperationAllowed(TrustLevel.PRIVILEGED, 'unknown-op')).toBe(false);
    });

    it('should allow discovery at every trust level', () => {
      for (const level of [
        TrustLevel.UNTRUSTED,
        TrustLevel.VERIFIED,
        TrustLevel.ATTESTED,
        TrustLevel.TRUSTED,
        TrustLevel.PRIVILEGED,
      ]) {
        expect(isOperationAllowed(level, 'discovery')).toBe(true);
      }
    });
  });

  describe('getTrustLevelLabel', () => {
    it('should return UNTRUSTED for level 0', () => {
      expect(getTrustLevelLabel(TrustLevel.UNTRUSTED)).toBe('UNTRUSTED');
    });

    it('should return VERIFIED for level 1', () => {
      expect(getTrustLevelLabel(TrustLevel.VERIFIED)).toBe('VERIFIED');
    });

    it('should return ATTESTED for level 2', () => {
      expect(getTrustLevelLabel(TrustLevel.ATTESTED)).toBe('ATTESTED');
    });

    it('should return TRUSTED for level 3', () => {
      expect(getTrustLevelLabel(TrustLevel.TRUSTED)).toBe('TRUSTED');
    });

    it('should return PRIVILEGED for level 4', () => {
      expect(getTrustLevelLabel(TrustLevel.PRIVILEGED)).toBe('PRIVILEGED');
    });
  });
});
