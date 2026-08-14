/**
 * Financial Risk Plugin - Bridges Barrel Export
 *
 * @module @claude-flow/plugin-financial-risk/bridges
 */

export {
  FinancialEconomyBridge,
  createEconomyBridge,
  PortfolioRiskCalculator,
} from './economy-bridge.js';

export {
  FinancialSparseBridge,
  createSparseBridge,
  AnomalyDetector,
  MarketRegimeClassifier,
} from './sparse-bridge.js';
