/**
 * Legal Contracts Plugin - Types Tests
 *
 * Tests for Zod schemas and type validation
 */

import { describe, it, expect } from 'vitest';
import {
  ClauseType,
  PartyRole,
  RiskCategory,
  RiskSeverity,
  ComparisonMode,
  ObligationType,
  PlaybookStrictness,
  UserRole,
  ClauseExtractInputSchema,
  RiskAssessInputSchema,
  ContractCompareInputSchema,
  ObligationTrackInputSchema,
  PlaybookMatchInputSchema,
  DEFAULT_CONFIG,
  LegalErrorCodes,
  LegalContractsError,
  RolePermissions,
} from '../src/types.js';

describe('Legal Contracts Types', () => {
  describe('ClauseType Enum', () => {
    it('should validate all clause types', () => {
      const validTypes = [
        'indemnification', 'limitation_of_liability', 'termination', 'confidentiality',
        'ip_assignment', 'governing_law', 'arbitration', 'force_majeure',
        'warranty', 'payment_terms', 'non_compete', 'non_solicitation',
        'assignment', 'insurance', 'representations', 'covenants',
        'data_protection', 'audit_rights',
      ];

      for (const type of validTypes) {
        const result = ClauseType.safeParse(type);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid clause types', () => {
      const result = ClauseType.safeParse('invalid_clause');
      expect(result.success).toBe(false);
    });
  });

  describe('PartyRole Enum', () => {
    it('should validate all party roles', () => {
      const validRoles = [
        'buyer', 'seller', 'licensor', 'licensee', 'employer', 'employee',
        'landlord', 'tenant', 'lender', 'borrower', 'service_provider', 'client',
      ];

      for (const role of validRoles) {
        const result = PartyRole.safeParse(role);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid party roles', () => {
      const result = PartyRole.safeParse('invalid_role');
      expect(result.success).toBe(false);
    });
  });

  describe('RiskCategory Enum', () => {
    it('should validate all risk categories', () => {
      const validCategories = [
        'financial', 'operational', 'legal', 'reputational',
        'compliance', 'strategic', 'security', 'performance',
      ];

      for (const category of validCategories) {
        const result = RiskCategory.safeParse(category);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('RiskSeverity Enum', () => {
    it('should validate all risk severities', () => {
      const validSeverities = ['low', 'medium', 'high', 'critical'];

      for (const severity of validSeverities) {
        const result = RiskSeverity.safeParse(severity);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('ComparisonMode Enum', () => {
    it('should validate all comparison modes', () => {
      const validModes = ['structural', 'semantic', 'full'];

      for (const mode of validModes) {
        const result = ComparisonMode.safeParse(mode);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('ObligationType Enum', () => {
    it('should validate all obligation types', () => {
      const validTypes = [
        'payment', 'delivery', 'notification', 'approval', 'compliance',
        'reporting', 'confidentiality', 'performance', 'insurance',
        'renewal', 'termination',
      ];

      for (const type of validTypes) {
        const result = ObligationType.safeParse(type);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('PlaybookStrictness Enum', () => {
    it('should validate all strictness levels', () => {
      const validLevels = ['strict', 'moderate', 'flexible'];

      for (const level of validLevels) {
        const result = PlaybookStrictness.safeParse(level);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('UserRole Enum', () => {
    it('should validate all user roles', () => {
      const validRoles = ['partner', 'associate', 'paralegal', 'contract_manager', 'client'];

      for (const role of validRoles) {
        const result = UserRole.safeParse(role);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('ClauseExtractInputSchema', () => {
    it('should validate valid clause extract input', () => {
      const validInput = {
        document: 'This Agreement is entered into...',
        clauseTypes: ['indemnification', 'termination'],
        jurisdiction: 'US',
      };

      const result = ClauseExtractInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includePositions).toBe(true); // default
        expect(result.data.includeEmbeddings).toBe(false); // default
      }
    });

    it('should use defaults when not provided', () => {
      const input = {
        document: 'Contract text here',
      };

      const result = ClauseExtractInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.jurisdiction).toBe('US');
        expect(result.data.includePositions).toBe(true);
        expect(result.data.includeEmbeddings).toBe(false);
      }
    });

    it('should reject document exceeding size limit', () => {
      const input = {
        document: 'a'.repeat(10_000_001),
      };

      const result = ClauseExtractInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate with matter context', () => {
      const input = {
        document: 'Contract text',
        matterContext: {
          matterId: 'matter-123',
          clientId: 'client-456',
        },
      };

      const result = ClauseExtractInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('RiskAssessInputSchema', () => {
    it('should validate valid risk assessment input', () => {
      const validInput = {
        document: 'This Agreement contains...',
        partyRole: 'buyer',
        riskCategories: ['financial', 'legal'],
      };

      const result = RiskAssessInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeFinancialImpact).toBe(true); // default
      }
    });

    it('should require partyRole', () => {
      const input = {
        document: 'Contract text',
      };

      const result = RiskAssessInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate with industry context', () => {
      const input = {
        document: 'Contract text',
        partyRole: 'seller',
        industryContext: 'Healthcare',
        threshold: 'high',
      };

      const result = RiskAssessInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid party role', () => {
      const input = {
        document: 'Contract text',
        partyRole: 'invalid_role',
      };

      const result = RiskAssessInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ContractCompareInputSchema', () => {
    it('should validate valid contract compare input', () => {
      const validInput = {
        baseDocument: 'First contract...',
        compareDocument: 'Second contract...',
        comparisonMode: 'full',
      };

      const result = ContractCompareInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.highlightChanges).toBe(true); // default
        expect(result.data.generateRedline).toBe(false); // default
      }
    });

    it('should use default comparison mode', () => {
      const input = {
        baseDocument: 'Base contract',
        compareDocument: 'Compare contract',
      };

      const result = ContractCompareInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.comparisonMode).toBe('full');
      }
    });

    it('should validate with focus clause types', () => {
      const input = {
        baseDocument: 'Base',
        compareDocument: 'Compare',
        focusClauseTypes: ['termination', 'indemnification'],
      };

      const result = ContractCompareInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject documents exceeding size limit', () => {
      const input = {
        baseDocument: 'a'.repeat(10_000_001),
        compareDocument: 'Compare',
      };

      const result = ContractCompareInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ObligationTrackInputSchema', () => {
    it('should validate valid obligation tracking input', () => {
      const validInput = {
        document: 'Agreement with obligations...',
        party: 'Vendor Inc.',
        obligationTypes: ['payment', 'delivery'],
      };

      const result = ObligationTrackInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeDependencies).toBe(true); // default
        expect(result.data.includeTimeline).toBe(true); // default
      }
    });

    it('should validate with minimal input', () => {
      const input = {
        document: 'Contract text',
      };

      const result = ObligationTrackInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with timeframe', () => {
      const input = {
        document: 'Contract text',
        timeframe: 'next 30 days',
      };

      const result = ObligationTrackInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate all obligation types', () => {
      const allTypes = [
        'payment', 'delivery', 'notification', 'approval', 'compliance',
        'reporting', 'confidentiality', 'performance', 'insurance',
        'renewal', 'termination',
      ];

      const input = {
        document: 'Contract text',
        obligationTypes: allTypes,
      };

      const result = ObligationTrackInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('PlaybookMatchInputSchema', () => {
    it('should validate valid playbook match input', () => {
      const validInput = {
        document: 'Contract to match...',
        playbook: '{"positions": []}',
        strictness: 'moderate',
      };

      const result = PlaybookMatchInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.suggestAlternatives).toBe(true); // default
      }
    });

    it('should use default strictness', () => {
      const input = {
        document: 'Contract',
        playbook: '{}',
      };

      const result = PlaybookMatchInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strictness).toBe('moderate');
      }
    });

    it('should validate with priority clauses', () => {
      const input = {
        document: 'Contract',
        playbook: '{}',
        prioritizeClauses: ['indemnification', 'liability'],
      };

      const result = PlaybookMatchInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject playbook exceeding size limit', () => {
      const input = {
        document: 'Contract',
        playbook: 'a'.repeat(1_000_001),
      };

      const result = PlaybookMatchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate all strictness levels', () => {
      const levels = ['strict', 'moderate', 'flexible'] as const;
      for (const strictness of levels) {
        const input = { document: 'Contract', playbook: '{}', strictness };
        const result = PlaybookMatchInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Default Configuration', () => {
    it('should have valid default configuration', () => {
      expect(DEFAULT_CONFIG).toBeDefined();
      expect(DEFAULT_CONFIG.extraction.minConfidence).toBe(0.7);
      expect(DEFAULT_CONFIG.extraction.includeEmbeddings).toBe(false);
      expect(DEFAULT_CONFIG.extraction.embeddingDimension).toBe(384);
    });

    it('should have valid risk configuration', () => {
      expect(DEFAULT_CONFIG.risk.defaultThreshold).toBe('medium');
      expect(DEFAULT_CONFIG.risk.includeFinancialImpact).toBe(true);
    });

    it('should have valid comparison configuration', () => {
      expect(DEFAULT_CONFIG.comparison.similarityThreshold).toBe(0.8);
      expect(DEFAULT_CONFIG.comparison.generateRedline).toBe(false);
    });

    it('should have valid security configuration', () => {
      expect(DEFAULT_CONFIG.security.matterIsolation).toBe(true);
      expect(DEFAULT_CONFIG.security.auditLevel).toBe('standard');
      expect(DEFAULT_CONFIG.security.allowedDocumentRoot).toBe('/documents');
    });
  });

  describe('Error Codes', () => {
    it('should have all expected error codes', () => {
      expect(LegalErrorCodes.DOCUMENT_TOO_LARGE).toBe('LEGAL_DOCUMENT_TOO_LARGE');
      expect(LegalErrorCodes.INVALID_DOCUMENT_FORMAT).toBe('LEGAL_INVALID_DOCUMENT_FORMAT');
      expect(LegalErrorCodes.CLAUSE_EXTRACTION_FAILED).toBe('LEGAL_CLAUSE_EXTRACTION_FAILED');
      expect(LegalErrorCodes.RISK_ASSESSMENT_FAILED).toBe('LEGAL_RISK_ASSESSMENT_FAILED');
      expect(LegalErrorCodes.COMPARISON_FAILED).toBe('LEGAL_COMPARISON_FAILED');
      expect(LegalErrorCodes.OBLIGATION_PARSING_FAILED).toBe('LEGAL_OBLIGATION_PARSING_FAILED');
      expect(LegalErrorCodes.PLAYBOOK_INVALID).toBe('LEGAL_PLAYBOOK_INVALID');
      expect(LegalErrorCodes.MATTER_ACCESS_DENIED).toBe('LEGAL_MATTER_ACCESS_DENIED');
      expect(LegalErrorCodes.ETHICAL_WALL_VIOLATION).toBe('LEGAL_ETHICAL_WALL_VIOLATION');
      expect(LegalErrorCodes.WASM_NOT_INITIALIZED).toBe('LEGAL_WASM_NOT_INITIALIZED');
      expect(LegalErrorCodes.PRIVILEGE_VIOLATION).toBe('LEGAL_PRIVILEGE_VIOLATION');
    });
  });

  describe('LegalContractsError', () => {
    it('should create error with code and message', () => {
      const error = new LegalContractsError(
        LegalErrorCodes.DOCUMENT_TOO_LARGE,
        'Document exceeds 10MB limit'
      );

      expect(error.name).toBe('LegalContractsError');
      expect(error.code).toBe('LEGAL_DOCUMENT_TOO_LARGE');
      expect(error.message).toBe('Document exceeds 10MB limit');
    });

    it('should create error with details', () => {
      const error = new LegalContractsError(
        LegalErrorCodes.MATTER_ACCESS_DENIED,
        'Access denied',
        { matterId: 'matter-123', userId: 'user-456' }
      );

      expect(error.details).toEqual({ matterId: 'matter-123', userId: 'user-456' });
    });

    it('should be instance of Error', () => {
      const error = new LegalContractsError(
        LegalErrorCodes.CLAUSE_EXTRACTION_FAILED,
        'Failed'
      );

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('Role Permissions', () => {
    it('should define full permissions for partner', () => {
      expect(RolePermissions.partner).toHaveLength(5);
      expect(RolePermissions.partner).toContain('clause-extract');
      expect(RolePermissions.partner).toContain('risk-assess');
      expect(RolePermissions.partner).toContain('contract-compare');
      expect(RolePermissions.partner).toContain('obligation-track');
      expect(RolePermissions.partner).toContain('playbook-match');
    });

    it('should define limited permissions for associate', () => {
      expect(RolePermissions.associate).toHaveLength(4);
      expect(RolePermissions.associate).not.toContain('playbook-match');
    });

    it('should define minimal permissions for paralegal', () => {
      expect(RolePermissions.paralegal).toHaveLength(2);
      expect(RolePermissions.paralegal).toContain('clause-extract');
      expect(RolePermissions.paralegal).toContain('obligation-track');
    });

    it('should define permissions for contract_manager', () => {
      expect(RolePermissions.contract_manager).toHaveLength(2);
      expect(RolePermissions.contract_manager).toContain('obligation-track');
      expect(RolePermissions.contract_manager).toContain('playbook-match');
    });

    it('should have no permissions for client', () => {
      expect(RolePermissions.client).toHaveLength(0);
    });
  });
});
