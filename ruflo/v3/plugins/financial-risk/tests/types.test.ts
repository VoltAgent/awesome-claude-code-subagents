/**
 * Financial Risk Plugin - Types Tests
 *
 * Tests for Zod schemas and type validation
 */

import { describe, it, expect } from 'vitest';
import {
  PortfolioRiskInputSchema,
  AnomalyDetectInputSchema,
  MarketRegimeInputSchema,
  ComplianceCheckInputSchema,
  StressTestInputSchema,
  successResult,
  errorResult,
  DEFAULT_FINANCIAL_CONFIG,
  FinancialErrorCodes,
  FinancialRolePermissions,
  FinancialRateLimits,
} from '../src/types.js';

describe('Financial Risk Types', () => {
  describe('PortfolioRiskInputSchema', () => {
    it('should validate valid portfolio risk input', () => {
      const validInput = {
        holdings: [
          { symbol: 'AAPL', quantity: 100, assetClass: 'equity' },
          { symbol: 'GOOGL', quantity: 50, sector: 'technology' },
        ],
        riskMetrics: ['var', 'cvar', 'sharpe'],
        confidenceLevel: 0.95,
        horizon: '1d',
      };

      const result = PortfolioRiskInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.holdings).toHaveLength(2);
        expect(result.data.confidenceLevel).toBe(0.95);
      }
    });

    it('should use defaults when not provided', () => {
      const input = {
        holdings: [{ symbol: 'AAPL', quantity: 100 }],
      };

      const result = PortfolioRiskInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidenceLevel).toBe(0.95);
        expect(result.data.horizon).toBe('1d');
      }
    });

    it('should validate stock symbol format', () => {
      const validSymbols = ['AAPL', 'GOOGL', 'BRK.A', 'SPY', 'QQQ'];
      for (const symbol of validSymbols) {
        const input = { holdings: [{ symbol, quantity: 100 }] };
        const result = PortfolioRiskInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid stock symbols', () => {
      const invalidSymbols = ['aapl', 'TOO_LONG_SYMBOL', '123@#$'];
      for (const symbol of invalidSymbols) {
        const input = { holdings: [{ symbol, quantity: 100 }] };
        const result = PortfolioRiskInputSchema.safeParse(input);
        expect(result.success).toBe(false);
      }
    });

    it('should reject empty holdings array', () => {
      const input = { holdings: [] };
      const result = PortfolioRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject confidence level outside range', () => {
      const tooLow = { holdings: [{ symbol: 'AAPL', quantity: 100 }], confidenceLevel: 0.89 };
      const tooHigh = { holdings: [{ symbol: 'AAPL', quantity: 100 }], confidenceLevel: 0.9999 };

      expect(PortfolioRiskInputSchema.safeParse(tooLow).success).toBe(false);
      expect(PortfolioRiskInputSchema.safeParse(tooHigh).success).toBe(false);
    });

    it('should validate all horizon values', () => {
      const horizons = ['1d', '1w', '1m', '3m', '1y'] as const;
      for (const horizon of horizons) {
        const input = { holdings: [{ symbol: 'AAPL', quantity: 100 }], horizon };
        const result = PortfolioRiskInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all risk metric types', () => {
      const metrics = ['var', 'cvar', 'sharpe', 'sortino', 'max_drawdown', 'beta', 'volatility'] as const;
      const input = { holdings: [{ symbol: 'AAPL', quantity: 100 }], riskMetrics: [...metrics] };
      const result = PortfolioRiskInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject too many holdings', () => {
      const holdings = Array(10001).fill({ symbol: 'AAPL', quantity: 100 });
      const input = { holdings };
      const result = PortfolioRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('AnomalyDetectInputSchema', () => {
    it('should validate valid anomaly detection input', () => {
      const validInput = {
        transactions: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            amount: 1000.50,
            timestamp: '2024-01-15T10:30:00Z',
            parties: ['sender123', 'receiver456'],
          },
        ],
        sensitivity: 0.8,
        context: 'fraud',
      };

      const result = AnomalyDetectInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should use defaults when not provided', () => {
      const input = {
        transactions: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            amount: 500,
            timestamp: '2024-01-15T10:30:00Z',
            parties: ['sender'],
          },
        ],
      };

      const result = AnomalyDetectInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sensitivity).toBe(0.8);
        expect(result.data.context).toBe('all');
      }
    });

    it('should reject invalid UUID', () => {
      const input = {
        transactions: [
          {
            id: 'not-a-valid-uuid',
            amount: 500,
            timestamp: '2024-01-15T10:30:00Z',
            parties: ['sender'],
          },
        ],
      };

      const result = AnomalyDetectInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid timestamp format', () => {
      const input = {
        transactions: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            amount: 500,
            timestamp: '2024-01-15', // Missing time
            parties: ['sender'],
          },
        ],
      };

      const result = AnomalyDetectInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate all context types', () => {
      const contexts = ['fraud', 'aml', 'market_manipulation', 'all'] as const;
      for (const context of contexts) {
        const input = {
          transactions: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              amount: 500,
              timestamp: '2024-01-15T10:30:00Z',
              parties: ['sender'],
            },
          ],
          context,
        };
        const result = AnomalyDetectInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject sensitivity outside range', () => {
      const tooLow = {
        transactions: [
          { id: '550e8400-e29b-41d4-a716-446655440000', amount: 500, timestamp: '2024-01-15T10:30:00Z', parties: ['a'] },
        ],
        sensitivity: -0.1,
      };
      const tooHigh = {
        transactions: [
          { id: '550e8400-e29b-41d4-a716-446655440000', amount: 500, timestamp: '2024-01-15T10:30:00Z', parties: ['a'] },
        ],
        sensitivity: 1.1,
      };

      expect(AnomalyDetectInputSchema.safeParse(tooLow).success).toBe(false);
      expect(AnomalyDetectInputSchema.safeParse(tooHigh).success).toBe(false);
    });

    it('should reject empty transactions array', () => {
      const input = { transactions: [] };
      const result = AnomalyDetectInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('MarketRegimeInputSchema', () => {
    it('should validate valid market regime input', () => {
      const validInput = {
        marketData: {
          prices: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109],
        },
        lookbackPeriod: 252,
      };

      const result = MarketRegimeInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should use default lookback period', () => {
      const input = {
        marketData: {
          prices: Array(20).fill(100),
        },
      };

      const result = MarketRegimeInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookbackPeriod).toBe(252);
      }
    });

    it('should reject too few prices', () => {
      const input = {
        marketData: {
          prices: [100, 101, 102], // Less than 10
        },
      };

      const result = MarketRegimeInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate with optional data', () => {
      const input = {
        marketData: {
          prices: Array(20).fill(100),
          volumes: Array(20).fill(1000),
          volatility: Array(20).fill(0.2),
          timestamps: Array(20).fill('2024-01-15'),
        },
        regimeTypes: ['bull', 'bear', 'sideways'],
      };

      const result = MarketRegimeInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate all regime types', () => {
      const regimes = ['bull', 'bear', 'sideways', 'high_vol', 'crisis', 'recovery'] as const;
      const input = {
        marketData: { prices: Array(20).fill(100) },
        regimeTypes: [...regimes],
      };
      const result = MarketRegimeInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('ComplianceCheckInputSchema', () => {
    it('should validate valid compliance check input', () => {
      const validInput = {
        entity: 'Acme Trading LLC',
        regulations: ['basel3', 'mifid2'],
        scope: 'all',
      };

      const result = ComplianceCheckInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should use default scope', () => {
      const input = {
        entity: 'Test Entity',
        regulations: ['aml'],
      };

      const result = ComplianceCheckInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scope).toBe('all');
      }
    });

    it('should validate all regulation types', () => {
      const regulations = ['basel3', 'mifid2', 'dodd_frank', 'aml', 'kyc', 'fatca', 'gdpr'] as const;
      const input = { entity: 'Test', regulations: [...regulations] };
      const result = ComplianceCheckInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate all scope types', () => {
      const scopes = ['positions', 'transactions', 'capital', 'reporting', 'all'] as const;
      for (const scope of scopes) {
        const input = { entity: 'Test', regulations: ['aml'], scope };
        const result = ComplianceCheckInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject empty regulations array', () => {
      const input = { entity: 'Test', regulations: [] };
      const result = ComplianceCheckInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate date format', () => {
      const validDate = { entity: 'Test', regulations: ['aml'], asOfDate: '2024-01-15' };
      const invalidDate = { entity: 'Test', regulations: ['aml'], asOfDate: '01-15-2024' };

      expect(ComplianceCheckInputSchema.safeParse(validDate).success).toBe(true);
      expect(ComplianceCheckInputSchema.safeParse(invalidDate).success).toBe(false);
    });
  });

  describe('StressTestInputSchema', () => {
    it('should validate valid stress test input', () => {
      const validInput = {
        portfolio: {
          holdings: [{ symbol: 'AAPL', quantity: 100 }],
        },
        scenarios: [
          {
            name: 'Market Crash',
            type: 'historical',
            shocks: { equityShock: -0.3 },
          },
        ],
      };

      const result = StressTestInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate all scenario types', () => {
      const types = ['historical', 'hypothetical', 'reverse'] as const;
      for (const type of types) {
        const input = {
          portfolio: { holdings: [{ symbol: 'AAPL', quantity: 100 }] },
          scenarios: [{ name: 'Test', type, shocks: {} }],
        };
        const result = StressTestInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should validate shock ranges', () => {
      const validShocks = {
        portfolio: { holdings: [{ symbol: 'AAPL', quantity: 100 }] },
        scenarios: [
          {
            name: 'Test',
            type: 'hypothetical',
            shocks: {
              equityShock: -0.5,
              interestRateShock: 0.05,
              creditSpreadShock: 0.03,
              volatilityShock: 2.0,
            },
          },
        ],
      };

      const result = StressTestInputSchema.safeParse(validShocks);
      expect(result.success).toBe(true);
    });

    it('should reject shocks outside valid range', () => {
      const invalidShock = {
        portfolio: { holdings: [{ symbol: 'AAPL', quantity: 100 }] },
        scenarios: [
          {
            name: 'Test',
            type: 'hypothetical',
            shocks: { equityShock: -1.5 }, // Less than -1
          },
        ],
      };

      const result = StressTestInputSchema.safeParse(invalidShock);
      expect(result.success).toBe(false);
    });

    it('should reject too many scenarios', () => {
      const scenarios = Array(21).fill({
        name: 'Test',
        type: 'hypothetical',
        shocks: {},
      });
      const input = {
        portfolio: { holdings: [{ symbol: 'AAPL', quantity: 100 }] },
        scenarios,
      };

      const result = StressTestInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty scenarios array', () => {
      const input = {
        portfolio: { holdings: [{ symbol: 'AAPL', quantity: 100 }] },
        scenarios: [],
      };

      const result = StressTestInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Result Helpers', () => {
    it('should create success result', () => {
      const data = { riskScore: 0.75, recommendations: [] };
      const result = successResult(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should create error result from string', () => {
      const result = errorResult('Calculation failed');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Calculation failed');
    });

    it('should create error result from Error object', () => {
      const error = new Error('Portfolio too large');
      const result = errorResult(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Portfolio too large');
    });
  });

  describe('Default Configuration', () => {
    it('should have valid default configuration', () => {
      expect(DEFAULT_FINANCIAL_CONFIG).toBeDefined();
      expect(DEFAULT_FINANCIAL_CONFIG.compliance.auditEnabled).toBe(true);
      expect(DEFAULT_FINANCIAL_CONFIG.compliance.retentionYears).toBe(7);
      expect(DEFAULT_FINANCIAL_CONFIG.compliance.realTimeMonitoring).toBe(true);
    });

    it('should have valid risk configuration', () => {
      expect(DEFAULT_FINANCIAL_CONFIG.risk.defaultConfidenceLevel).toBe(0.95);
      expect(DEFAULT_FINANCIAL_CONFIG.risk.defaultHorizon).toBe('1d');
      expect(DEFAULT_FINANCIAL_CONFIG.risk.maxPositions).toBe(10000);
      expect(DEFAULT_FINANCIAL_CONFIG.risk.varMethod).toBe('historical');
    });

    it('should have valid anomaly configuration', () => {
      expect(DEFAULT_FINANCIAL_CONFIG.anomaly.defaultThreshold).toBe(0.8);
      expect(DEFAULT_FINANCIAL_CONFIG.anomaly.maxTransactions).toBe(100000);
      expect(DEFAULT_FINANCIAL_CONFIG.anomaly.windowSize).toBe(30);
    });

    it('should have valid stress test configuration', () => {
      expect(DEFAULT_FINANCIAL_CONFIG.stressTest.maxScenarios).toBe(20);
      expect(DEFAULT_FINANCIAL_CONFIG.stressTest.defaultSimulations).toBe(10000);
    });
  });

  describe('Error Codes', () => {
    it('should have all expected error codes', () => {
      expect(FinancialErrorCodes.UNAUTHORIZED_ACCESS).toBe('FIN_UNAUTHORIZED_ACCESS');
      expect(FinancialErrorCodes.INVALID_PORTFOLIO).toBe('FIN_INVALID_PORTFOLIO');
      expect(FinancialErrorCodes.INVALID_TRANSACTION).toBe('FIN_INVALID_TRANSACTION');
      expect(FinancialErrorCodes.COMPLIANCE_VIOLATION).toBe('FIN_COMPLIANCE_VIOLATION');
      expect(FinancialErrorCodes.RATE_LIMIT_EXCEEDED).toBe('FIN_RATE_LIMIT_EXCEEDED');
      expect(FinancialErrorCodes.WASM_NOT_INITIALIZED).toBe('FIN_WASM_NOT_INITIALIZED');
      expect(FinancialErrorCodes.CALCULATION_FAILED).toBe('FIN_CALCULATION_FAILED');
      expect(FinancialErrorCodes.MARKET_DATA_UNAVAILABLE).toBe('FIN_MARKET_DATA_UNAVAILABLE');
    });
  });

  describe('Role Permissions', () => {
    it('should define permissions for TRADER', () => {
      expect(FinancialRolePermissions.TRADER).toContain('portfolio-risk');
      expect(FinancialRolePermissions.TRADER).toContain('market-regime');
      expect(FinancialRolePermissions.TRADER).not.toContain('compliance-check');
    });

    it('should define permissions for RISK_MANAGER', () => {
      expect(FinancialRolePermissions.RISK_MANAGER).toContain('portfolio-risk');
      expect(FinancialRolePermissions.RISK_MANAGER).toContain('stress-test');
      expect(FinancialRolePermissions.RISK_MANAGER).toContain('anomaly-detect');
    });

    it('should define permissions for COMPLIANCE_OFFICER', () => {
      expect(FinancialRolePermissions.COMPLIANCE_OFFICER).toContain('compliance-check');
      expect(FinancialRolePermissions.COMPLIANCE_OFFICER).toContain('anomaly-detect');
    });

    it('should have full permissions for ADMIN', () => {
      expect(FinancialRolePermissions.ADMIN).toHaveLength(5);
    });
  });

  describe('Rate Limits', () => {
    it('should define rate limits for all tools', () => {
      expect(FinancialRateLimits['portfolio-risk']).toBeDefined();
      expect(FinancialRateLimits['portfolio-risk'].requestsPerMinute).toBe(60);
      expect(FinancialRateLimits['portfolio-risk'].maxConcurrent).toBe(5);
    });

    it('should have lower limits for stress test', () => {
      expect(FinancialRateLimits['stress-test'].requestsPerMinute).toBe(10);
      expect(FinancialRateLimits['stress-test'].maxConcurrent).toBe(2);
    });
  });
});
