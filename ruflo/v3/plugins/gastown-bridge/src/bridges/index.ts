/**
 * Gas Town Bridge Layer Exports
 *
 * CLI bridge modules for Gas Town (gt) and Beads (bd) integration.
 * Provides secure command execution with input validation and
 * AgentDB synchronization.
 *
 * @module v3/plugins/gastown-bridge/bridges
 */

// Gas Town CLI Bridge
export {
  GtBridge,
  createGtBridge,
  GtBridgeError,
  // Types
  type GtBridgeConfig,
  type GasEstimate,
  type TxStatus,
  type NetworkStatus,
  type GtResult,
  type GtLogger,
  type GtErrorCode,
  // Schemas
  SafeStringSchema as GtSafeStringSchema,
  IdentifierSchema as GtIdentifierSchema,
  GasPriceSchema,
  GasLimitSchema,
  TxHashSchema,
  AddressSchema,
  NetworkSchema,
  GtArgumentSchema,
} from './gt-bridge.js';

// Beads CLI Bridge
export {
  BdBridge,
  createBdBridge,
  BdBridgeError,
  // Types - renamed to avoid conflicts with existing types
  type Bead as CliBead,
  type BeadType as CliBeadType,
  type BdBridgeConfig,
  type BeadQuery,
  type CreateBeadParams,
  type BdResult,
  type BdStreamResult,
  type BdLogger,
  type BdErrorCode,
  // Schemas - renamed to avoid conflicts
  BeadSchema as CliBeadSchema,
  BeadIdSchema,
  BeadTypeSchema as CliBeadTypeSchema,
  BdArgumentSchema,
} from './bd-bridge.js';

// Sync Bridge
export {
  SyncBridge,
  createSyncBridge,
  SyncBridgeError,
  // Types - renamed to avoid conflicts
  type ConflictStrategy,
  type SyncDirection as CliSyncDirection,
  type SyncStatus,
  type AgentDBEntry,
  type SyncBridgeConfig,
  type SyncResult as CliSyncResult,
  type SyncConflict,
  type SyncState,
  type IAgentDBService,
  type SyncLogger,
  type SyncErrorCode,
  // Schemas - renamed to avoid conflicts
  ConflictStrategySchema,
  SyncDirectionSchema as CliSyncDirectionSchema,
  SyncStatusSchema,
  AgentDBEntrySchema,
} from './sync-bridge.js';
