/**
 * Healthcare Clinical Plugin - Types Tests
 *
 * Tests for Zod schemas and type validation
 */

import { describe, it, expect } from 'vitest';
import {
  PatientSimilarityInputSchema,
  DrugInteractionsInputSchema,
  ClinicalPathwaysInputSchema,
  LiteratureSearchInputSchema,
  OntologyNavigationInputSchema,
  successResult,
  errorResult,
  DEFAULT_HEALTHCARE_CONFIG,
  HealthcareErrorCodes,
  HealthcareRolePermissions,
} from '../src/types.js';

describe('Healthcare Clinical Types', () => {
  describe('PatientSimilarityInputSchema', () => {
    it('should validate valid patient similarity input', () => {
      const validInput = {
        patientFeatures: {
          diagnoses: ['A00.0', 'B01.11'],
          medications: ['aspirin', 'metformin'],
        },
        topK: 10,
      };

      const result = PatientSimilarityInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topK).toBe(10);
        expect(result.data.patientFeatures.diagnoses).toHaveLength(2);
      }
    });

    it('should use default topK when not provided', () => {
      const input = {
        patientFeatures: {
          diagnoses: ['A00.0'],
        },
      };

      const result = PatientSimilarityInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topK).toBe(5);
      }
    });

    it('should reject invalid ICD-10 codes', () => {
      const invalidInput = {
        patientFeatures: {
          diagnoses: ['INVALID_CODE'],
        },
      };

      const result = PatientSimilarityInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject ICD-10 codes with incorrect format', () => {
      const invalidInputs = [
        { patientFeatures: { diagnoses: ['123'] } },
        { patientFeatures: { diagnoses: ['a00.0'] } }, // lowercase
        { patientFeatures: { diagnoses: ['A0'] } }, // too short
        { patientFeatures: { diagnoses: ['A00.123'] } }, // too many decimal digits
      ];

      for (const input of invalidInputs) {
        const result = PatientSimilarityInputSchema.safeParse(input);
        expect(result.success).toBe(false);
      }
    });

    it('should validate with optional fields', () => {
      const input = {
        patientFeatures: {
          diagnoses: ['A00.0'],
          labResults: { glucose: 95.5, cholesterol: 180 },
          vitals: { heartRate: 72, bloodPressure: 120 },
          demographics: { ageRange: '40-50', gender: 'M' },
          procedures: ['appendectomy'],
          allergies: ['penicillin'],
        },
        topK: 5,
        cohortFilter: 'diabetes patients',
      };

      const result = PatientSimilarityInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject topK outside valid range', () => {
      const tooLow = {
        patientFeatures: { diagnoses: ['A00.0'] },
        topK: 0,
      };
      const tooHigh = {
        patientFeatures: { diagnoses: ['A00.0'] },
        topK: 101,
      };

      expect(PatientSimilarityInputSchema.safeParse(tooLow).success).toBe(false);
      expect(PatientSimilarityInputSchema.safeParse(tooHigh).success).toBe(false);
    });

    it('should reject too many diagnoses', () => {
      const input = {
        patientFeatures: {
          diagnoses: Array(101).fill('A00.0'),
        },
      };

      const result = PatientSimilarityInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('DrugInteractionsInputSchema', () => {
    it('should validate valid drug interactions input', () => {
      const validInput = {
        medications: ['aspirin', 'warfarin', 'metoprolol'],
        severity: 'major',
      };

      const result = DrugInteractionsInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.medications).toHaveLength(3);
        expect(result.data.severity).toBe('major');
      }
    });

    it('should use default severity when not provided', () => {
      const input = {
        medications: ['aspirin'],
      };

      const result = DrugInteractionsInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.severity).toBe('all');
      }
    });

    it('should reject empty medications array', () => {
      const input = {
        medications: [],
      };

      const result = DrugInteractionsInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate with conditions', () => {
      const input = {
        medications: ['aspirin'],
        conditions: ['diabetes', 'hypertension'],
        severity: 'moderate',
      };

      const result = DrugInteractionsInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid severity values', () => {
      const input = {
        medications: ['aspirin'],
        severity: 'critical',
      };

      const result = DrugInteractionsInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject too many medications', () => {
      const input = {
        medications: Array(51).fill('aspirin'),
      };

      const result = DrugInteractionsInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ClinicalPathwaysInputSchema', () => {
    it('should validate valid clinical pathways input', () => {
      const validInput = {
        primaryDiagnosis: 'Type 2 Diabetes Mellitus',
      };

      const result = ClinicalPathwaysInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate with constraints', () => {
      const input = {
        primaryDiagnosis: 'Hypertension',
        patientHistory: { previousConditions: ['diabetes'] },
        constraints: {
          excludeMedications: ['metformin'],
          costSensitive: true,
          outpatientOnly: true,
          ageRestrictions: 'over 65',
          comorbidityConsiderations: ['kidney disease'],
        },
      };

      const result = ClinicalPathwaysInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject diagnosis exceeding max length', () => {
      const input = {
        primaryDiagnosis: 'a'.repeat(101),
      };

      const result = ClinicalPathwaysInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('LiteratureSearchInputSchema', () => {
    it('should validate valid literature search input', () => {
      const validInput = {
        query: 'diabetes treatment guidelines',
        sources: ['pubmed', 'cochrane'],
        maxResults: 50,
      };

      const result = LiteratureSearchInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxResults).toBe(50);
      }
    });

    it('should use default maxResults when not provided', () => {
      const input = {
        query: 'hypertension management',
      };

      const result = LiteratureSearchInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxResults).toBe(20);
      }
    });

    it('should reject query too short', () => {
      const input = {
        query: 'ab',
      };

      const result = LiteratureSearchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject query too long', () => {
      const input = {
        query: 'a'.repeat(1001),
      };

      const result = LiteratureSearchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate with date range and evidence level', () => {
      const input = {
        query: 'covid treatment',
        dateRange: {
          from: '2020-01-01T00:00:00Z',
          to: '2023-12-31T23:59:59Z',
        },
        evidenceLevel: 'rct',
      };

      const result = LiteratureSearchInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid sources', () => {
      const input = {
        query: 'test query',
        sources: ['invalid_source'],
      };

      const result = LiteratureSearchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid evidence levels', () => {
      const input = {
        query: 'test query',
        evidenceLevel: 'invalid_level',
      };

      const result = LiteratureSearchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('OntologyNavigationInputSchema', () => {
    it('should validate valid ontology navigation input', () => {
      const validInput = {
        code: 'A00.0',
        ontology: 'icd10',
        direction: 'descendants',
      };

      const result = OntologyNavigationInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.depth).toBe(2); // default
      }
    });

    it('should validate all ontology types', () => {
      const ontologies = ['icd10', 'snomed', 'loinc', 'rxnorm'] as const;
      for (const ontology of ontologies) {
        const input = {
          code: 'TEST123',
          ontology,
          direction: 'ancestors',
        };
        const result = OntologyNavigationInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all direction types', () => {
      const directions = ['ancestors', 'descendants', 'siblings', 'related'] as const;
      for (const direction of directions) {
        const input = {
          code: 'TEST',
          ontology: 'snomed',
          direction,
        };
        const result = OntologyNavigationInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid ontology', () => {
      const input = {
        code: 'TEST',
        ontology: 'invalid',
        direction: 'ancestors',
      };

      const result = OntologyNavigationInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject depth outside valid range', () => {
      const tooLow = {
        code: 'TEST',
        ontology: 'icd10',
        direction: 'ancestors',
        depth: 0,
      };
      const tooHigh = {
        code: 'TEST',
        ontology: 'icd10',
        direction: 'ancestors',
        depth: 11,
      };

      expect(OntologyNavigationInputSchema.safeParse(tooLow).success).toBe(false);
      expect(OntologyNavigationInputSchema.safeParse(tooHigh).success).toBe(false);
    });
  });

  describe('Result Helpers', () => {
    it('should create success result', () => {
      const data = { patients: [], searchTime: 100 };
      const result = successResult(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should create success result with metadata', () => {
      const data = { result: 'test' };
      const metadata = { durationMs: 50, cached: true, wasmUsed: false };
      const result = successResult(data, metadata);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.metadata).toEqual(metadata);
    });

    it('should create error result from string', () => {
      const result = errorResult('Something went wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });

    it('should create error result from Error object', () => {
      const error = new Error('Test error message');
      const result = errorResult(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error message');
    });

    it('should create error result with metadata', () => {
      const metadata = { durationMs: 10 };
      const result = errorResult('Error', metadata);

      expect(result.success).toBe(false);
      expect(result.metadata).toEqual(metadata);
    });
  });

  describe('Default Configuration', () => {
    it('should have valid default configuration', () => {
      expect(DEFAULT_HEALTHCARE_CONFIG).toBeDefined();
      expect(DEFAULT_HEALTHCARE_CONFIG.hipaa.auditEnabled).toBe(true);
      expect(DEFAULT_HEALTHCARE_CONFIG.hipaa.encryptionRequired).toBe(true);
      expect(DEFAULT_HEALTHCARE_CONFIG.hipaa.minimumNecessary).toBe(true);
      expect(DEFAULT_HEALTHCARE_CONFIG.hipaa.retentionYears).toBe(6);
    });

    it('should have valid HNSW configuration', () => {
      expect(DEFAULT_HEALTHCARE_CONFIG.hnsw.dimensions).toBe(768);
      expect(DEFAULT_HEALTHCARE_CONFIG.hnsw.maxElements).toBe(100000);
      expect(DEFAULT_HEALTHCARE_CONFIG.hnsw.efConstruction).toBe(200);
      expect(DEFAULT_HEALTHCARE_CONFIG.hnsw.M).toBe(16);
    });

    it('should have valid search configuration', () => {
      expect(DEFAULT_HEALTHCARE_CONFIG.search.defaultTopK).toBe(5);
      expect(DEFAULT_HEALTHCARE_CONFIG.search.maxTopK).toBe(100);
      expect(DEFAULT_HEALTHCARE_CONFIG.search.similarityThreshold).toBe(0.7);
    });

    it('should have valid cache configuration', () => {
      expect(DEFAULT_HEALTHCARE_CONFIG.cache.enabled).toBe(true);
      expect(DEFAULT_HEALTHCARE_CONFIG.cache.ttl).toBe(300000);
      expect(DEFAULT_HEALTHCARE_CONFIG.cache.maxSize).toBe(1000);
    });
  });

  describe('Error Codes', () => {
    it('should have all expected error codes', () => {
      expect(HealthcareErrorCodes.HIPAA_VIOLATION).toBe('HC_HIPAA_VIOLATION');
      expect(HealthcareErrorCodes.UNAUTHORIZED_ACCESS).toBe('HC_UNAUTHORIZED_ACCESS');
      expect(HealthcareErrorCodes.INVALID_ICD10_CODE).toBe('HC_INVALID_ICD10_CODE');
      expect(HealthcareErrorCodes.INVALID_SNOMED_CODE).toBe('HC_INVALID_SNOMED_CODE');
      expect(HealthcareErrorCodes.PATIENT_NOT_FOUND).toBe('HC_PATIENT_NOT_FOUND');
      expect(HealthcareErrorCodes.DRUG_NOT_FOUND).toBe('HC_DRUG_NOT_FOUND');
      expect(HealthcareErrorCodes.ONTOLOGY_NOT_AVAILABLE).toBe('HC_ONTOLOGY_NOT_AVAILABLE');
      expect(HealthcareErrorCodes.WASM_NOT_INITIALIZED).toBe('HC_WASM_NOT_INITIALIZED');
      expect(HealthcareErrorCodes.SEARCH_FAILED).toBe('HC_SEARCH_FAILED');
      expect(HealthcareErrorCodes.AUDIT_FAILED).toBe('HC_AUDIT_FAILED');
    });
  });

  describe('Role Permissions', () => {
    it('should define permissions for all roles', () => {
      expect(HealthcareRolePermissions.PHYSICIAN).toContain('patient-similarity');
      expect(HealthcareRolePermissions.PHYSICIAN).toContain('drug-interactions');
      expect(HealthcareRolePermissions.PHYSICIAN).toContain('clinical-pathways');
      expect(HealthcareRolePermissions.PHYSICIAN).toContain('literature-search');
      expect(HealthcareRolePermissions.PHYSICIAN).toContain('ontology-navigate');
    });

    it('should have limited permissions for NURSE role', () => {
      expect(HealthcareRolePermissions.NURSE).toContain('drug-interactions');
      expect(HealthcareRolePermissions.NURSE).toContain('ontology-navigate');
      expect(HealthcareRolePermissions.NURSE).not.toContain('patient-similarity');
    });

    it('should have limited permissions for CODER role', () => {
      expect(HealthcareRolePermissions.CODER).toContain('ontology-navigate');
      expect(HealthcareRolePermissions.CODER).not.toContain('drug-interactions');
    });

    it('should have full permissions for ADMIN role', () => {
      expect(HealthcareRolePermissions.ADMIN).toHaveLength(5);
    });
  });
});
