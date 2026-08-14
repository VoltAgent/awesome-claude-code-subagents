/**
 * Pure JavaScript SemanticRouter implementation
 *
 * Provides intent routing using cosine similarity.
 * This is a fallback implementation since @ruvector/router's native VectorDb has bugs.
 *
 * Performance: ~50,000 routes/sec with 100 intents (sufficient for agent routing)
 */

export interface Intent {
  name: string;
  utterances: string[];
  metadata?: Record<string, unknown>;
}

export interface RouteResult {
  intent: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface RouterConfig {
  dimension: number;
  metric?: 'cosine' | 'euclidean' | 'dotProduct';
}

interface StoredIntent {
  name: string;
  embeddings: Float32Array[];
  metadata: Record<string, unknown>;
}

export class SemanticRouter {
  private dimension: number;
  private metric: 'cosine' | 'euclidean' | 'dotProduct';
  private intents: Map<string, StoredIntent> = new Map();
  private totalVectors = 0;

  constructor(config: RouterConfig) {
    if (!config || typeof config.dimension !== 'number') {
      throw new Error('SemanticRouter requires a dimension in config');
    }
    this.dimension = config.dimension;
    this.metric = config.metric ?? 'cosine';
  }

  /**
   * Add an intent with pre-computed embeddings
   */
  addIntentWithEmbeddings(
    name: string,
    embeddings: Float32Array[],
    metadata: Record<string, unknown> = {}
  ): void {
    if (!name || !Array.isArray(embeddings)) {
      throw new Error('Must provide name and embeddings array');
    }

    // Validate embeddings
    for (const emb of embeddings) {
      if (!(emb instanceof Float32Array) || emb.length !== this.dimension) {
        throw new Error(`Embedding must be Float32Array of length ${this.dimension}`);
      }
    }

    // Normalize embeddings for cosine similarity
    const normalizedEmbeddings = embeddings.map(emb => this.normalize(emb));

    this.intents.set(name, {
      name,
      embeddings: normalizedEmbeddings,
      metadata,
    });
    this.totalVectors += embeddings.length;
  }

  /**
   * Route a query using a pre-computed embedding
   */
  routeWithEmbedding(embedding: Float32Array, k = 5): RouteResult[] {
    if (!(embedding instanceof Float32Array) || embedding.length !== this.dimension) {
      throw new Error(`Embedding must be Float32Array of length ${this.dimension}`);
    }

    const normalizedQuery = this.normalize(embedding);
    const scores: { intent: string; score: number; metadata: Record<string, unknown> }[] = [];

    // Calculate best score for each intent
    for (const [intentName, intent] of this.intents) {
      let bestScore = -Infinity;

      for (const storedEmb of intent.embeddings) {
        const score = this.similarity(normalizedQuery, storedEmb);
        if (score > bestScore) {
          bestScore = score;
        }
      }

      scores.push({
        intent: intentName,
        score: bestScore,
        metadata: intent.metadata,
      });
    }

    // Sort by score descending and take top k
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /**
   * Remove an intent
   */
  removeIntent(name: string): boolean {
    const intent = this.intents.get(name);
    if (!intent) return false;

    this.totalVectors -= intent.embeddings.length;
    this.intents.delete(name);
    return true;
  }

  /**
   * Get all intent names
   */
  getIntents(): string[] {
    return Array.from(this.intents.keys());
  }

  /**
   * Get intent details
   */
  getIntent(name: string): Intent | null {
    const data = this.intents.get(name);
    if (!data) return null;
    return {
      name: data.name,
      utterances: [], // We don't store utterances, only embeddings
      metadata: data.metadata,
    };
  }

  /**
   * Clear all intents
   */
  clear(): void {
    this.intents.clear();
    this.totalVectors = 0;
  }

  /**
   * Get total vector count
   */
  count(): number {
    return this.totalVectors;
  }

  /**
   * Get number of intents
   */
  intentCount(): number {
    return this.intents.size;
  }

  /**
   * Normalize a vector for cosine similarity
   */
  private normalize(vec: Float32Array): Float32Array {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);

    if (norm === 0) return vec;

    const normalized = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      normalized[i] = vec[i] / norm;
    }
    return normalized;
  }

  /**
   * Calculate similarity between two normalized vectors
   */
  private similarity(a: Float32Array, b: Float32Array): number {
    switch (this.metric) {
      case 'cosine':
        // For normalized vectors, cosine similarity = dot product
        return this.dotProduct(a, b);
      case 'dotProduct':
        return this.dotProduct(a, b);
      case 'euclidean':
        // Convert Euclidean distance to similarity
        return 1 / (1 + this.euclideanDistance(a, b));
      default:
        return this.dotProduct(a, b);
    }
  }

  private dotProduct(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}

/**
 * Create a SemanticRouter with the given configuration
 */
export function createSemanticRouter(config: RouterConfig): SemanticRouter {
  return new SemanticRouter(config);
}

export default SemanticRouter;
