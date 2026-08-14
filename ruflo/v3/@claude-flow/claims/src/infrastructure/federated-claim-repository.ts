/**
 * Federated claim repository — wraps `InMemoryClaimRepository` and is the
 * federation-aware face of the claim store.
 *
 * Read paths are local-first: the local replica is authoritative for queries.
 * Cross-node lookups are explicit (`findByClaimant(c, { includeRemote: true })`)
 * and currently no-op until the federation peer-query API lands — this
 * adapter is structured to absorb that capability later without breaking
 * callers.
 *
 * Writes delegate to the wrapped repository. Cross-node replication of
 * mutations is the responsibility of `FederatedClaimEventStore`, which
 * pairs with this repository in the application's DI graph (per ADR-101
 * Component B's "single seam" principle in federation-bridge.ts).
 *
 * @module v3/claims/infrastructure/federated-claim-repository
 * @see ADR-101 Component B
 */

import type {
  ClaimId,
  IssueId,
  Claimant,
  ClaimStatus,
  IssueClaim,
  IssueClaimWithStealing,
  AgentType,
} from '../domain/types.js';
import type { IClaimRepository } from '../domain/repositories.js';
import type { IIssueClaimRepository } from '../domain/types.js';
import type { InMemoryClaimRepository } from './claim-repository.js';

/**
 * Options for cross-node-aware queries.
 */
export interface FederatedQueryOptions {
  /**
   * If true, query reaches into the federation to discover claims that
   * exist on remote peers but have not yet replicated locally. Currently
   * a no-op (returns local results only); reserved for the next iteration
   * where peer querying lands.
   */
  includeRemote?: boolean;
}

export interface FederatedClaimRepositoryOptions {
  /** The underlying local repository this wraps. */
  readonly local: InMemoryClaimRepository;
  /** Stable identifier for this federation node (kept for diagnostics). */
  readonly nodeId: string;
}

/**
 * Federation-aware claim repository.
 *
 * Implements the existing `IClaimRepository` and `IIssueClaimRepository`
 * contracts unchanged so existing call sites compose without modification.
 */
export class FederatedClaimRepository
  implements IClaimRepository, IIssueClaimRepository
{
  private readonly local: InMemoryClaimRepository;
  // Kept for future use (peer-aware queries) and for diagnostics.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly nodeId: string;

  constructor(opts: FederatedClaimRepositoryOptions) {
    if (!opts.nodeId) throw new Error('FederatedClaimRepository requires nodeId');
    this.local = opts.local;
    this.nodeId = opts.nodeId;
  }

  initialize(): Promise<void> {
    return this.local.initialize();
  }

  shutdown(): Promise<void> {
    return this.local.shutdown();
  }

  // ===========================================================================
  // Writes — delegate
  // ===========================================================================

  save(claim: IssueClaim | IssueClaimWithStealing): Promise<void> {
    return this.local.save(claim);
  }

  update(claim: IssueClaimWithStealing): Promise<void> {
    return this.local.update(claim);
  }

  delete(claimId: ClaimId): Promise<void> {
    return this.local.delete(claimId);
  }

  // ===========================================================================
  // Reads — local-first, with `includeRemote` opt-in for forward compat
  // ===========================================================================

  findById(claimId: ClaimId): Promise<IssueClaimWithStealing | null> {
    return this.local.findById(claimId);
  }

  findByIssueId(
    issueId: IssueId,
    repository?: string,
  ): Promise<IssueClaimWithStealing | null> {
    return this.local.findByIssueId(issueId, repository);
  }

  /**
   * Find claims by claimant identity (matches IClaimRepository signature).
   * The optional `_opts` parameter is reserved for cross-node fan-out;
   * callers passing `includeRemote: true` today receive local results.
   */
  findByClaimant(
    claimant: Claimant,
    // Reserved; see FederatedQueryOptions docstring.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _opts: FederatedQueryOptions = {},
  ): Promise<IssueClaim[]> {
    return this.local.findByClaimant(claimant);
  }

  findByAgentId(agentId: string): Promise<IssueClaimWithStealing[]> {
    return this.local.findByAgentId(agentId);
  }

  findByStatus(status: ClaimStatus): Promise<IssueClaim[]> {
    return this.local.findByStatus(status);
  }

  findStealable(agentType?: AgentType): Promise<IssueClaimWithStealing[]> {
    return this.local.findStealable(agentType);
  }

  findContested(): Promise<IssueClaimWithStealing[]> {
    return this.local.findContested();
  }

  findAll(): Promise<IssueClaimWithStealing[]> {
    return this.local.findAll();
  }

  // ===========================================================================
  // Counts — match IClaimRepository / IIssueClaimRepository signatures
  // ===========================================================================

  /** IClaimRepository.countByClaimant takes a Claimant; we pass through its id. */
  countByClaimant(claimantId: string): Promise<number> {
    return this.local.countByClaimant(claimantId);
  }

  countByAgentId(agentId: string): Promise<number> {
    return this.local.countByAgentId(agentId);
  }

  // ===========================================================================
  // IClaimRepository extras — delegate
  // ===========================================================================

  findActiveClaims(): Promise<IssueClaim[]> {
    return this.local.findActiveClaims();
  }

  findStaleClaims(staleSince: Date): Promise<IssueClaim[]> {
    return this.local.findStaleClaims(staleSince);
  }

  findClaimsWithPendingHandoffs(): Promise<IssueClaim[]> {
    return this.local.findClaimsWithPendingHandoffs();
  }
}
