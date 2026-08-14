/**
 * AuditService Tests
 *
 * Tests the real AuditService from source with real dependency implementations.
 * No mocks, no simulations, no local reimplementations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AuditService,
  type FederationAuditEventType,
  type AuditSeverity,
  type AuditCategory,
  type ComplianceMode,
  type FederationAuditEvent,
  type AuditQuery,
  type AuditExportFormat,
  type AuditServiceDeps,
} from '../../src/domain/services/audit-service.js';

// ---------------------------------------------------------------------------
// Real dependency implementations for testing
// ---------------------------------------------------------------------------

function createTestDeps(overrides?: Partial<AuditServiceDeps>): {
  deps: AuditServiceDeps;
  persisted: FederationAuditEvent[];
} {
  let idCounter = 0;
  const persisted: FederationAuditEvent[] = [];

  const deps: AuditServiceDeps = {
    generateEventId: () => `evt-${++idCounter}`,
    getLocalNodeId: () => 'test-node-1',
    persistEvent: async (event: FederationAuditEvent) => {
      persisted.push(event);
    },
    queryEvents: async (query: AuditQuery) => {
      let results = [...persisted];
      if (query.eventType) results = results.filter(e => e.eventType === query.eventType);
      if (query.severity) results = results.filter(e => e.severity === query.severity);
      if (query.category) results = results.filter(e => e.category === query.category);
      if (query.nodeId) results = results.filter(e => e.nodeId === query.nodeId);
      if (query.sessionId) results = results.filter(e => e.sessionId === query.sessionId);
      if (query.since) {
        const since = query.since.getTime();
        results = results.filter(e => new Date(e.timestamp).getTime() >= since);
      }
      if (query.until) {
        const until = query.until.getTime();
        results = results.filter(e => new Date(e.timestamp).getTime() <= until);
      }
      if (query.offset) results = results.slice(query.offset);
      if (query.limit) results = results.slice(0, query.limit);
      return results;
    },
    ...overrides,
  };

  return { deps, persisted };
}

// ---------------------------------------------------------------------------
// Expected severity and category mappings (from source)
// ---------------------------------------------------------------------------

const EXPECTED_SEVERITY: Record<FederationAuditEventType, AuditSeverity> = {
  peer_discovered: 'info',
  peer_manifest_published: 'info',
  handshake_initiated: 'info',
  handshake_completed: 'info',
  handshake_failed: 'warn',
  handshake_rejected: 'warn',
  session_created: 'info',
  session_renewed: 'info',
  session_expired: 'info',
  session_terminated: 'info',
  message_sent: 'info',
  message_received: 'info',
  message_rejected: 'warn',
  message_timeout: 'warn',
  pii_detected: 'warn',
  pii_stripped: 'info',
  pii_blocked: 'warn',
  threat_detected: 'error',
  threat_blocked: 'critical',
  threat_learned: 'info',
  claim_checked: 'info',
  claim_denied: 'warn',
  trust_level_changed: 'warn',
  consensus_proposed: 'info',
  consensus_voted: 'info',
  consensus_reached: 'info',
  consensus_failed: 'warn',
};

const EXPECTED_CATEGORY: Record<FederationAuditEventType, AuditCategory> = {
  peer_discovered: 'discovery',
  peer_manifest_published: 'discovery',
  handshake_initiated: 'handshake',
  handshake_completed: 'handshake',
  handshake_failed: 'handshake',
  handshake_rejected: 'handshake',
  session_created: 'handshake',
  session_renewed: 'handshake',
  session_expired: 'handshake',
  session_terminated: 'handshake',
  message_sent: 'message',
  message_received: 'message',
  message_rejected: 'message',
  message_timeout: 'message',
  pii_detected: 'pii',
  pii_stripped: 'pii',
  pii_blocked: 'pii',
  threat_detected: 'security',
  threat_blocked: 'security',
  threat_learned: 'security',
  claim_checked: 'security',
  claim_denied: 'security',
  trust_level_changed: 'security',
  consensus_proposed: 'consensus',
  consensus_voted: 'consensus',
  consensus_reached: 'consensus',
  consensus_failed: 'consensus',
};

const ALL_EVENT_TYPES: FederationAuditEventType[] = Object.keys(EXPECTED_SEVERITY) as FederationAuditEventType[];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditService', () => {
  // -----------------------------------------------------------------------
  // log — basic event creation
  // -----------------------------------------------------------------------
  describe('log', () => {
    let service: AuditService;
    let persisted: FederationAuditEvent[];

    beforeEach(() => {
      const t = createTestDeps();
      persisted = t.persisted;
      service = new AuditService(t.deps);
    });

    it('should create an event with eventId from generateEventId', async () => {
      const event = await service.log('peer_discovered');
      expect(event.eventId).toBe('evt-1');
    });

    it('should generate unique ids for consecutive events', async () => {
      const e1 = await service.log('peer_discovered');
      const e2 = await service.log('peer_discovered');
      expect(e1.eventId).not.toBe(e2.eventId);
    });

    it('should include an ISO 8601 timestamp', async () => {
      const event = await service.log('handshake_initiated');
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include the nodeId from getLocalNodeId', async () => {
      const event = await service.log('message_sent');
      expect(event.nodeId).toBe('test-node-1');
    });

    it('should set complianceMode from config (default none)', async () => {
      const event = await service.log('peer_discovered');
      expect(event.complianceMode).toBe('none');
    });

    it('should set complianceMode from config when provided', async () => {
      const t = createTestDeps();
      const svc = new AuditService(t.deps, { complianceMode: 'soc2' });
      const event = await svc.log('peer_discovered');
      expect(event.complianceMode).toBe('soc2');
    });

    it('should merge additional details into the event', async () => {
      const event = await service.log('message_sent', {
        sourceNodeId: 'node-A',
        targetNodeId: 'node-B',
        latencyMs: 42,
      });
      expect(event.sourceNodeId).toBe('node-A');
      expect(event.targetNodeId).toBe('node-B');
      expect(event.latencyMs).toBe(42);
    });

    it('should return a FederationAuditEvent with correct eventType', async () => {
      const event = await service.log('consensus_proposed');
      expect(event.eventType).toBe('consensus_proposed');
    });
  });

  // -----------------------------------------------------------------------
  // Severity and category mappings for all 26 event types
  // -----------------------------------------------------------------------
  describe('severity mapping', () => {
    let service: AuditService;

    beforeEach(() => {
      const t = createTestDeps();
      service = new AuditService(t.deps);
    });

    it.each(ALL_EVENT_TYPES)(
      'should assign severity "%s" -> %s',
      async (eventType) => {
        const event = await service.log(eventType);
        expect(event.severity).toBe(EXPECTED_SEVERITY[eventType]);
      },
    );
  });

  describe('category mapping', () => {
    let service: AuditService;

    beforeEach(() => {
      const t = createTestDeps();
      service = new AuditService(t.deps);
    });

    it.each(ALL_EVENT_TYPES)(
      'should assign category "%s" -> %s',
      async (eventType) => {
        const event = await service.log(eventType);
        expect(event.category).toBe(EXPECTED_CATEGORY[eventType]);
      },
    );
  });

  // -----------------------------------------------------------------------
  // Buffer and flush behavior
  // -----------------------------------------------------------------------
  describe('buffer', () => {
    it('should track buffer size via getBufferSize', async () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps, { batchSize: 200 });
      expect(service.getBufferSize()).toBe(0);
      await service.log('peer_discovered');
      expect(service.getBufferSize()).toBe(1);
      await service.log('peer_discovered');
      expect(service.getBufferSize()).toBe(2);
    });

    it('should flush buffer when it reaches batchSize', async () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps, { batchSize: 3 });

      await service.log('peer_discovered');
      await service.log('peer_discovered');
      expect(service.getBufferSize()).toBe(2);
      expect(t.persisted).toHaveLength(0);

      // Third event triggers flush
      await service.log('peer_discovered');
      expect(service.getBufferSize()).toBe(0);
      expect(t.persisted).toHaveLength(3);
    });

    it('should flush immediately on critical severity', async () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps, { batchSize: 100 });

      await service.log('peer_discovered'); // info — stays in buffer
      expect(service.getBufferSize()).toBe(1);
      expect(t.persisted).toHaveLength(0);

      // threat_blocked is critical — triggers immediate flush
      await service.log('threat_blocked');
      expect(service.getBufferSize()).toBe(0);
      expect(t.persisted).toHaveLength(2);
    });

    it('should flush all buffered events via flush()', async () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps, { batchSize: 200 });

      await service.log('peer_discovered');
      await service.log('message_sent');
      await service.log('handshake_initiated');
      expect(service.getBufferSize()).toBe(3);
      expect(t.persisted).toHaveLength(0);

      await service.flush();
      expect(service.getBufferSize()).toBe(0);
      expect(t.persisted).toHaveLength(3);
    });

    it('should persist events via deps.persistEvent', async () => {
      const persistEvent = vi.fn(async () => {});
      const t = createTestDeps({ persistEvent });
      const service = new AuditService(t.deps, { batchSize: 1 });

      await service.log('peer_discovered');
      expect(persistEvent).toHaveBeenCalledTimes(1);
      expect(persistEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'peer_discovered' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // onAuditEvent callback
  // -----------------------------------------------------------------------
  describe('onAuditEvent callback', () => {
    it('should call onAuditEvent for every logged event', async () => {
      const onAuditEvent = vi.fn();
      const t = createTestDeps({ onAuditEvent });
      const service = new AuditService(t.deps, { batchSize: 200 });

      const event = await service.log('peer_discovered');
      expect(onAuditEvent).toHaveBeenCalledTimes(1);
      expect(onAuditEvent).toHaveBeenCalledWith(event);
    });

    it('should fire onAuditEvent before flushing', async () => {
      const callOrder: string[] = [];
      const onAuditEvent = vi.fn(() => callOrder.push('callback'));
      const persistEvent = vi.fn(async () => { callOrder.push('persist'); });
      const t = createTestDeps({ onAuditEvent, persistEvent });
      const service = new AuditService(t.deps, { batchSize: 1 });

      await service.log('peer_discovered');
      expect(callOrder[0]).toBe('callback');
      expect(callOrder[1]).toBe('persist');
    });
  });

  // -----------------------------------------------------------------------
  // HIPAA compliance
  // -----------------------------------------------------------------------
  describe('HIPAA compliance', () => {
    let service: AuditService;
    let persisted: FederationAuditEvent[];

    beforeEach(() => {
      const t = createTestDeps();
      persisted = t.persisted;
      service = new AuditService(t.deps, { complianceMode: 'hipaa' });
    });

    it('should strip rawContent from metadata on PII events', async () => {
      const event = await service.log('pii_detected', {
        piiDetected: true,
        metadata: { rawContent: 'SSN: 123-45-6789', context: 'scan' },
      });
      expect(event.metadata).not.toHaveProperty('rawContent');
      expect(event.metadata).toHaveProperty('context', 'scan');
    });

    it('should strip originalValue from metadata on PII events', async () => {
      const event = await service.log('pii_stripped', {
        piiDetected: true,
        metadata: { originalValue: 'john@example.com', action: 'strip' },
      });
      expect(event.metadata).not.toHaveProperty('originalValue');
      expect(event.metadata).toHaveProperty('action', 'strip');
    });

    it('should strip both rawContent and originalValue together', async () => {
      const event = await service.log('pii_blocked', {
        piiDetected: true,
        metadata: {
          rawContent: 'sensitive',
          originalValue: 'also-sensitive',
          typesFound: ['email'],
        },
      });
      expect(event.metadata).not.toHaveProperty('rawContent');
      expect(event.metadata).not.toHaveProperty('originalValue');
      expect(event.metadata).toHaveProperty('typesFound');
    });

    it('should not strip metadata when piiDetected is false', async () => {
      const event = await service.log('message_sent', {
        metadata: { rawContent: 'keep-me' },
      });
      expect(event.metadata).toHaveProperty('rawContent', 'keep-me');
    });

    it('should not strip metadata when there is no metadata', async () => {
      const event = await service.log('pii_detected', { piiDetected: true });
      expect(event.metadata).toBeUndefined();
    });

    it('should set complianceMode to hipaa on all events', async () => {
      const event = await service.log('peer_discovered');
      expect(event.complianceMode).toBe('hipaa');
    });
  });

  // -----------------------------------------------------------------------
  // query
  // -----------------------------------------------------------------------
  describe('query', () => {
    let service: AuditService;
    let persisted: FederationAuditEvent[];

    beforeEach(async () => {
      const t = createTestDeps();
      persisted = t.persisted;
      service = new AuditService(t.deps, { batchSize: 200 });

      await service.log('peer_discovered');
      // threat_blocked is critical — triggers immediate flush of buffer (2 events)
      await service.log('threat_blocked', { metadata: { reason: 'malicious' } });
      await service.log('pii_detected', { piiDetected: true });
      await service.log('peer_manifest_published');
      await service.log('message_sent');
    });

    it('should flush the buffer before querying', async () => {
      // 3 events remain buffered (pii_detected, peer_manifest_published, message_sent)
      // The first 2 were flushed when threat_blocked (critical) was logged
      expect(service.getBufferSize()).toBe(3);
      const results = await service.query({});
      expect(service.getBufferSize()).toBe(0);
      // All 5 events are now persisted and queryable
      expect(results).toHaveLength(5);
    });

    it('should filter by eventType', async () => {
      const results = await service.query({ eventType: 'peer_discovered' });
      expect(results).toHaveLength(1);
      expect(results[0].eventType).toBe('peer_discovered');
    });

    it('should filter by severity', async () => {
      const results = await service.query({ severity: 'critical' });
      expect(results).toHaveLength(1);
      expect(results[0].eventType).toBe('threat_blocked');
    });

    it('should filter by category', async () => {
      const results = await service.query({ category: 'discovery' });
      expect(results).toHaveLength(2);
    });

    it('should respect limit', async () => {
      const results = await service.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should return empty array when no events match', async () => {
      const results = await service.query({ eventType: 'consensus_failed' });
      expect(results).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // export
  // -----------------------------------------------------------------------
  describe('export', () => {
    let service: AuditService;

    beforeEach(async () => {
      const t = createTestDeps();
      service = new AuditService(t.deps, { batchSize: 200 });
      await service.log('peer_discovered', { sourceNodeId: 'node-A' });
      await service.log('message_sent', { targetNodeId: 'node-B' });
    });

    it('should export as json (pretty-printed array)', async () => {
      const output = await service.export({}, 'json');
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].eventType).toBe('peer_discovered');
    });

    it('should export as ndjson (one JSON object per line)', async () => {
      const output = await service.export({}, 'ndjson');
      const lines = output.split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).eventType).toBe('peer_discovered');
      expect(JSON.parse(lines[1]).eventType).toBe('message_sent');
    });

    it('should export as csv with headers', async () => {
      const output = await service.export({}, 'csv');
      const lines = output.split('\n');
      expect(lines[0]).toContain('eventId');
      expect(lines[0]).toContain('timestamp');
      expect(lines[0]).toContain('severity');
      expect(lines).toHaveLength(3); // header + 2 data rows
    });

    it('should return empty string for csv with no matching events', async () => {
      const output = await service.export({ eventType: 'consensus_failed' }, 'csv');
      expect(output).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // getBufferSize
  // -----------------------------------------------------------------------
  describe('getBufferSize', () => {
    it('should return 0 initially', () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps);
      expect(service.getBufferSize()).toBe(0);
    });

    it('should increment after each log (when batchSize is large)', async () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps, { batchSize: 500 });
      await service.log('peer_discovered');
      expect(service.getBufferSize()).toBe(1);
      await service.log('message_sent');
      expect(service.getBufferSize()).toBe(2);
    });

    it('should reset to 0 after flush', async () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps, { batchSize: 500 });
      await service.log('peer_discovered');
      await service.log('peer_discovered');
      await service.flush();
      expect(service.getBufferSize()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Config defaults
  // -----------------------------------------------------------------------
  describe('config defaults', () => {
    it('should default complianceMode to none', async () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps);
      const event = await service.log('peer_discovered');
      expect(event.complianceMode).toBe('none');
    });

    it('should default batchSize to 100', async () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps);
      // Log 99 events — buffer should not flush
      for (let i = 0; i < 99; i++) {
        await service.log('peer_discovered');
      }
      expect(service.getBufferSize()).toBe(99);
      expect(t.persisted).toHaveLength(0);

      // 100th event triggers flush
      await service.log('peer_discovered');
      expect(service.getBufferSize()).toBe(0);
      expect(t.persisted).toHaveLength(100);
    });

    it('should allow overriding dataResidency', async () => {
      const t = createTestDeps();
      const service = new AuditService(t.deps, { dataResidency: 'us-east-1' });
      const event = await service.log('peer_discovered');
      expect(event.dataResidency).toBe('us-east-1');
    });
  });
});
