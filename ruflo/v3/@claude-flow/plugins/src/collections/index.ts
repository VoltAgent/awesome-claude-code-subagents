/**
 * Plugin Collections
 *
 * Re-exports for the collection management system.
 */

export {
  PluginCollectionManager,
  getDefaultCollectionManager,
  setDefaultCollectionManager,
  type PluginCollection,
  type PluginCollectionEntry,
  type PluginCategory,
  type PluginCapability,
  type CollectionManagerState,
  type CollectionManagerConfig,
  type CollectionStats,
} from './collection-manager.js';

export {
  // Individual plugins
  sessionPlugin,
  memoryCoordinatorPlugin,
  eventBusPlugin,
  coderAgentPlugin,
  testerAgentPlugin,
  reviewerAgentPlugin,
  gitIntegrationPlugin,
  linterPlugin,
  sonaPlugin,
  reasoningBankPlugin,
  patternLearningPlugin,
  hiveMindPlugin,
  maestroPlugin,
  consensusPlugin,
  coordinatorAgentPlugin,
  inputValidationPlugin,
  pathSecurityPlugin,
  auditLogPlugin,
  securityScanPlugin,
  metricsPlugin,
  cachePlugin,

  // Collections
  coreCollection,
  developmentCollection,
  intelligenceCollection,
  swarmCollection,
  securityCollection,
  utilityCollection,
  officialCollections,

  // Helpers
  getAllOfficialPlugins,
  getOfficialCollection,
} from './official/index.js';
