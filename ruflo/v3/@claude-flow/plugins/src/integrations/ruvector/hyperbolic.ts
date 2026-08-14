/**
 * RuVector PostgreSQL Bridge - Hyperbolic Embeddings Module
 *
 * Comprehensive hyperbolic geometry support for embedding hierarchical data
 * (taxonomies, org charts, ASTs, dependency graphs) in non-Euclidean spaces.
 *
 * Supports four hyperbolic models:
 * - Poincare Ball Model: Conformal, good for visualization
 * - Lorentz (Hyperboloid) Model: Numerically stable, good for optimization
 * - Klein Model: Straight geodesics, good for convex optimization
 * - Half-Space Model: Upper half-plane, good for theoretical analysis
 *
 * @module @claude-flow/plugins/integrations/ruvector/hyperbolic
 * @version 1.0.0
 */

import type {
  HyperbolicModel,
  HyperbolicEmbedding,
  HyperbolicOperation,
} from './types.js';

// ============================================================================
// Constants and Configuration
// ============================================================================

/**
 * Default numerical stability epsilon
 */
const DEFAULT_EPS = 1e-15;

/**
 * Maximum norm for Poincare ball to maintain stability (must be < 1)
 */
const DEFAULT_MAX_NORM = 1 - 1e-5;

/**
 * Default curvature for hyperbolic space (negative value)
 */
const DEFAULT_CURVATURE = -1.0;


// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Computes the dot product of two vectors.
 */
function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Computes the Euclidean (L2) norm of a vector.
 */
function norm(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

/**
 * Computes the squared norm of a vector.
 */
function normSquared(v: number[]): number {
  return dot(v, v);
}

/**
 * Scales a vector by a scalar.
 */
function scale(v: number[], s: number): number[] {
  return v.map((x) => x * s);
}

/**
 * Adds two vectors.
 */
function add(a: number[], b: number[]): number[] {
  return a.map((x, i) => x + b[i]);
}

/**
 * Subtracts vector b from vector a.
 */
function sub(a: number[], b: number[]): number[] {
  return a.map((x, i) => x - b[i]);
}

/**
 * Clamps a value to a range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Safe arctanh implementation with clamping.
 */
function safeAtanh(x: number, eps: number = DEFAULT_EPS): number {
  const clamped = clamp(x, -1 + eps, 1 - eps);
  return 0.5 * Math.log((1 + clamped) / (1 - clamped));
}

/**
 * Safe arccosh implementation.
 */
function safeAcosh(x: number, eps: number = DEFAULT_EPS): number {
  return Math.acosh(Math.max(1 + eps, x));
}

/**
 * Creates a zero vector of specified dimension.
 */
function zeros(dim: number): number[] {
  return new Array(dim).fill(0);
}

// ============================================================================
// Hyperbolic Space Configuration
// ============================================================================

/**
 * Configuration for a hyperbolic space instance.
 */
export interface HyperbolicSpaceConfig {
  /** Hyperbolic model to use */
  readonly model: HyperbolicModel;
  /** Curvature parameter (negative for hyperbolic space) */
  readonly curvature: number;
  /** Embedding dimension */
  readonly dimension: number;
  /** Numerical stability epsilon */
  readonly eps?: number;
  /** Maximum norm for Poincare ball */
  readonly maxNorm?: number;
  /** Whether curvature is learnable */
  readonly learnCurvature?: boolean;
}

/**
 * Result from a hyperbolic distance computation.
 */
export interface HyperbolicDistanceResult {
  /** Geodesic distance */
  readonly distance: number;
  /** Model used for computation */
  readonly model: HyperbolicModel;
  /** Effective curvature */
  readonly curvature: number;
}

/**
 * Result from a hyperbolic search operation.
 */
export interface HyperbolicSearchResult {
  /** Point ID */
  readonly id: string | number;
  /** Geodesic distance from query */
  readonly distance: number;
  /** Point coordinates in hyperbolic space */
  readonly point: number[];
  /** Original metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Options for batch hyperbolic operations.
 */
export interface HyperbolicBatchOptions {
  /** Points to process */
  readonly points: number[][];
  /** Operation to perform */
  readonly operation: HyperbolicOperation;
  /** Additional operation parameters */
  readonly params?: {
    readonly tangent?: number[];
    readonly base?: number[];
    readonly target?: number[];
    readonly matrix?: number[][];
  };
  /** Process in parallel */
  readonly parallel?: boolean;
  /** Batch size for processing */
  readonly batchSize?: number;
}

/**
 * Result from batch hyperbolic operations.
 */
export interface HyperbolicBatchResult {
  /** Resulting points/values */
  readonly results: number[][];
  /** Operation performed */
  readonly operation: HyperbolicOperation;
  /** Processing time in milliseconds */
  readonly durationMs: number;
  /** Number of points processed */
  readonly count: number;
}

// ============================================================================
// HyperbolicSpace Class
// ============================================================================

/**
 * HyperbolicSpace provides comprehensive operations for hyperbolic geometry.
 *
 * Supports Poincare ball, Lorentz (hyperboloid), Klein disk, and half-space models.
 * All operations are numerically stable and handle edge cases gracefully.
 *
 * @example
 * ```typescript
 * const space = new HyperbolicSpace('poincare', -1.0);
 * const dist = space.distance([0.1, 0.2], [0.3, 0.4]);
 * const mapped = space.expMap([0, 0], [0.1, 0.2]);
 * ```
 */
export class HyperbolicSpace {
  /** Current hyperbolic model */
  readonly model: HyperbolicModel;
  /** Curvature parameter (negative for hyperbolic) */
  private _curvature: number;
  /** Numerical stability epsilon */
  readonly eps: number;
  /** Maximum norm for Poincare ball */
  readonly maxNorm: number;
  /** Scaling factor derived from curvature: sqrt(|c|) */
  private _scale: number;

  /**
   * Creates a new HyperbolicSpace instance.
   *
   * @param model - Hyperbolic model to use
   * @param curvature - Curvature parameter (should be negative, will be negated if positive)
   * @param eps - Numerical stability epsilon
   * @param maxNorm - Maximum norm for Poincare ball
   */
  constructor(
    model: HyperbolicModel,
    curvature: number = DEFAULT_CURVATURE,
    eps: number = DEFAULT_EPS,
    maxNorm: number = DEFAULT_MAX_NORM
  ) {
    this.model = model;
    this._curvature = curvature > 0 ? -curvature : curvature;
    this.eps = eps;
    this.maxNorm = maxNorm;
    this._scale = Math.sqrt(Math.abs(this._curvature));
  }

  /**
   * Gets the current curvature.
   */
  get curvature(): number {
    return this._curvature;
  }

  /**
   * Gets the scaling factor sqrt(|c|).
   */
  get scale(): number {
    return this._scale;
  }

  /**
   * Updates the curvature (for learnable curvature scenarios).
   */
  setCurvature(c: number): void {
    this._curvature = c > 0 ? -c : c;
    this._scale = Math.sqrt(Math.abs(this._curvature));
  }

  // ==========================================================================
  // Distance Calculations
  // ==========================================================================

  /**
   * Computes the geodesic distance between two points in hyperbolic space.
   *
   * The distance formula depends on the model:
   * - Poincare: d(u,v) = (2/sqrt|c|) * arctanh(sqrt|c| * ||(-u) + v||_M)
   * - Lorentz: d(u,v) = (1/sqrt|c|) * arcosh(-c * <u,v>_L)
   * - Klein: Converted to Poincare first
   * - Half-space: d(u,v) = arcosh(1 + ||u-v||^2 / (2*u_n*v_n))
   *
   * @param a - First point
   * @param b - Second point
   * @returns Geodesic distance
   */
  distance(a: number[], b: number[]): number {
    switch (this.model) {
      case 'poincare':
        return this.poincareDistance(a, b);
      case 'lorentz':
        return this.lorentzDistance(a, b);
      case 'klein':
        return this.kleinDistance(a, b);
      case 'half_space':
        return this.halfSpaceDistance(a, b);
      default:
        throw new Error(`Unknown hyperbolic model: ${this.model}`);
    }
  }

  /**
   * Computes distance in the Poincare ball model.
   *
   * Formula: d(u,v) = (2/sqrt|c|) * arctanh(sqrt|c| * ||(-u) +_M v||)
   *
   * Where +_M is Mobius addition.
   */
  private poincareDistance(u: number[], v: number[]): number {
    // Use Mobius addition: -u +_M v
    const negU = scale(u, -1);
    const diff = this.mobiusAdd(negU, v);
    const diffNorm = norm(diff);

    // d = (2/sqrt|c|) * arctanh(sqrt|c| * ||diff||)
    const scaledNorm = this._scale * diffNorm;
    return (2 / this._scale) * safeAtanh(scaledNorm, this.eps);
  }

  /**
   * Computes distance in the Lorentz (hyperboloid) model.
   *
   * Formula: d(u,v) = (1/sqrt|c|) * arcosh(-c * <u,v>_L)
   *
   * Where <u,v>_L is the Lorentz inner product: -u0*v0 + u1*v1 + ... + un*vn
   */
  private lorentzDistance(u: number[], v: number[]): number {
    const lorentzInner = this.lorentzInnerProduct(u, v);
    // -c * <u,v>_L for negative curvature
    const argument = -this._curvature * lorentzInner;
    return safeAcosh(argument, this.eps) / this._scale;
  }

  /**
   * Computes distance in the Klein model.
   * Converts to Poincare first for numerical stability.
   */
  private kleinDistance(u: number[], v: number[]): number {
    const uPoincare = this.kleinToPoincare(u);
    const vPoincare = this.kleinToPoincare(v);
    return this.poincareDistance(uPoincare, vPoincare);
  }

  /**
   * Computes distance in the half-space model.
   *
   * Formula: d(u,v) = arcosh(1 + ||u-v||^2 / (2*u_n*v_n))
   *
   * Where u_n, v_n are the last coordinates (must be positive).
   */
  private halfSpaceDistance(u: number[], v: number[]): number {
    const n = u.length - 1;
    const un = Math.max(u[n], this.eps);
    const vn = Math.max(v[n], this.eps);

    const diffSq = normSquared(sub(u, v));
    const argument = 1 + diffSq / (2 * un * vn);

    return safeAcosh(argument, this.eps) / this._scale;
  }

  /**
   * Computes the Lorentz inner product.
   * <u,v>_L = -u0*v0 + sum(u_i*v_i for i=1..n)
   */
  private lorentzInnerProduct(u: number[], v: number[]): number {
    let result = -u[0] * v[0]; // Time component (negative)
    for (let i = 1; i < u.length; i++) {
      result += u[i] * v[i]; // Spatial components (positive)
    }
    return result;
  }

  // ==========================================================================
  // Exponential and Logarithmic Maps
  // ==========================================================================

  /**
   * Exponential map: Maps a tangent vector at a base point to the manifold.
   *
   * exp_p(v) moves from point p in the direction of tangent vector v.
   *
   * @param base - Base point on the manifold
   * @param tangent - Tangent vector at the base point
   * @returns Point on the manifold
   */
  expMap(base: number[], tangent: number[]): number[] {
    switch (this.model) {
      case 'poincare':
        return this.poincareExpMap(base, tangent);
      case 'lorentz':
        return this.lorentzExpMap(base, tangent);
      case 'klein':
        return this.kleinExpMap(base, tangent);
      case 'half_space':
        return this.halfSpaceExpMap(base, tangent);
      default:
        throw new Error(`Unknown hyperbolic model: ${this.model}`);
    }
  }

  /**
   * Logarithmic map: Maps a point on the manifold to a tangent vector at base.
   *
   * log_p(q) gives the tangent vector at p pointing towards q.
   *
   * @param base - Base point on the manifold
   * @param point - Target point on the manifold
   * @returns Tangent vector at the base point
   */
  logMap(base: number[], point: number[]): number[] {
    switch (this.model) {
      case 'poincare':
        return this.poincareLogMap(base, point);
      case 'lorentz':
        return this.lorentzLogMap(base, point);
      case 'klein':
        return this.kleinLogMap(base, point);
      case 'half_space':
        return this.halfSpaceLogMap(base, point);
      default:
        throw new Error(`Unknown hyperbolic model: ${this.model}`);
    }
  }

  /**
   * Poincare exponential map.
   *
   * exp_p(v) = p +_M (tanh(sqrt|c| * ||v||_p / 2) * v / (sqrt|c| * ||v||_p))
   *
   * Where ||v||_p is the Poincare tangent norm: lambda_p * ||v||
   * And lambda_p = 2 / (1 - |c| * ||p||^2) is the conformal factor.
   */
  private poincareExpMap(base: number[], tangent: number[]): number[] {
    const tangentNorm = norm(tangent);
    if (tangentNorm < this.eps) {
      return [...base];
    }

    // Conformal factor at base
    const baseSq = normSquared(base);
    const lambda = 2 / (1 - Math.abs(this._curvature) * baseSq);

    // Scaled tangent norm
    const vNorm = lambda * tangentNorm;

    // Compute direction and scale
    const t = Math.tanh(this._scale * vNorm / 2);
    const direction = scale(tangent, t / (this._scale * vNorm));

    // Mobius add base + direction
    return this.projectToManifold(this.mobiusAdd(base, direction));
  }

  /**
   * Poincare logarithmic map.
   *
   * log_p(q) = (2 / (sqrt|c| * lambda_p)) * arctanh(sqrt|c| * ||(-p) +_M q||) * ((-p) +_M q) / ||(-p) +_M q||
   */
  private poincareLogMap(base: number[], point: number[]): number[] {
    const negBase = scale(base, -1);
    const diff = this.mobiusAdd(negBase, point);
    const diffNorm = norm(diff);

    if (diffNorm < this.eps) {
      return zeros(base.length);
    }

    // Conformal factor at base
    const baseSq = normSquared(base);
    const lambda = 2 / (1 - Math.abs(this._curvature) * baseSq);

    // Compute coefficient
    const atanh_arg = this._scale * diffNorm;
    const coeff = (2 / (this._scale * lambda)) * safeAtanh(atanh_arg, this.eps);

    // Direction
    return scale(diff, coeff / diffNorm);
  }

  /**
   * Lorentz exponential map.
   *
   * exp_p(v) = cosh(||v||_L) * p + sinh(||v||_L) * v / ||v||_L
   *
   * Where ||v||_L is the Lorentz norm: sqrt(<v,v>_L)
   */
  private lorentzExpMap(base: number[], tangent: number[]): number[] {
    const tangentNormSq = this.lorentzInnerProduct(tangent, tangent);

    if (tangentNormSq < this.eps * this.eps) {
      return [...base];
    }

    const tangentNorm = Math.sqrt(Math.max(0, tangentNormSq));
    const scaledNorm = this._scale * tangentNorm;

    const coshVal = Math.cosh(scaledNorm);
    const sinhVal = Math.sinh(scaledNorm);

    const result = add(
      scale(base, coshVal),
      scale(tangent, sinhVal / tangentNorm)
    );

    return this.projectToManifold(result);
  }

  /**
   * Lorentz logarithmic map.
   *
   * log_p(q) = (arcosh(-<p,q>_L) / sqrt(-<p,q>_L^2 - 1)) * (q + <p,q>_L * p)
   */
  private lorentzLogMap(base: number[], point: number[]): number[] {
    const inner = this.lorentzInnerProduct(base, point);
    const alpha = -inner;

    if (alpha <= 1 + this.eps) {
      return zeros(base.length);
    }

    const sqrtArg = Math.sqrt(alpha * alpha - 1);
    const coeff = safeAcosh(alpha, this.eps) / sqrtArg;

    // v = q + <p,q>_L * p, but we need q - alpha * p for tangent
    const tangent = sub(point, scale(base, alpha));

    return scale(tangent, coeff);
  }

  /**
   * Klein exponential map (via Poincare).
   */
  private kleinExpMap(base: number[], tangent: number[]): number[] {
    const basePoincare = this.kleinToPoincare(base);
    const tangentPoincare = this.kleinTangentToPoincare(base, tangent);
    const resultPoincare = this.poincareExpMap(basePoincare, tangentPoincare);
    return this.poincareToKlein(resultPoincare);
  }

  /**
   * Klein logarithmic map (via Poincare).
   */
  private kleinLogMap(base: number[], point: number[]): number[] {
    const basePoincare = this.kleinToPoincare(base);
    const pointPoincare = this.kleinToPoincare(point);
    const tangentPoincare = this.poincareLogMap(basePoincare, pointPoincare);
    return this.poincareTangentToKlein(base, tangentPoincare);
  }

  /**
   * Half-space exponential map.
   */
  private halfSpaceExpMap(base: number[], tangent: number[]): number[] {
    // For half-space, use the Riemannian metric g = (1/x_n^2) * I
    const n = base.length - 1;
    const xn = Math.max(base[n], this.eps);

    // Scale tangent by conformal factor
    const scaledTangent = scale(tangent, xn);
    const tangentNorm = norm(scaledTangent);

    if (tangentNorm < this.eps) {
      return [...base];
    }

    // Geodesic in half-space model
    const t = tangentNorm * this._scale;
    const direction = scale(scaledTangent, 1 / tangentNorm);

    const result = add(base, scale(direction, Math.sinh(t) * xn / this._scale));
    result[n] = xn * Math.cosh(t);

    return this.projectToManifold(result);
  }

  /**
   * Half-space logarithmic map.
   */
  private halfSpaceLogMap(base: number[], point: number[]): number[] {
    const n = base.length - 1;
    const xn = Math.max(base[n], this.eps);
    const yn = Math.max(point[n], this.eps);

    const diff = sub(point, base);
    const diffSq = normSquared(diff);

    const argument = 1 + diffSq / (2 * xn * yn);
    const dist = safeAcosh(argument, this.eps);

    if (dist < this.eps) {
      return zeros(base.length);
    }

    // Compute initial tangent direction
    const direction = scale(diff, 1 / Math.sqrt(diffSq + this.eps));
    return scale(direction, dist * xn / this._scale);
  }

  // ==========================================================================
  // Mobius Operations (Poincare Ball)
  // ==========================================================================

  /**
   * Mobius addition in the Poincare ball.
   *
   * a +_M b = ((1 + 2c<a,b> + c||b||^2)a + (1 - c||a||^2)b) / (1 + 2c<a,b> + c^2||a||^2||b||^2)
   *
   * @param a - First point
   * @param b - Second point
   * @returns Mobius sum
   */
  mobiusAdd(a: number[], b: number[]): number[] {
    const c = Math.abs(this._curvature);
    const aSq = normSquared(a);
    const bSq = normSquared(b);
    const ab = dot(a, b);

    const numerator1 = 1 + 2 * c * ab + c * bSq;
    const numerator2 = 1 - c * aSq;
    const denominator = 1 + 2 * c * ab + c * c * aSq * bSq;

    const safeD = Math.max(denominator, this.eps);
    const result = add(
      scale(a, numerator1 / safeD),
      scale(b, numerator2 / safeD)
    );

    return this.projectToManifold(result);
  }

  /**
   * Mobius matrix-vector multiplication.
   *
   * M otimes_M v = tanh(||Mv|| / ||v|| * arctanh(||v||)) * Mv / ||Mv||
   *
   * This applies a matrix transformation in hyperbolic space.
   *
   * @param matrix - Transformation matrix
   * @param vec - Vector in Poincare ball
   * @returns Transformed vector
   */
  mobiusMatVec(matrix: number[][], vec: number[]): number[] {
    // First, compute Mv in Euclidean space
    const mv: number[] = [];
    for (let i = 0; i < matrix.length; i++) {
      let sum = 0;
      for (let j = 0; j < vec.length; j++) {
        sum += matrix[i][j] * vec[j];
      }
      mv.push(sum);
    }

    const mvNorm = norm(mv);
    const vNorm = norm(vec);

    if (vNorm < this.eps || mvNorm < this.eps) {
      return this.projectToManifold(mv);
    }

    // Apply hyperbolic scaling
    const scaledVNorm = this._scale * vNorm;
    const atanhV = safeAtanh(scaledVNorm, this.eps);
    const scaleFactor = Math.tanh(mvNorm / vNorm * atanhV) / (this._scale * mvNorm);

    return this.projectToManifold(scale(mv, scaleFactor));
  }

  /**
   * Mobius scalar multiplication.
   *
   * r *_M x = tanh(r * arctanh(sqrt|c| * ||x||)) * x / (sqrt|c| * ||x||)
   *
   * @param r - Scalar multiplier
   * @param x - Point in Poincare ball
   * @returns Scaled point
   */
  mobiusScalarMul(r: number, x: number[]): number[] {
    const xNorm = norm(x);
    if (xNorm < this.eps) {
      return zeros(x.length);
    }

    const scaledNorm = this._scale * xNorm;
    const atanhX = safeAtanh(scaledNorm, this.eps);
    const newNorm = Math.tanh(r * atanhX) / this._scale;

    return this.projectToManifold(scale(x, newNorm / xNorm));
  }

  // ==========================================================================
  // Projection Operations
  // ==========================================================================

  /**
   * Projects a point onto the hyperbolic manifold.
   *
   * For Poincare: Ensures ||x|| < maxNorm
   * For Lorentz: Ensures x is on the hyperboloid
   * For Klein: Ensures ||x|| < 1
   * For Half-space: Ensures last coordinate > eps
   *
   * @param point - Point to project
   * @returns Point on the manifold
   */
  projectToManifold(point: number[]): number[] {
    switch (this.model) {
      case 'poincare':
        return this.projectToPoincare(point);
      case 'lorentz':
        return this.projectToLorentz(point);
      case 'klein':
        return this.projectToKlein(point);
      case 'half_space':
        return this.projectToHalfSpace(point);
      default:
        throw new Error(`Unknown hyperbolic model: ${this.model}`);
    }
  }

  /**
   * Projects onto the Poincare ball (||x|| < maxNorm).
   */
  private projectToPoincare(point: number[]): number[] {
    const n = norm(point);
    if (n >= this.maxNorm) {
      return scale(point, (this.maxNorm - this.eps) / n);
    }
    return point;
  }

  /**
   * Projects onto the Lorentz hyperboloid.
   * Ensures <x,x>_L = -1/c
   */
  private projectToLorentz(point: number[]): number[] {
    // Compute spatial norm
    let spatialSq = 0;
    for (let i = 1; i < point.length; i++) {
      spatialSq += point[i] * point[i];
    }

    // Time component: x0 = sqrt(1/|c| + spatial^2)
    const x0 = Math.sqrt(1 / Math.abs(this._curvature) + spatialSq);

    const result = [...point];
    result[0] = x0;
    return result;
  }

  /**
   * Projects onto the Klein disk (||x|| < 1).
   */
  private projectToKlein(point: number[]): number[] {
    const n = norm(point);
    if (n >= 1 - this.eps) {
      return scale(point, (1 - 2 * this.eps) / n);
    }
    return point;
  }

  /**
   * Projects onto the half-space (last coordinate > eps).
   */
  private projectToHalfSpace(point: number[]): number[] {
    const result = [...point];
    const lastIdx = point.length - 1;
    result[lastIdx] = Math.max(result[lastIdx], this.eps);
    return result;
  }

  /**
   * Projects a vector onto the tangent space at a given base point.
   *
   * @param base - Base point on the manifold
   * @param vec - Vector to project
   * @returns Vector in the tangent space
   */
  projectToTangent(base: number[], vec: number[]): number[] {
    switch (this.model) {
      case 'poincare':
        // In Poincare ball, tangent space is R^n (no projection needed for vectors)
        return vec;
      case 'lorentz':
        return this.projectToLorentzTangent(base, vec);
      case 'klein':
        return vec;
      case 'half_space':
        return vec;
      default:
        throw new Error(`Unknown hyperbolic model: ${this.model}`);
    }
  }

  /**
   * Projects onto the Lorentz tangent space.
   * Tangent vectors must satisfy <p, v>_L = 0.
   */
  private projectToLorentzTangent(base: number[], vec: number[]): number[] {
    const inner = this.lorentzInnerProduct(base, vec);
    const baseInner = this.lorentzInnerProduct(base, base);
    const coeff = inner / Math.min(baseInner, -this.eps);

    return sub(vec, scale(base, coeff));
  }

  // ==========================================================================
  // Model Conversions
  // ==========================================================================

  /**
   * Converts a point from Poincare ball to Lorentz hyperboloid.
   *
   * Lorentz: (x0, x1, ..., xn) where x0 is the time component
   * x0 = (1 + |c| * ||p||^2) / (1 - |c| * ||p||^2)
   * xi = 2 * sqrt|c| * pi / (1 - |c| * ||p||^2)
   *
   * @param poincare - Point in Poincare ball
   * @returns Point on Lorentz hyperboloid
   */
  toLorentz(poincare: number[]): number[] {
    const c = Math.abs(this._curvature);
    const pSq = normSquared(poincare);
    const denom = Math.max(1 - c * pSq, this.eps);

    const x0 = (1 + c * pSq) / denom;
    const lorentz = [x0];

    for (let i = 0; i < poincare.length; i++) {
      lorentz.push((2 * this._scale * poincare[i]) / denom);
    }

    return lorentz;
  }

  /**
   * Converts a point from Lorentz hyperboloid to Poincare ball.
   *
   * pi = xi / (sqrt|c| * (x0 + 1))
   *
   * @param lorentz - Point on Lorentz hyperboloid
   * @returns Point in Poincare ball
   */
  toPoincare(lorentz: number[]): number[] {
    const denom = this._scale * (lorentz[0] + 1);
    const poincare: number[] = [];

    for (let i = 1; i < lorentz.length; i++) {
      poincare.push(lorentz[i] / Math.max(denom, this.eps));
    }

    return this.projectToPoincare(poincare);
  }

  /**
   * Converts a point from Klein disk to Poincare ball.
   *
   * pi = ki / (1 + sqrt(1 - |c| * ||k||^2))
   *
   * @param klein - Point in Klein disk
   * @returns Point in Poincare ball
   */
  kleinToPoincare(klein: number[]): number[] {
    const c = Math.abs(this._curvature);
    const kSq = normSquared(klein);
    const sqrtArg = Math.sqrt(Math.max(1 - c * kSq, this.eps));
    const denom = 1 + sqrtArg;

    return this.projectToPoincare(scale(klein, 1 / denom));
  }

  /**
   * Converts a point from Poincare ball to Klein disk.
   *
   * ki = 2 * pi / (1 + |c| * ||p||^2)
   *
   * @param poincare - Point in Poincare ball
   * @returns Point in Klein disk
   */
  poincareToKlein(poincare: number[]): number[] {
    const c = Math.abs(this._curvature);
    const pSq = normSquared(poincare);
    const factor = 2 / (1 + c * pSq);

    return this.projectToKlein(scale(poincare, factor));
  }

  /**
   * Converts a tangent vector from Klein to Poincare.
   */
  private kleinTangentToPoincare(kleinBase: number[], kleinTangent: number[]): number[] {
    const c = Math.abs(this._curvature);
    const kSq = normSquared(kleinBase);
    const sqrtArg = Math.sqrt(Math.max(1 - c * kSq, this.eps));
    const factor = sqrtArg / (1 + sqrtArg);

    return scale(kleinTangent, factor);
  }

  /**
   * Converts a tangent vector from Poincare to Klein.
   */
  private poincareTangentToKlein(kleinBase: number[], poincareTangent: number[]): number[] {
    const c = Math.abs(this._curvature);
    const kSq = normSquared(kleinBase);
    const sqrtArg = Math.sqrt(Math.max(1 - c * kSq, this.eps));
    const factor = (1 + sqrtArg) / sqrtArg;

    return scale(poincareTangent, factor);
  }

  /**
   * Converts a point from Poincare ball to half-space model.
   *
   * @param poincare - Point in Poincare ball
   * @returns Point in half-space model
   */
  poincareToHalfSpace(poincare: number[]): number[] {
    const c = Math.abs(this._curvature);
    const n = poincare.length;
    const pSq = normSquared(poincare);
    const pn = poincare[n - 1];

    const denom = pSq + 2 * pn / this._scale + 1 / c;
    const safeDenom = Math.max(Math.abs(denom), this.eps) * Math.sign(denom || 1);

    const result: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      result.push(poincare[i] / safeDenom);
    }
    result.push((1 - c * pSq) / (2 * this._scale * safeDenom));

    return this.projectToHalfSpace(result);
  }

  /**
   * Converts a point from half-space model to Poincare ball.
   *
   * @param halfSpace - Point in half-space model
   * @returns Point in Poincare ball
   */
  halfSpaceToPoincare(halfSpace: number[]): number[] {
    const n = halfSpace.length;
    const xn = Math.max(halfSpace[n - 1], this.eps);

    let xSq = 0;
    for (let i = 0; i < n - 1; i++) {
      xSq += halfSpace[i] * halfSpace[i];
    }

    const denom = xSq + (xn + 1 / this._scale) * (xn + 1 / this._scale);
    const safeDenom = Math.max(denom, this.eps);

    const result: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      result.push((2 * halfSpace[i]) / safeDenom);
    }
    result.push((xSq + xn * xn - 1 / Math.abs(this._curvature)) / safeDenom);

    return this.projectToPoincare(result);
  }

  // ==========================================================================
  // Additional Operations
  // ==========================================================================

  /**
   * Computes the geodesic midpoint of two points.
   *
   * @param a - First point
   * @param b - Second point
   * @returns Midpoint on the geodesic
   */
  midpoint(a: number[], b: number[]): number[] {
    // Use exponential map from a with half the tangent to b
    const tangent = this.logMap(a, b);
    const halfTangent = scale(tangent, 0.5);
    return this.expMap(a, halfTangent);
  }

  /**
   * Computes the Frechet mean (centroid) of multiple points.
   *
   * Uses iterative gradient descent on the sum of squared distances.
   *
   * @param points - Array of points
   * @param maxIter - Maximum iterations
   * @param tol - Convergence tolerance
   * @returns Frechet mean
   */
  centroid(points: number[][], maxIter: number = 100, tol: number = 1e-8): number[] {
    if (points.length === 0) {
      throw new Error('Cannot compute centroid of empty set');
    }
    if (points.length === 1) {
      return [...points[0]];
    }

    // Initialize with Euclidean mean, projected onto manifold
    let mean = zeros(points[0].length);
    for (const p of points) {
      mean = add(mean, p);
    }
    mean = this.projectToManifold(scale(mean, 1 / points.length));

    // Iterative refinement
    for (let iter = 0; iter < maxIter; iter++) {
      // Compute sum of log maps
      let gradSum = zeros(points[0].length);
      for (const p of points) {
        const logP = this.logMap(mean, p);
        gradSum = add(gradSum, logP);
      }

      // Average gradient
      const avgGrad = scale(gradSum, 1 / points.length);
      const gradNorm = norm(avgGrad);

      if (gradNorm < tol) {
        break;
      }

      // Move mean in the direction of gradient
      mean = this.expMap(mean, avgGrad);
    }

    return mean;
  }

  /**
   * Parallel transports a tangent vector along a geodesic.
   *
   * @param vector - Tangent vector to transport
   * @param start - Starting point
   * @param end - Ending point
   * @returns Transported vector at the end point
   */
  parallelTransport(vector: number[], start: number[], end: number[]): number[] {
    switch (this.model) {
      case 'poincare':
        return this.poincareParallelTransport(vector, start, end);
      case 'lorentz':
        return this.lorentzParallelTransport(vector, start, end);
      default:
        // For Klein and half-space, convert via Poincare
        return this.poincareParallelTransport(vector, start, end);
    }
  }

  /**
   * Parallel transport in Poincare ball.
   */
  private poincareParallelTransport(vector: number[], start: number[], end: number[]): number[] {
    const c = Math.abs(this._curvature);

    // Compute conformal factors
    const startSq = normSquared(start);
    const endSq = normSquared(end);
    const lambdaStart = 2 / (1 - c * startSq);
    const lambdaEnd = 2 / (1 - c * endSq);

    // Gyration-based transport
    const negStart = scale(start, -1);
    const transported = this.mobiusAdd(end, this.mobiusAdd(negStart, scale(vector, 1)));

    // Scale by ratio of conformal factors
    const scaleFactor = lambdaStart / lambdaEnd;
    return scale(sub(transported, end), scaleFactor);
  }

  /**
   * Parallel transport in Lorentz model.
   */
  private lorentzParallelTransport(vector: number[], start: number[], end: number[]): number[] {
    const logV = this.logMap(start, end);
    const logNorm = Math.sqrt(Math.max(0, this.lorentzInnerProduct(logV, logV)));

    if (logNorm < this.eps) {
      return [...vector];
    }

    const inner1 = this.lorentzInnerProduct(end, vector);
    const inner2 = this.lorentzInnerProduct(start, vector);
    // Note: inner3 = this.lorentzInnerProduct(start, end) is used implicitly in the formula
    // via the geodesic distance relationship

    const coeff = (inner1 - inner2 * Math.cosh(this._scale * logNorm)) /
                  Math.sinh(this._scale * logNorm) / logNorm;

    return add(vector, scale(add(start, scale(end, -1)), coeff));
  }

  /**
   * Computes a point along the geodesic from a to b at parameter t.
   *
   * @param a - Starting point
   * @param b - Ending point
   * @param t - Parameter in [0, 1]
   * @returns Point on geodesic
   */
  geodesic(a: number[], b: number[], t: number): number[] {
    const tangent = this.logMap(a, b);
    const scaledTangent = scale(tangent, t);
    return this.expMap(a, scaledTangent);
  }

  /**
   * Computes the conformal factor (lambda) at a point in Poincare ball.
   *
   * lambda_p = 2 / (1 - |c| * ||p||^2)
   *
   * @param point - Point in Poincare ball
   * @returns Conformal factor
   */
  conformalFactor(point: number[]): number {
    if (this.model !== 'poincare') {
      throw new Error('Conformal factor is only defined for Poincare ball model');
    }
    const c = Math.abs(this._curvature);
    const pSq = normSquared(point);
    return 2 / Math.max(1 - c * pSq, this.eps);
  }
}

// ============================================================================
// SQL Generation for RuVector PostgreSQL Functions
// ============================================================================

/**
 * SQL function call builder for RuVector hyperbolic operations.
 */
export class HyperbolicSQL {
  /**
   * Generates SQL for Poincare distance computation.
   *
   * @param column - Vector column name
   * @param query - Query vector
   * @param curvature - Curvature parameter
   * @returns SQL expression
   */
  static poincareDistance(column: string, query: number[], curvature: number): string {
    const vectorStr = `'[${query.join(',')}]'::vector`;
    return `ruvector_poincare_distance(${column}, ${vectorStr}, ${curvature})`;
  }

  /**
   * Generates SQL for Lorentz distance computation.
   *
   * @param column - Vector column name
   * @param query - Query vector (with time component first)
   * @param curvature - Curvature parameter
   * @returns SQL expression
   */
  static lorentzDistance(column: string, query: number[], curvature: number): string {
    const vectorStr = `'[${query.join(',')}]'::vector`;
    return `ruvector_lorentz_distance(${column}, ${vectorStr}, ${curvature})`;
  }

  /**
   * Generates SQL for exponential map.
   *
   * @param baseColumn - Base point column
   * @param tangentColumn - Tangent vector column
   * @param model - Hyperbolic model
   * @param curvature - Curvature parameter
   * @returns SQL expression
   */
  static expMap(
    baseColumn: string,
    tangentColumn: string,
    model: HyperbolicModel,
    curvature: number
  ): string {
    const funcName = model === 'lorentz' ? 'ruvector_lorentz_exp_map' : 'ruvector_poincare_exp_map';
    return `${funcName}(${baseColumn}, ${tangentColumn}, ${curvature})`;
  }

  /**
   * Generates SQL for logarithmic map.
   *
   * @param baseColumn - Base point column
   * @param targetColumn - Target point column
   * @param model - Hyperbolic model
   * @param curvature - Curvature parameter
   * @returns SQL expression
   */
  static logMap(
    baseColumn: string,
    targetColumn: string,
    model: HyperbolicModel,
    curvature: number
  ): string {
    const funcName = model === 'lorentz' ? 'ruvector_lorentz_log_map' : 'ruvector_poincare_log_map';
    return `${funcName}(${baseColumn}, ${targetColumn}, ${curvature})`;
  }

  /**
   * Generates SQL for Mobius addition.
   *
   * @param aColumn - First point column
   * @param bColumn - Second point column
   * @param curvature - Curvature parameter
   * @returns SQL expression
   */
  static mobiusAdd(aColumn: string, bColumn: string, curvature: number): string {
    return `ruvector_poincare_mobius_add(${aColumn}, ${bColumn}, ${curvature})`;
  }

  /**
   * Generates SQL for Mobius matrix-vector multiplication.
   *
   * @param matrixColumn - Matrix column
   * @param vectorColumn - Vector column
   * @param curvature - Curvature parameter
   * @returns SQL expression
   */
  static mobiusMatVec(matrixColumn: string, vectorColumn: string, curvature: number): string {
    return `ruvector_poincare_mobius_matvec(${matrixColumn}, ${vectorColumn}, ${curvature})`;
  }

  /**
   * Generates SQL for parallel transport.
   *
   * @param vectorColumn - Vector to transport
   * @param startColumn - Starting point
   * @param endColumn - Ending point
   * @param model - Hyperbolic model
   * @param curvature - Curvature parameter
   * @returns SQL expression
   */
  static parallelTransport(
    vectorColumn: string,
    startColumn: string,
    endColumn: string,
    model: HyperbolicModel,
    curvature: number
  ): string {
    const funcName = model === 'lorentz'
      ? 'ruvector_lorentz_parallel_transport'
      : 'ruvector_poincare_parallel_transport';
    return `${funcName}(${vectorColumn}, ${startColumn}, ${endColumn}, ${curvature})`;
  }

  /**
   * Generates SQL for computing hyperbolic centroid.
   *
   * @param column - Vector column name
   * @param model - Hyperbolic model
   * @param curvature - Curvature parameter
   * @returns SQL expression (aggregate function)
   */
  static centroid(column: string, model: HyperbolicModel, curvature: number): string {
    const funcName = model === 'lorentz'
      ? 'ruvector_lorentz_centroid'
      : 'ruvector_poincare_centroid';
    return `${funcName}(${column}, ${curvature})`;
  }

  /**
   * Generates SQL for model conversion (Poincare to Lorentz).
   *
   * @param column - Vector column
   * @param curvature - Curvature parameter
   * @returns SQL expression
   */
  static poincareToLorentz(column: string, curvature: number): string {
    return `ruvector_poincare_to_lorentz(${column}, ${curvature})`;
  }

  /**
   * Generates SQL for model conversion (Lorentz to Poincare).
   *
   * @param column - Vector column
   * @param curvature - Curvature parameter
   * @returns SQL expression
   */
  static lorentzToPoincare(column: string, curvature: number): string {
    return `ruvector_lorentz_to_poincare(${column}, ${curvature})`;
  }

  /**
   * Generates SQL for hyperbolic nearest neighbor search.
   *
   * @param tableName - Table name
   * @param vectorColumn - Vector column name
   * @param query - Query vector
   * @param k - Number of neighbors
   * @param model - Hyperbolic model
   * @param curvature - Curvature parameter
   * @param whereClause - Optional WHERE clause
   * @returns Complete SQL query
   */
  static nearestNeighbors(
    tableName: string,
    vectorColumn: string,
    query: number[],
    k: number,
    model: HyperbolicModel,
    curvature: number,
    whereClause?: string
  ): string {
    const distFunc = model === 'lorentz'
      ? this.lorentzDistance(vectorColumn, query, curvature)
      : this.poincareDistance(vectorColumn, query, curvature);

    const where = whereClause ? `WHERE ${whereClause}` : '';

    return `
      SELECT *, ${distFunc} AS hyperbolic_distance
      FROM ${tableName}
      ${where}
      ORDER BY hyperbolic_distance ASC
      LIMIT ${k}
    `.trim();
  }

  /**
   * Generates SQL for creating a hyperbolic embedding column.
   *
   * @param tableName - Table name
   * @param columnName - New column name
   * @param dimension - Vector dimension
   * @param model - Hyperbolic model
   * @returns SQL statement
   */
  static createColumn(
    tableName: string,
    columnName: string,
    dimension: number,
    model: HyperbolicModel
  ): string {
    const comment = `Hyperbolic embedding (${model} model, dim=${dimension})`;
    return `
      ALTER TABLE ${tableName}
      ADD COLUMN IF NOT EXISTS ${columnName} vector(${dimension});

      COMMENT ON COLUMN ${tableName}.${columnName} IS '${comment}';
    `.trim();
  }

  /**
   * Generates SQL for batch hyperbolic distance computation.
   *
   * @param tableName - Table name
   * @param vectorColumn - Vector column name
   * @param queries - Array of query vectors
   * @param k - Number of neighbors per query
   * @param model - Hyperbolic model
   * @param curvature - Curvature parameter
   * @returns SQL query using LATERAL join
   */
  static batchNearestNeighbors(
    tableName: string,
    vectorColumn: string,
    queries: number[][],
    k: number,
    model: HyperbolicModel,
    curvature: number
  ): string {
    const queryValues = queries
      .map((q, i) => `(${i}, '[${q.join(',')}]'::vector)`)
      .join(',\n      ');

    const distFunc = model === 'lorentz'
      ? `ruvector_lorentz_distance(t.${vectorColumn}, q.query_vec, ${curvature})`
      : `ruvector_poincare_distance(t.${vectorColumn}, q.query_vec, ${curvature})`;

    return `
      WITH queries(query_id, query_vec) AS (
        VALUES
          ${queryValues}
      )
      SELECT
        q.query_id,
        results.*
      FROM queries q
      CROSS JOIN LATERAL (
        SELECT
          t.*,
          ${distFunc} AS hyperbolic_distance
        FROM ${tableName} t
        ORDER BY ${distFunc} ASC
        LIMIT ${k}
      ) results
      ORDER BY q.query_id, results.hyperbolic_distance ASC
    `.trim();
  }
}

// ============================================================================
// Batch Operations for Embeddings
// ============================================================================

/**
 * HyperbolicBatchProcessor handles batch operations on hyperbolic embeddings.
 */
export class HyperbolicBatchProcessor {
  private readonly space: HyperbolicSpace;

  constructor(model: HyperbolicModel, curvature: number = DEFAULT_CURVATURE) {
    this.space = new HyperbolicSpace(model, curvature);
  }

  /**
   * Computes distances from a query point to multiple target points.
   *
   * @param query - Query point
   * @param targets - Array of target points
   * @returns Array of distances
   */
  batchDistance(query: number[], targets: number[][]): number[] {
    return targets.map((target) => this.space.distance(query, target));
  }

  /**
   * Applies exponential map to multiple tangent vectors from a base point.
   *
   * @param base - Base point
   * @param tangents - Array of tangent vectors
   * @returns Array of resulting points
   */
  batchExpMap(base: number[], tangents: number[][]): number[][] {
    return tangents.map((tangent) => this.space.expMap(base, tangent));
  }

  /**
   * Applies logarithmic map from a base point to multiple target points.
   *
   * @param base - Base point
   * @param targets - Array of target points
   * @returns Array of tangent vectors
   */
  batchLogMap(base: number[], targets: number[][]): number[][] {
    return targets.map((target) => this.space.logMap(base, target));
  }

  /**
   * Projects multiple points onto the manifold.
   *
   * @param points - Array of points to project
   * @returns Array of projected points
   */
  batchProject(points: number[][]): number[][] {
    return points.map((point) => this.space.projectToManifold(point));
  }

  /**
   * Converts multiple points between models.
   *
   * @param points - Array of points
   * @param fromModel - Source model
   * @param toModel - Target model
   * @returns Array of converted points
   */
  batchConvert(
    points: number[][],
    fromModel: HyperbolicModel,
    toModel: HyperbolicModel
  ): number[][] {
    if (fromModel === toModel) {
      return points.map((p) => [...p]);
    }

    // Handle direct conversions
    if (fromModel === 'poincare' && toModel === 'lorentz') {
      return points.map((p) => this.space.toLorentz(p));
    }
    if (fromModel === 'lorentz' && toModel === 'poincare') {
      return points.map((p) => this.space.toPoincare(p));
    }

    // For other conversions, go through Poincare as intermediate
    let intermediate = points;

    // First convert to Poincare
    if (fromModel === 'lorentz') {
      intermediate = points.map((p) => this.space.toPoincare(p));
    } else if (fromModel === 'klein') {
      intermediate = points.map((p) => this.space.kleinToPoincare(p));
    } else if (fromModel === 'half_space') {
      intermediate = points.map((p) => this.space.halfSpaceToPoincare(p));
    }

    // Then convert from Poincare to target
    if (toModel === 'lorentz') {
      return intermediate.map((p) => this.space.toLorentz(p));
    } else if (toModel === 'klein') {
      return intermediate.map((p) => this.space.poincareToKlein(p));
    } else if (toModel === 'half_space') {
      return intermediate.map((p) => this.space.poincareToHalfSpace(p));
    }

    return intermediate;
  }

  /**
   * Performs k-nearest neighbor search in hyperbolic space.
   *
   * @param query - Query point
   * @param points - Array of candidate points with IDs
   * @param k - Number of neighbors
   * @returns K nearest neighbors sorted by distance
   */
  knnSearch(
    query: number[],
    points: Array<{ id: string | number; point: number[]; metadata?: Record<string, unknown> }>,
    k: number
  ): HyperbolicSearchResult[] {
    // Compute all distances
    const withDistances = points.map((p) => ({
      id: p.id,
      distance: this.space.distance(query, p.point),
      point: p.point,
      metadata: p.metadata,
    }));

    // Sort by distance and take top k
    withDistances.sort((a, b) => a.distance - b.distance);
    return withDistances.slice(0, k);
  }

  /**
   * Computes the centroid of a set of points.
   *
   * @param points - Array of points
   * @param maxIter - Maximum iterations for iterative refinement
   * @returns Centroid point
   */
  computeCentroid(points: number[][], maxIter: number = 100): number[] {
    return this.space.centroid(points, maxIter);
  }

  /**
   * Interpolates along geodesics between pairs of points.
   *
   * @param pairs - Array of [start, end] point pairs
   * @param t - Interpolation parameter (0 = start, 1 = end)
   * @returns Array of interpolated points
   */
  batchGeodesic(pairs: [number[], number[]][], t: number): number[][] {
    return pairs.map(([a, b]) => this.space.geodesic(a, b, t));
  }

  /**
   * Performs Mobius addition on pairs of points.
   *
   * @param pairs - Array of [a, b] point pairs
   * @returns Array of Mobius sums
   */
  batchMobiusAdd(pairs: [number[], number[]][]): number[][] {
    return pairs.map(([a, b]) => this.space.mobiusAdd(a, b));
  }
}

// ============================================================================
// Use Case Implementations
// ============================================================================

/**
 * HierarchyEmbedder embeds tree-structured data in hyperbolic space.
 *
 * Useful for:
 * - Taxonomies (biological, product categories)
 * - Organizational charts
 * - File system hierarchies
 * - Knowledge graphs with hierarchical relations
 */
export class HierarchyEmbedder {
  private readonly space: HyperbolicSpace;
  private readonly dimension: number;

  constructor(
    dimension: number,
    model: HyperbolicModel = 'poincare',
    curvature: number = DEFAULT_CURVATURE
  ) {
    this.dimension = dimension;
    this.space = new HyperbolicSpace(model, curvature);
  }

  /**
   * Embeds a tree structure into hyperbolic space.
   *
   * Root is placed at the origin, children are placed along geodesics.
   *
   * @param tree - Tree structure with id, children, and optional data
   * @param angularSpread - Angular spread for children (default: 2*PI)
   * @returns Map of node IDs to embeddings
   */
  embedTree<T extends { id: string; children?: T[]; data?: unknown }>(
    tree: T,
    angularSpread: number = 2 * Math.PI
  ): Map<string, number[]> {
    const embeddings = new Map<string, number[]>();
    this.embedNode(tree, zeros(this.dimension), 0, angularSpread, embeddings);
    return embeddings;
  }

  private embedNode<T extends { id: string; children?: T[]; data?: unknown }>(
    node: T,
    position: number[],
    depth: number,
    angularSpread: number,
    embeddings: Map<string, number[]>
  ): void {
    embeddings.set(node.id, position);

    if (!node.children || node.children.length === 0) {
      return;
    }

    const numChildren = node.children.length;
    const angleStep = angularSpread / numChildren;
    const startAngle = -angularSpread / 2 + angleStep / 2;

    // Distance to children decreases with depth to fit more nodes
    const childDistance = 0.5 / (depth + 1);

    for (let i = 0; i < numChildren; i++) {
      const angle = startAngle + i * angleStep;

      // Create tangent vector in the direction of the angle
      const tangent = zeros(this.dimension);
      tangent[0] = childDistance * Math.cos(angle);
      if (this.dimension > 1) {
        tangent[1] = childDistance * Math.sin(angle);
      }

      // Map to child position using exponential map
      const childPos = this.space.expMap(position, tangent);

      // Recursively embed children with reduced angular spread
      this.embedNode(
        node.children[i],
        childPos,
        depth + 1,
        angularSpread / numChildren,
        embeddings
      );
    }
  }

  /**
   * Gets the hyperbolic space instance for additional operations.
   */
  getSpace(): HyperbolicSpace {
    return this.space;
  }
}

/**
 * Recursive tree node interface for embedding.
 */
export interface TreeNode {
  id: string;
  children?: TreeNode[];
  data?: unknown;
}

/**
 * ASTEmbedder embeds Abstract Syntax Trees in hyperbolic space.
 *
 * Preserves the hierarchical structure of code, enabling:
 * - Similar code search
 * - Code clone detection
 * - Structural diff operations
 */
export class ASTEmbedder extends HierarchyEmbedder {
  /**
   * Embeds an AST node structure.
   *
   * @param ast - AST with type, children, and optional metadata
   * @returns Map of node paths to embeddings
   */
  embedAST(ast: ASTNode): Map<string, number[]> {
    const treeNode = this.astToTree(ast, '');
    return this.embedTree(treeNode);
  }

  private astToTree(node: ASTNode, path: string): TreeNode {
    const id = path ? `${path}/${node.type}` : node.type;
    const children = node.children?.map((child, i) =>
      this.astToTree(child, `${id}[${i}]`)
    );

    return {
      id,
      children,
      data: {
        type: node.type,
        value: node.value,
        location: node.location,
      },
    };
  }
}

/**
 * AST node structure for embedding.
 */
export interface ASTNode {
  /** Node type (e.g., 'FunctionDeclaration', 'IfStatement') */
  type: string;
  /** Optional value (for literals, identifiers) */
  value?: unknown;
  /** Child nodes */
  children?: ASTNode[];
  /** Source location */
  location?: { start: number; end: number };
}

/**
 * DependencyGraphEmbedder embeds package/module dependency graphs.
 *
 * Captures both direct and transitive dependencies in hyperbolic space.
 */
export class DependencyGraphEmbedder {
  private readonly space: HyperbolicSpace;
  private readonly dimension: number;

  constructor(
    dimension: number,
    model: HyperbolicModel = 'poincare',
    curvature: number = DEFAULT_CURVATURE
  ) {
    this.dimension = dimension;
    this.space = new HyperbolicSpace(model, curvature);
  }

  /**
   * Embeds a dependency graph.
   *
   * @param graph - Map of package names to their dependencies
   * @param root - Optional root package (placed at origin)
   * @returns Map of package names to embeddings
   */
  embedDependencyGraph(
    graph: Map<string, string[]>,
    root?: string
  ): Map<string, number[]> {
    const embeddings = new Map<string, number[]>();

    // Find root nodes (packages with no dependents)
    const roots = this.findRoots(graph);

    if (root && graph.has(root)) {
      // Use specified root
      const processed = new Set<string>();
      this.embedFromRoot(root, zeros(this.dimension), graph, embeddings, processed, 0);
    } else {
      // Embed from all roots
      const angleStep = (2 * Math.PI) / roots.length;
      const processed = new Set<string>();

      roots.forEach((rootNode, i) => {
        const angle = i * angleStep;
        const tangent = zeros(this.dimension);
        tangent[0] = 0.3 * Math.cos(angle);
        if (this.dimension > 1) {
          tangent[1] = 0.3 * Math.sin(angle);
        }

        const rootPos = this.space.expMap(zeros(this.dimension), tangent);
        this.embedFromRoot(rootNode, rootPos, graph, embeddings, processed, 0);
      });
    }

    return embeddings;
  }

  private findRoots(graph: Map<string, string[]>): string[] {
    const dependents = new Set<string>();
    for (const deps of graph.values()) {
      deps.forEach((d) => dependents.add(d));
    }

    return Array.from(graph.keys()).filter((k) => !dependents.has(k));
  }

  private embedFromRoot(
    node: string,
    position: number[],
    graph: Map<string, string[]>,
    embeddings: Map<string, number[]>,
    processed: Set<string>,
    depth: number
  ): void {
    if (processed.has(node)) {
      return;
    }

    processed.add(node);
    embeddings.set(node, position);

    const deps = graph.get(node) || [];
    const numDeps = deps.length;

    if (numDeps === 0) {
      return;
    }

    const angleStep = (2 * Math.PI) / numDeps;
    const depDistance = 0.4 / (depth + 1);

    deps.forEach((dep, i) => {
      if (processed.has(dep)) {
        return;
      }

      const angle = i * angleStep;
      const tangent = zeros(this.dimension);
      tangent[0] = depDistance * Math.cos(angle);
      if (this.dimension > 1) {
        tangent[1] = depDistance * Math.sin(angle);
      }

      const depPos = this.space.expMap(position, tangent);
      this.embedFromRoot(dep, depPos, graph, embeddings, processed, depth + 1);
    });
  }

  /**
   * Computes the dependency distance between two packages.
   *
   * @param a - First package name
   * @param b - Second package name
   * @param embeddings - Pre-computed embeddings
   * @returns Hyperbolic distance
   */
  dependencyDistance(
    a: string,
    b: string,
    embeddings: Map<string, number[]>
  ): number {
    const embA = embeddings.get(a);
    const embB = embeddings.get(b);

    if (!embA || !embB) {
      throw new Error(`Embedding not found for ${!embA ? a : b}`);
    }

    return this.space.distance(embA, embB);
  }

  /**
   * Gets the hyperbolic space instance.
   */
  getSpace(): HyperbolicSpace {
    return this.space;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a HyperbolicSpace instance from configuration.
 *
 * @param config - Hyperbolic space configuration
 * @returns Configured HyperbolicSpace instance
 */
export function createHyperbolicSpace(config: HyperbolicSpaceConfig): HyperbolicSpace {
  return new HyperbolicSpace(
    config.model,
    config.curvature,
    config.eps,
    config.maxNorm
  );
}

/**
 * Creates a HyperbolicSpace instance from HyperbolicEmbedding type.
 *
 * @param embedding - Hyperbolic embedding configuration
 * @returns Configured HyperbolicSpace instance
 */
export function fromEmbeddingConfig(embedding: HyperbolicEmbedding): HyperbolicSpace {
  return new HyperbolicSpace(
    embedding.model,
    embedding.curvature,
    embedding.params?.eps,
    embedding.params?.maxNorm
  );
}

/**
 * Validates that a point is valid for the given hyperbolic model.
 *
 * @param point - Point to validate
 * @param model - Hyperbolic model
 * @param curvature - Curvature parameter
 * @returns True if valid
 */
export function validatePoint(
  point: number[],
  model: HyperbolicModel,
  curvature: number
): boolean {
  const c = Math.abs(curvature);
  const eps = DEFAULT_EPS;

  switch (model) {
    case 'poincare': {
      const n = norm(point);
      return n < 1 - eps;
    }
    case 'lorentz': {
      // Check Lorentz constraint: -x0^2 + sum(xi^2) = -1/c
      let spatialSq = 0;
      for (let i = 1; i < point.length; i++) {
        spatialSq += point[i] * point[i];
      }
      const constraint = -point[0] * point[0] + spatialSq;
      return Math.abs(constraint + 1 / c) < eps * 1000;
    }
    case 'klein': {
      const n = norm(point);
      return n < 1 - eps;
    }
    case 'half_space': {
      return point[point.length - 1] > eps;
    }
    default:
      return false;
  }
}

// ============================================================================
// Re-exports from types
// ============================================================================

export type {
  HyperbolicModel,
  HyperbolicEmbedding,
  HyperbolicInput,
  HyperbolicOutput,
  HyperbolicOperation,
  HyperbolicParams,
  HyperbolicDistance,
} from './types.js';
