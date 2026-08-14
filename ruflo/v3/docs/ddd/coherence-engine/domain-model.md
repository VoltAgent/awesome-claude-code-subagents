# Coherence Engine Domain Model

## Overview

This document defines the domain model for the Coherence Engine, including entities, value objects, aggregates, and domain services that implement mathematical AI interpretability for Claude Flow V3.

## Core Domain Objects

### Value Objects

#### CoherenceEnergy

Represents the Sheaf Laplacian energy measuring contradiction level.

```typescript
/**
 * Coherence Energy Value Object
 * Immutable scalar representing contradiction level
 * Range: [0, 1] where 0 = fully coherent, 1 = fully contradictory
 */
class CoherenceEnergy {
  private readonly value: number;

  private constructor(value: number) {
    if (value < 0 || value > 1) {
      throw new Error('CoherenceEnergy must be between 0 and 1');
    }
    this.value = value;
  }

  static create(value: number): CoherenceEnergy {
    return new CoherenceEnergy(Math.max(0, Math.min(1, value)));
  }

  static coherent(): CoherenceEnergy {
    return new CoherenceEnergy(0);
  }

  static contradictory(): CoherenceEnergy {
    return new CoherenceEnergy(1);
  }

  getValue(): number {
    return this.value;
  }

  isCoherent(threshold: number = 0.3): boolean {
    return this.value < threshold;
  }

  isContradictory(threshold: number = 0.7): boolean {
    return this.value >= threshold;
  }

  isWarning(warnThreshold: number = 0.3, rejectThreshold: number = 0.7): boolean {
    return this.value >= warnThreshold && this.value < rejectThreshold;
  }

  getConfidence(): number {
    return 1 - this.value;
  }

  equals(other: CoherenceEnergy): boolean {
    return Math.abs(this.value - other.value) < 0.0001;
  }
}
```

#### SpectralGap

Represents the spectral gap indicating system stability.

```typescript
/**
 * Spectral Gap Value Object
 * Difference between first and second eigenvalues
 * Positive gap indicates stability
 */
class SpectralGap {
  private readonly value: number;

  private constructor(value: number) {
    this.value = value;
  }

  static create(eigenvalues: number[]): SpectralGap {
    if (eigenvalues.length < 2) {
      return new SpectralGap(1); // Trivially stable
    }
    const sorted = [...eigenvalues].sort((a, b) => b - a);
    return new SpectralGap(sorted[0] - sorted[1]);
  }

  getValue(): number {
    return this.value;
  }

  isStable(threshold: number = 0.1): boolean {
    return this.value > threshold;
  }

  getStabilityLevel(): 'stable' | 'marginal' | 'unstable' {
    if (this.value > 0.2) return 'stable';
    if (this.value > 0.05) return 'marginal';
    return 'unstable';
  }

  equals(other: SpectralGap): boolean {
    return Math.abs(this.value - other.value) < 0.0001;
  }
}
```

#### CausalEffect

Represents the estimated causal effect of an intervention.

```typescript
/**
 * Causal Effect Value Object
 * Estimated effect of treatment on outcome
 */
class CausalEffect {
  private readonly value: number;
  private readonly confidence: number;

  private constructor(value: number, confidence: number) {
    this.value = value;
    this.confidence = Math.max(0, Math.min(1, confidence));
  }

  static create(value: number, confidence: number): CausalEffect {
    return new CausalEffect(value, confidence);
  }

  getValue(): number {
    return this.value;
  }

  getConfidence(): number {
    return this.confidence;
  }

  isSignificant(threshold: number = 0.1): boolean {
    return Math.abs(this.value) > threshold && this.confidence > 0.8;
  }

  getDirection(): 'positive' | 'negative' | 'neutral' {
    if (this.value > 0.1) return 'positive';
    if (this.value < -0.1) return 'negative';
    return 'neutral';
  }

  equals(other: CausalEffect): boolean {
    return Math.abs(this.value - other.value) < 0.0001 &&
           Math.abs(this.confidence - other.confidence) < 0.0001;
  }
}
```

#### BettiNumbers

Represents topological invariants of a space.

```typescript
/**
 * Betti Numbers Value Object
 * Topological invariants: b0=components, b1=loops, b2=voids
 */
class BettiNumbers {
  private readonly values: number[];

  private constructor(values: number[]) {
    this.values = [...values];
  }

  static create(values: number[]): BettiNumbers {
    return new BettiNumbers(values);
  }

  getB0(): number {
    return this.values[0] ?? 0;
  }

  getB1(): number {
    return this.values[1] ?? 0;
  }

  getB2(): number {
    return this.values[2] ?? 0;
  }

  getDimension(d: number): number {
    return this.values[d] ?? 0;
  }

  isConnected(): boolean {
    return this.getB0() === 1;
  }

  hasLoops(): boolean {
    return this.getB1() > 0;
  }

  hasVoids(): boolean {
    return this.getB2() > 0;
  }

  getAll(): number[] {
    return [...this.values];
  }

  equals(other: BettiNumbers): boolean {
    if (this.values.length !== other.values.length) return false;
    return this.values.every((v, i) => v === other.values[i]);
  }
}
```

### Entities

#### CoherenceCheck

Represents a coherence validation with identity.

```typescript
/**
 * Coherence Check Entity
 * Tracks a specific coherence validation event
 */
class CoherenceCheck {
  readonly id: string;
  readonly timestamp: Date;
  readonly vectors: Float32Array[];
  readonly energy: CoherenceEnergy;
  readonly violations: string[];
  readonly action: 'allow' | 'warn' | 'reject';

  constructor(params: {
    id: string;
    vectors: Float32Array[];
    energy: CoherenceEnergy;
    violations: string[];
    action: 'allow' | 'warn' | 'reject';
  }) {
    this.id = params.id;
    this.timestamp = new Date();
    this.vectors = params.vectors;
    this.energy = params.energy;
    this.violations = params.violations;
    this.action = params.action;
  }

  static create(params: Omit<ConstructorParameters<typeof CoherenceCheck>[0], 'id'>): CoherenceCheck {
    return new CoherenceCheck({
      id: `coh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...params
    });
  }

  wasRejected(): boolean {
    return this.action === 'reject';
  }

  hadWarnings(): boolean {
    return this.action === 'warn';
  }

  getViolationCount(): number {
    return this.violations.length;
  }
}
```

#### StabilityAnalysis

Represents a spectral stability analysis with identity.

```typescript
/**
 * Stability Analysis Entity
 * Tracks spectral analysis of a system
 */
class StabilityAnalysis {
  readonly id: string;
  readonly timestamp: Date;
  readonly sourceType: 'swarm' | 'consensus' | 'memory';
  readonly sourceId: string;
  readonly spectralGap: SpectralGap;
  readonly eigenvalues: number[];
  readonly stabilityIndex: number;
  readonly recommendations: string[];

  constructor(params: {
    id: string;
    sourceType: 'swarm' | 'consensus' | 'memory';
    sourceId: string;
    spectralGap: SpectralGap;
    eigenvalues: number[];
    stabilityIndex: number;
    recommendations: string[];
  }) {
    this.id = params.id;
    this.timestamp = new Date();
    this.sourceType = params.sourceType;
    this.sourceId = params.sourceId;
    this.spectralGap = params.spectralGap;
    this.eigenvalues = params.eigenvalues;
    this.stabilityIndex = params.stabilityIndex;
    this.recommendations = params.recommendations;
  }

  static create(params: Omit<ConstructorParameters<typeof StabilityAnalysis>[0], 'id'>): StabilityAnalysis {
    return new StabilityAnalysis({
      id: `stab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...params
    });
  }

  isHealthy(): boolean {
    return this.spectralGap.isStable() && this.stabilityIndex > 0.5;
  }

  needsAttention(): boolean {
    return this.recommendations.length > 0;
  }
}
```

#### CausalQuery

Represents a causal inference query with identity.

```typescript
/**
 * Causal Query Entity
 * Tracks a causal inference operation
 */
class CausalQuery {
  readonly id: string;
  readonly timestamp: Date;
  readonly treatment: string;
  readonly outcome: string;
  readonly graph: CausalGraph;
  readonly effect: CausalEffect;
  readonly confounders: string[];
  readonly backdoorPaths: string[][];
  readonly interventionValid: boolean;

  constructor(params: {
    id: string;
    treatment: string;
    outcome: string;
    graph: CausalGraph;
    effect: CausalEffect;
    confounders: string[];
    backdoorPaths: string[][];
    interventionValid: boolean;
  }) {
    this.id = params.id;
    this.timestamp = new Date();
    this.treatment = params.treatment;
    this.outcome = params.outcome;
    this.graph = params.graph;
    this.effect = params.effect;
    this.confounders = params.confounders;
    this.backdoorPaths = params.backdoorPaths;
    this.interventionValid = params.interventionValid;
  }

  static create(params: Omit<ConstructorParameters<typeof CausalQuery>[0], 'id'>): CausalQuery {
    return new CausalQuery({
      id: `causal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...params
    });
  }

  hasConfounders(): boolean {
    return this.confounders.length > 0;
  }

  hasBackdoorPaths(): boolean {
    return this.backdoorPaths.length > 0;
  }

  isValidForIntervention(): boolean {
    return this.interventionValid;
  }
}
```

### Aggregates

#### CoherenceGateAggregate

Root aggregate for coherence validation operations.

```typescript
/**
 * Coherence Gate Aggregate
 * Manages coherence validation state and operations
 */
class CoherenceGateAggregate {
  private readonly id: string;
  private thresholds: CoherenceThresholds;
  private recentChecks: CoherenceCheck[] = [];
  private readonly maxHistory: number = 100;

  constructor(id: string, thresholds?: Partial<CoherenceThresholds>) {
    this.id = id;
    this.thresholds = {
      warn: thresholds?.warn ?? 0.3,
      reject: thresholds?.reject ?? 0.7
    };
  }

  getId(): string {
    return this.id;
  }

  /**
   * Validate vectors for coherence
   */
  async validate(
    vectors: Float32Array[],
    engine: CohomologyEngine
  ): Promise<CoherenceCheck> {
    const energyValue = await engine.computeSheafLaplacianEnergy(vectors);
    const violations = await engine.detectContradictions(vectors);
    const energy = CoherenceEnergy.create(energyValue);

    let action: 'allow' | 'warn' | 'reject';
    if (energy.isContradictory(this.thresholds.reject)) {
      action = 'reject';
    } else if (energy.isWarning(this.thresholds.warn, this.thresholds.reject)) {
      action = 'warn';
    } else {
      action = 'allow';
    }

    const check = CoherenceCheck.create({
      vectors,
      energy,
      violations,
      action
    });

    this.addToHistory(check);
    return check;
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<CoherenceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get recent check history
   */
  getRecentChecks(limit: number = 10): CoherenceCheck[] {
    return this.recentChecks.slice(-limit);
  }

  /**
   * Calculate rejection rate
   */
  getRejectionRate(): number {
    if (this.recentChecks.length === 0) return 0;
    const rejected = this.recentChecks.filter(c => c.wasRejected()).length;
    return rejected / this.recentChecks.length;
  }

  private addToHistory(check: CoherenceCheck): void {
    this.recentChecks.push(check);
    if (this.recentChecks.length > this.maxHistory) {
      this.recentChecks = this.recentChecks.slice(-this.maxHistory);
    }
  }
}

interface CoherenceThresholds {
  warn: number;
  reject: number;
}
```

#### StabilityAnalyzerAggregate

Root aggregate for spectral stability analysis.

```typescript
/**
 * Stability Analyzer Aggregate
 * Manages stability analysis operations
 */
class StabilityAnalyzerAggregate {
  private readonly id: string;
  private analyses: StabilityAnalysis[] = [];
  private readonly maxHistory: number = 50;

  constructor(id: string) {
    this.id = id;
  }

  getId(): string {
    return this.id;
  }

  /**
   * Analyze stability of an adjacency matrix
   */
  async analyze(
    adjacencyMatrix: Float32Array,
    sourceType: 'swarm' | 'consensus' | 'memory',
    sourceId: string,
    engine: SpectralEngine
  ): Promise<StabilityAnalysis> {
    const eigenvalues = await engine.computeEigenvalues(adjacencyMatrix);
    const spectralGap = SpectralGap.create(Array.from(eigenvalues));
    const stabilityIndex = await engine.computeStabilityIndex(eigenvalues);

    const recommendations: string[] = [];
    if (!spectralGap.isStable()) {
      recommendations.push('System shows instability - consider reducing complexity');
    }
    if (spectralGap.getValue() < 0.1) {
      recommendations.push('Low spectral gap - potential clustering/fragmentation');
    }
    if (stabilityIndex < 0.5) {
      recommendations.push('Low stability index - coordination may be compromised');
    }

    const analysis = StabilityAnalysis.create({
      sourceType,
      sourceId,
      spectralGap,
      eigenvalues: Array.from(eigenvalues),
      stabilityIndex,
      recommendations
    });

    this.addToHistory(analysis);
    return analysis;
  }

  /**
   * Get recent analyses for a source
   */
  getAnalysesForSource(sourceId: string): StabilityAnalysis[] {
    return this.analyses.filter(a => a.sourceId === sourceId);
  }

  /**
   * Calculate average stability
   */
  getAverageStabilityIndex(): number {
    if (this.analyses.length === 0) return 1;
    const sum = this.analyses.reduce((acc, a) => acc + a.stabilityIndex, 0);
    return sum / this.analyses.length;
  }

  private addToHistory(analysis: StabilityAnalysis): void {
    this.analyses.push(analysis);
    if (this.analyses.length > this.maxHistory) {
      this.analyses = this.analyses.slice(-this.maxHistory);
    }
  }
}
```

## Domain Services

### CoherenceValidationService

Service for coherence validation operations.

```typescript
/**
 * Coherence Validation Service
 * Orchestrates coherence checking across the system
 */
class CoherenceValidationService {
  private readonly bridge: PrimeRadiantBridge;
  private readonly gates: Map<string, CoherenceGateAggregate> = new Map();

  constructor(bridge: PrimeRadiantBridge) {
    this.bridge = bridge;
  }

  /**
   * Get or create gate for namespace
   */
  getGate(namespace: string): CoherenceGateAggregate {
    if (!this.gates.has(namespace)) {
      this.gates.set(namespace, new CoherenceGateAggregate(namespace));
    }
    return this.gates.get(namespace)!;
  }

  /**
   * Validate entry against context
   */
  async validateEntry(
    entry: { embedding: Float32Array },
    context: { embedding: Float32Array }[],
    namespace: string
  ): Promise<CoherenceCheck> {
    const vectors = [entry.embedding, ...context.map(c => c.embedding)];
    const gate = this.getGate(namespace);
    return gate.validate(vectors, this.bridge.getCohomologyEngine());
  }

  /**
   * Batch validate entries
   */
  async validateBatch(
    entries: { embedding: Float32Array }[],
    namespace: string
  ): Promise<CoherenceCheck[]> {
    const results: CoherenceCheck[] = [];
    const gate = this.getGate(namespace);
    const processed: Float32Array[] = [];

    for (const entry of entries) {
      const vectors = [entry.embedding, ...processed];
      const check = await gate.validate(vectors, this.bridge.getCohomologyEngine());
      results.push(check);

      if (!check.wasRejected()) {
        processed.push(entry.embedding);
      }
    }

    return results;
  }
}
```

### ConsensusVerificationService

Service for mathematical consensus verification.

```typescript
/**
 * Consensus Verification Service
 * Mathematically verifies multi-agent consensus
 */
class ConsensusVerificationService {
  private readonly bridge: PrimeRadiantBridge;
  private readonly stabilityAnalyzer: StabilityAnalyzerAggregate;

  constructor(bridge: PrimeRadiantBridge) {
    this.bridge = bridge;
    this.stabilityAnalyzer = new StabilityAnalyzerAggregate('consensus');
  }

  /**
   * Verify consensus mathematically
   */
  async verify(
    agentStates: { id: string; embedding: Float32Array; vote: boolean }[],
    threshold: number = 0.8
  ): Promise<{
    verified: boolean;
    coherenceEnergy: CoherenceEnergy;
    spectralStability: boolean;
    agreementRatio: number;
  }> {
    // Check coherence of agent states
    const vectors = agentStates.map(s => s.embedding);
    const coherenceResult = await this.bridge.checkCoherence(vectors);
    const coherenceEnergy = CoherenceEnergy.create(coherenceResult.energy);

    // Build adjacency from vote agreement
    const n = agentStates.length;
    const adj = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        adj[i * n + j] = agentStates[i].vote === agentStates[j].vote ? 1 : 0;
      }
    }

    // Analyze spectral stability
    const stability = await this.stabilityAnalyzer.analyze(
      adj,
      'consensus',
      `consensus-${Date.now()}`,
      this.bridge.getSpectralEngine()
    );

    // Calculate agreement ratio
    const yesVotes = agentStates.filter(s => s.vote).length;
    const agreementRatio = Math.max(yesVotes, n - yesVotes) / n;

    const verified = coherenceEnergy.isCoherent() &&
                     stability.spectralGap.isStable() &&
                     agreementRatio >= threshold;

    return {
      verified,
      coherenceEnergy,
      spectralStability: stability.spectralGap.isStable(),
      agreementRatio
    };
  }
}
```

## Domain Events

### CoherenceViolationDetected

```typescript
/**
 * Domain Event: Coherence Violation Detected
 */
interface CoherenceViolationDetected {
  type: 'CoherenceViolationDetected';
  timestamp: Date;
  checkId: string;
  energy: number;
  violations: string[];
  namespace: string;
  action: 'warn' | 'reject';
}
```

### StabilityThresholdBreached

```typescript
/**
 * Domain Event: Stability Threshold Breached
 */
interface StabilityThresholdBreached {
  type: 'StabilityThresholdBreached';
  timestamp: Date;
  analysisId: string;
  sourceType: 'swarm' | 'consensus' | 'memory';
  sourceId: string;
  spectralGap: number;
  recommendations: string[];
}
```

### ConsensusVerificationFailed

```typescript
/**
 * Domain Event: Consensus Verification Failed
 */
interface ConsensusVerificationFailed {
  type: 'ConsensusVerificationFailed';
  timestamp: Date;
  proposalId: string;
  coherenceEnergy: number;
  agreementRatio: number;
  reason: string;
}
```

## Repository Interfaces

```typescript
/**
 * Repository for persisting coherence checks
 */
interface CoherenceCheckRepository {
  save(check: CoherenceCheck): Promise<void>;
  findById(id: string): Promise<CoherenceCheck | null>;
  findByNamespace(namespace: string, limit?: number): Promise<CoherenceCheck[]>;
  findRejected(since: Date): Promise<CoherenceCheck[]>;
}

/**
 * Repository for persisting stability analyses
 */
interface StabilityAnalysisRepository {
  save(analysis: StabilityAnalysis): Promise<void>;
  findById(id: string): Promise<StabilityAnalysis | null>;
  findBySource(sourceType: string, sourceId: string): Promise<StabilityAnalysis[]>;
  findUnhealthy(since: Date): Promise<StabilityAnalysis[]>;
}

/**
 * Repository for persisting causal queries
 */
interface CausalQueryRepository {
  save(query: CausalQuery): Promise<void>;
  findById(id: string): Promise<CausalQuery | null>;
  findByTreatment(treatment: string): Promise<CausalQuery[]>;
  findInvalid(since: Date): Promise<CausalQuery[]>;
}
```

## Related Documentation

- [README](./README.md) - Domain overview
- [Integration Points](./integration-points.md) - V3 integration details
- [ADR-031: Prime Radiant Integration](../../implementation/adrs/ADR-031-prime-radiant-integration.md)
