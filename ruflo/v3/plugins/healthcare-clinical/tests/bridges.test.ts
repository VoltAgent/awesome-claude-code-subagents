/**
 * Healthcare Clinical Plugin - Bridge Tests
 *
 * Tests for HealthcareHNSWBridge and HealthcareGNNBridge initialization, lifecycle, and methods
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthcareHNSWBridge } from '../src/bridges/hnsw-bridge.js';
import { HealthcareGNNBridge } from '../src/bridges/gnn-bridge.js';

// Mock WASM modules
vi.mock('../src/bridges/hnsw-wasm.js', () => ({
  initWasm: vi.fn().mockResolvedValue(undefined),
  wasmAvailable: vi.fn().mockReturnValue(false),
}));

vi.mock('../src/bridges/gnn-wasm.js', () => ({
  initWasm: vi.fn().mockResolvedValue(undefined),
  wasmAvailable: vi.fn().mockReturnValue(false),
}));

describe('HealthcareHNSWBridge', () => {
  let bridge: HealthcareHNSWBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new HealthcareHNSWBridge();
  });

  afterEach(async () => {
    try {
      bridge.destroy();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should create bridge instance', () => {
      expect(bridge).toBeInstanceOf(HealthcareHNSWBridge);
    });

    it('should initialize successfully', async () => {
      await bridge.initialize();
      expect(bridge.initialized).toBe(true);
    });

    it('should initialize with custom config', async () => {
      await bridge.initialize({
        dimensions: 256,
        maxElements: 50000,
        efConstruction: 200,
        M: 16,
      });
      expect(bridge.initialized).toBe(true);
    });

    it('should handle HIPAA-compliant config', async () => {
      await bridge.initialize({
        dimensions: 128,
      });
      expect(bridge.initialized).toBe(true);
    });

    it('should handle double initialization gracefully', async () => {
      await bridge.initialize();
      await bridge.initialize(); // Should not throw
      expect(bridge.initialized).toBe(true);
    });
  });

  describe('Lifecycle', () => {
    it('should destroy successfully', async () => {
      await bridge.initialize();
      bridge.destroy();
      expect(bridge.initialized).toBe(false);
    });

    it('should handle destroy when not initialized', () => {
      expect(() => bridge.destroy()).not.toThrow();
    });

    it('should reinitialize after destroy', async () => {
      await bridge.initialize();
      bridge.destroy();
      await bridge.initialize();
      expect(bridge.initialized).toBe(true);
    });
  });

  describe('Vector Operations', () => {
    beforeEach(async () => {
      await bridge.initialize({ dimensions: 768 });
    });

    it('should add vector', async () => {
      await bridge.addVector('patient-1', new Float32Array(768).fill(0.5));
      const count = await bridge.count();
      expect(count).toBe(1);
    });

    it('should add patient with features', async () => {
      await bridge.addPatient('P12345', {
        diagnoses: ['E11.9', 'I10'],
        medications: ['metformin', 'lisinopril'],
      });
      const count = await bridge.count();
      expect(count).toBe(1);
    });

    it('should search for similar vectors', async () => {
      // Add some vectors
      await bridge.addVector('p1', new Float32Array(768).fill(0.1));
      await bridge.addVector('p2', new Float32Array(768).fill(0.2));
      await bridge.addVector('p3', new Float32Array(768).fill(0.9));

      const query = new Float32Array(768).fill(0.15);
      const results = await bridge.search(query, 2);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should search by patient features', async () => {
      await bridge.addPatient('P001', {
        diagnoses: ['E11.9'],
        medications: ['metformin'],
      });
      await bridge.addPatient('P002', {
        diagnoses: ['E11.9', 'E66'],
        medications: ['metformin', 'ozempic'],
      });

      const results = await bridge.searchByFeatures({
        diagnoses: ['E11.9'],
      }, 5);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should delete vector', async () => {
      await bridge.addVector('to-delete', new Float32Array(768).fill(0.5));
      const countBefore = await bridge.count();

      await bridge.delete('to-delete');
      const countAfter = await bridge.count();

      expect(countAfter).toBeLessThan(countBefore);
    });

    it('should return count', async () => {
      await bridge.addVector('v1', new Float32Array(768).fill(0.1));
      await bridge.addVector('v2', new Float32Array(768).fill(0.2));

      const count = await bridge.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw when operations called before init', async () => {
      await expect(
        bridge.addVector('test', new Float32Array(768))
      ).rejects.toThrow('HNSW bridge not initialized');
    });
  });

  describe('JavaScript Fallback', () => {
    it('should work without WASM', async () => {
      const fallbackBridge = new HealthcareHNSWBridge({ dimensions: 768 });
      await fallbackBridge.initialize();

      await fallbackBridge.addVector('test', new Float32Array(768).fill(0.5));
      const results = await fallbackBridge.search(new Float32Array(768).fill(0.5), 1);

      expect(results.length).toBeGreaterThan(0);
      fallbackBridge.destroy();
    });
  });
});

describe('HealthcareGNNBridge', () => {
  let bridge: HealthcareGNNBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new HealthcareGNNBridge();
  });

  afterEach(() => {
    try {
      bridge.destroy();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should create bridge instance', () => {
      expect(bridge).toBeInstanceOf(HealthcareGNNBridge);
    });

    it('should initialize successfully', async () => {
      await bridge.initialize();
      expect(bridge.initialized).toBe(true);
    });

    it('should initialize with custom config', async () => {
      await bridge.initialize({
        hiddenDimensions: 128,
        numLayers: 4,
        aggregationType: 'mean',
      });
      expect(bridge.initialized).toBe(true);
    });

    it('should handle double initialization gracefully', async () => {
      await bridge.initialize();
      await bridge.initialize();
      expect(bridge.initialized).toBe(true);
    });
  });

  describe('Lifecycle', () => {
    it('should destroy successfully', async () => {
      await bridge.initialize();
      bridge.destroy();
      expect(bridge.initialized).toBe(false);
    });

    it('should handle destroy when not initialized', () => {
      expect(() => bridge.destroy()).not.toThrow();
    });
  });

  describe('Graph Operations', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should load drug interaction graph', async () => {
      const nodes = [
        { id: 'drug-1', type: 'drug', features: [0.1, 0.2, 0.3] },
        { id: 'drug-2', type: 'drug', features: [0.4, 0.5, 0.6] },
      ];
      const edges = [
        { source: 'drug-1', target: 'drug-2', type: 'interacts', weight: 0.8 },
      ];

      await bridge.loadGraph(nodes, edges);
      // No error means success
      expect(bridge.initialized).toBe(true);
    });

    it('should analyze drug interactions using built-in graph', async () => {
      // The bridge has built-in drug interactions
      const interactions = await bridge.analyzeInteractions(['warfarin', 'aspirin']);

      expect(interactions).toHaveProperty('interactions');
      expect(interactions).toHaveProperty('riskFactors');
      expect(interactions).toHaveProperty('recommendations');
    });

    it('should check drug interactions using built-in data', () => {
      // Uses built-in DrugInteractionGraph
      const result = bridge.checkDrugInteractions(['warfarin', 'aspirin']);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('drug1');
      expect(result[0]).toHaveProperty('drug2');
      expect(result[0]).toHaveProperty('severity');
    });

    it('should predict clinical pathway', async () => {
      const nodes = [
        { id: 'diagnosis', type: 'condition', features: [1, 0, 0] },
        { id: 'step1', type: 'treatment', features: [0, 1, 0] },
        { id: 'step2', type: 'treatment', features: [0, 0, 1] },
      ];
      const edges = [
        { source: 'diagnosis', target: 'step1', type: 'first_line', weight: 1.0 },
        { source: 'step1', target: 'step2', type: 'if_inadequate', weight: 0.8 },
      ];

      await bridge.loadGraph(nodes, edges);
      const pathway = await bridge.predictPathway('diagnosis', 'step2');

      expect(pathway).toHaveProperty('path');
      expect(pathway).toHaveProperty('confidence');
      expect(Array.isArray(pathway.path)).toBe(true);
    });

    it('should get clinical pathway from built-in data', () => {
      // Uses built-in ClinicalPathwayGraph
      const pathway = bridge.getClinicalPathway('E11'); // Type 2 Diabetes

      expect(pathway).toBeDefined();
      expect(pathway).toHaveProperty('name');
      expect(pathway).toHaveProperty('steps');
    });
  });

  describe('Error Handling', () => {
    it('should throw when operations called before init', async () => {
      await expect(
        bridge.loadGraph([], [])
      ).rejects.toThrow('GNN bridge not initialized');
    });

    it('should handle empty drug list', async () => {
      await bridge.initialize();

      const result = bridge.checkDrugInteractions([]);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('JavaScript Fallback', () => {
    it('should work without WASM', async () => {
      const fallbackBridge = new HealthcareGNNBridge();
      await fallbackBridge.initialize();

      await fallbackBridge.loadGraph(
        [{ id: 'test', type: 'drug', features: [0.1, 0.2] }],
        []
      );

      const result = fallbackBridge.checkDrugInteractions(['warfarin', 'aspirin']);
      expect(result.length).toBeGreaterThan(0);

      fallbackBridge.destroy();
    });
  });

  describe('Memory Management', () => {
    it('should release resources on destroy', async () => {
      await bridge.initialize();

      // Load substantial graph
      const nodes = Array(100).fill(null).map((_, i) => ({
        id: `node-${i}`,
        type: 'drug',
        features: [Math.random(), Math.random()],
      }));

      const edges = Array(200).fill(null).map((_, i) => ({
        source: `node-${i % 100}`,
        target: `node-${(i + 1) % 100}`,
        type: 'interacts',
        weight: 0.5,
      }));

      await bridge.loadGraph(nodes, edges);
      bridge.destroy();

      expect(bridge.initialized).toBe(false);
    });

    it('should handle multiple init/destroy cycles', async () => {
      for (let i = 0; i < 3; i++) {
        await bridge.initialize();
        await bridge.loadGraph(
          [{ id: 'test', type: 'drug', features: [0.1] }],
          []
        );
        bridge.destroy();
      }
      expect(bridge.initialized).toBe(false);
    });
  });
});
