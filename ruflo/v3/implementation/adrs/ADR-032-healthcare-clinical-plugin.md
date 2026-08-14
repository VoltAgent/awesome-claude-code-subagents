# ADR-032: Healthcare Clinical Decision Support Plugin

**Status:** Proposed
**Date:** 2026-01-24
**Category:** Practical Vertical Application
**Author:** Plugin Architecture Team
**Version:** 1.0.0
**Deciders:** Plugin Architecture Team, Healthcare Domain Experts
**Supersedes:** None

## Context

Healthcare organizations require AI systems that can assist with clinical decision support while maintaining strict compliance with HIPAA, HL7 FHIR standards, and medical terminology (SNOMED-CT, ICD-10). Existing solutions often lack the specialized vector search and graph reasoning capabilities needed for medical knowledge bases.

## Decision

Create a **Healthcare Clinical Decision Support Plugin** that leverages RuVector WASM packages for medical document analysis, patient record similarity matching, and clinical pathway recommendations.

## Plugin Name

`@claude-flow/plugin-healthcare-clinical`

## Description

A HIPAA-compliant clinical decision support plugin that combines ultra-fast vector search for medical literature retrieval with graph neural networks for patient pathway analysis. The plugin enables semantic search across medical records, drug interaction detection, and evidence-based treatment recommendations while maintaining strict data privacy through on-device WASM processing.

## Key WASM Packages

| Package | Purpose |
|---------|---------|
| `micro-hnsw-wasm` | Fast similarity search for patient records and medical literature (150x faster) |
| `ruvector-gnn-wasm` | Graph neural networks for patient pathway analysis and comorbidity networks |
| `ruvector-hyperbolic-hnsw-wasm` | Hierarchical medical ontology embeddings (ICD-10, SNOMED-CT trees) |
| `ruvector-sparse-inference-wasm` | Efficient inference on sparse clinical features |

## MCP Tools

### 1. `healthcare/patient-similarity`

Find similar patient cases for treatment guidance.

```typescript
{
  name: 'healthcare/patient-similarity',
  description: 'Find similar patient cases based on clinical features',
  inputSchema: {
    type: 'object',
    properties: {
      patientFeatures: {
        type: 'object',
        description: 'Clinical features (labs, vitals, diagnoses)',
        properties: {
          diagnoses: { type: 'array', items: { type: 'string' } },
          labResults: { type: 'object' },
          vitals: { type: 'object' },
          medications: { type: 'array', items: { type: 'string' } }
        }
      },
      topK: { type: 'number', default: 5 },
      cohortFilter: { type: 'string', description: 'Filter by patient cohort' }
    },
    required: ['patientFeatures']
  }
}
```

### 2. `healthcare/drug-interactions`

Detect potential drug-drug and drug-condition interactions.

```typescript
{
  name: 'healthcare/drug-interactions',
  description: 'Analyze drug interactions using GNN on drug interaction graph',
  inputSchema: {
    type: 'object',
    properties: {
      medications: { type: 'array', items: { type: 'string' } },
      conditions: { type: 'array', items: { type: 'string' } },
      severity: { type: 'string', enum: ['all', 'major', 'moderate', 'minor'] }
    },
    required: ['medications']
  }
}
```

### 3. `healthcare/clinical-pathways`

Recommend evidence-based clinical pathways.

```typescript
{
  name: 'healthcare/clinical-pathways',
  description: 'Suggest clinical pathways based on diagnosis and patient history',
  inputSchema: {
    type: 'object',
    properties: {
      primaryDiagnosis: { type: 'string', description: 'ICD-10 or SNOMED code' },
      patientHistory: { type: 'object' },
      constraints: {
        type: 'object',
        properties: {
          excludeMedications: { type: 'array' },
          costSensitive: { type: 'boolean' },
          outpatientOnly: { type: 'boolean' }
        }
      }
    },
    required: ['primaryDiagnosis']
  }
}
```

### 4. `healthcare/literature-search`

Semantic search across medical literature.

```typescript
{
  name: 'healthcare/literature-search',
  description: 'Search medical literature with semantic understanding',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      sources: {
        type: 'array',
        items: { type: 'string', enum: ['pubmed', 'cochrane', 'uptodate', 'local'] }
      },
      dateRange: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
      evidenceLevel: { type: 'string', enum: ['any', 'systematic-review', 'rct', 'cohort'] }
    },
    required: ['query']
  }
}
```

### 5. `healthcare/ontology-navigate`

Navigate medical ontology hierarchies.

```typescript
{
  name: 'healthcare/ontology-navigate',
  description: 'Navigate ICD-10, SNOMED-CT hierarchies using hyperbolic embeddings',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Medical code to explore' },
      ontology: { type: 'string', enum: ['icd10', 'snomed', 'loinc', 'rxnorm'] },
      direction: { type: 'string', enum: ['ancestors', 'descendants', 'siblings', 'related'] },
      depth: { type: 'number', default: 2 }
    },
    required: ['code', 'ontology']
  }
}
```

## Use Cases

1. **Clinical Decision Support**: Physicians query similar patient cases to inform treatment decisions
2. **Drug Safety**: Pharmacists check multi-drug regimens for potential interactions
3. **Care Coordination**: Care managers identify optimal clinical pathways for complex patients
4. **Medical Research**: Researchers perform semantic literature searches for evidence synthesis
5. **Diagnosis Coding**: Coders navigate medical ontologies for accurate billing codes

## Architecture

```
+------------------+     +----------------------+     +------------------+
|   FHIR Gateway   |---->|  Healthcare Plugin   |---->|   HNSW Index     |
|  (HL7 FHIR R4)   |     |  (Privacy-First)     |     | (Patient Embeds) |
+------------------+     +----------------------+     +------------------+
                                   |
                         +---------+---------+
                         |         |         |
                    +----+---+ +---+----+ +--+-----+
                    |  GNN   | |Hyper-  | |Sparse  |
                    |Pathways| |bolic   | |Infer   |
                    +--------+ +--------+ +--------+
```

## Security Considerations

### CRITICAL: HIPAA Compliance Requirements

| Requirement | Implementation | Severity |
|-------------|----------------|----------|
| **PHI Protection** | All patient data processed exclusively in WASM sandbox | CRITICAL |
| **Encryption at Rest** | AES-256 encryption for all stored embeddings and indexes | CRITICAL |
| **Encryption in Transit** | TLS 1.3 minimum for any network operations | CRITICAL |
| **Access Logging** | Immutable audit logs with tamper detection (HMAC) | CRITICAL |
| **Minimum Necessary** | Role-based data filtering at query time | HIGH |

### Input Validation (CRITICAL)

All MCP tool inputs MUST be validated using Zod schemas:

```typescript
// healthcare/patient-similarity input validation
const PatientSimilaritySchema = z.object({
  patientFeatures: z.object({
    diagnoses: z.array(z.string().regex(/^[A-Z]\d{2}(\.\d{1,2})?$/)).max(100), // ICD-10 format
    labResults: z.record(z.string(), z.number()).optional(),
    vitals: z.record(z.string(), z.number()).optional(),
    medications: z.array(z.string().max(200)).max(50).optional()
  }),
  topK: z.number().int().min(1).max(100).default(5),
  cohortFilter: z.string().max(500).optional()
});

// healthcare/drug-interactions input validation
const DrugInteractionsSchema = z.object({
  medications: z.array(z.string().max(200)).min(1).max(50),
  conditions: z.array(z.string().max(200)).max(100).optional(),
  severity: z.enum(['all', 'major', 'moderate', 'minor']).default('all')
});

// healthcare/literature-search input validation
const LiteratureSearchSchema = z.object({
  query: z.string().min(3).max(1000),
  sources: z.array(z.enum(['pubmed', 'cochrane', 'uptodate', 'local'])).optional(),
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional()
  }).optional(),
  evidenceLevel: z.enum(['any', 'systematic-review', 'rct', 'cohort']).optional()
});
```

### WASM Security Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Memory Limit | 512MB max | Prevent memory exhaustion DoS |
| CPU Time Limit | 30 seconds per operation | Prevent infinite loops |
| No Network Access | Enforced by WASM sandbox | PHI cannot leak via network |
| No File System Access | Sandboxed virtual FS only | Prevent path traversal |
| Stack Size | 1MB limit | Prevent stack overflow attacks |

### Data Residency & Sovereignty

- **On-Device Processing MANDATORY**: All PHI must be processed locally via WASM
- **No Cloud Transmission**: Plugin MUST NOT transmit PHI to external services
- **Geographic Restrictions**: Deployment configurations must specify allowed jurisdictions
- **Data Localization**: Index and embedding storage must respect regional requirements

### Authentication & Authorization

```typescript
// Required role-based access control
const HealthcareRoles = {
  PHYSICIAN: ['patient-similarity', 'drug-interactions', 'clinical-pathways', 'literature-search', 'ontology-navigate'],
  NURSE: ['drug-interactions', 'ontology-navigate'],
  PHARMACIST: ['drug-interactions', 'literature-search'],
  RESEARCHER: ['literature-search', 'ontology-navigate'], // No patient data access
  CODER: ['ontology-navigate'] // Billing codes only
};

// Claims-based authorization check
async function authorizeHealthcareTool(userId: string, toolName: string): Promise<boolean> {
  const claims = await getUserClaims(userId);
  const requiredRole = getRequiredRole(toolName);
  return claims.roles.some(role => HealthcareRoles[role]?.includes(toolName));
}
```

### Audit Logging Requirements (HIPAA 164.312(b))

```typescript
interface HealthcareAuditLog {
  timestamp: string;          // ISO 8601 with timezone
  userId: string;             // Authenticated user ID
  toolName: string;           // MCP tool invoked
  action: 'query' | 'view' | 'export';
  patientIdentifiers: string[]; // Hashed patient IDs accessed
  queryHash: string;          // Hash of query for reproducibility
  resultCount: number;        // Number of records returned
  ipAddress: string;          // Client IP (hashed for privacy)
  success: boolean;
  errorCode?: string;
}

// Audit logs MUST be:
// - Immutable (append-only storage)
// - Tamper-evident (HMAC chain)
// - Retained for 6 years minimum (HIPAA requirement)
// - Encrypted at rest
```

### Identified Security Risks

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| HC-SEC-001 | **CRITICAL** | PHI leakage via model embeddings | Use differential privacy, no raw PHI in embeddings |
| HC-SEC-002 | **HIGH** | Re-identification attacks on anonymized data | k-anonymity (k>=5) for all aggregate queries |
| HC-SEC-003 | **HIGH** | SQL injection in FHIR queries | Parameterized queries only, no string concatenation |
| HC-SEC-004 | **MEDIUM** | Timing attacks revealing patient existence | Constant-time operations for all queries |
| HC-SEC-005 | **MEDIUM** | Model inversion attacks | Rate limiting, query result caching |

### Injection Prevention

```typescript
// MANDATORY: No shell commands in healthcare plugin
// MANDATORY: No eval() or dynamic code execution
// MANDATORY: Parameterized queries only

// BAD - vulnerable to injection
const unsafeQuery = `SELECT * FROM patients WHERE icd10 = '${userInput}'`;

// GOOD - parameterized
const safeQuery = {
  text: 'SELECT * FROM patients WHERE icd10 = $1',
  values: [validateICD10(userInput)]
};
```

### Privacy & Compliance

- **On-Device Processing**: All WASM processing happens locally, no PHI leaves the system
- **Differential Privacy**: Optional noise injection for aggregate queries
- **Audit Logging**: Complete audit trail for HIPAA compliance
- **Role-Based Access**: Integrates with healthcare identity providers
- **BAA Requirements**: Business Associate Agreements required for any third-party components

## Performance Targets

| Metric | Target | Baseline (Traditional) | Improvement |
|--------|--------|------------------------|-------------|
| Patient similarity search | <50ms for 100K records | ~5s (SQL JOIN) | 100x |
| Drug interaction check | <10ms for 20 medications | ~200ms (rule engine) | 20x |
| Literature search | <100ms for 1M abstracts | ~2s (Elasticsearch) | 20x |
| Ontology traversal | <5ms per hop | ~50ms (graph DB) | 10x |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| HIPAA violation | Low | Critical | On-device WASM processing, no PHI transmission |
| Model bias in treatment | Medium | High | Explainability requirements, human oversight |
| Ontology licensing | Medium | Medium | Support for open ontologies as fallback |
| Regulatory approval delays | High | Medium | Design for "research mode" with clinical pathway |

## Implementation Notes

### Phase 1: Core Infrastructure
- FHIR R4 data adapter
- Medical ontology loaders (ICD-10, SNOMED-CT)
- HIPAA-compliant audit logging

### Phase 2: Vector Search
- Patient embedding model (clinical BERT variant)
- HNSW index for patient similarity
- Literature embedding and indexing

### Phase 3: Graph Features
- Drug interaction graph construction
- Clinical pathway GNN training
- Comorbidity network analysis

## Dependencies

```json
{
  "dependencies": {
    "micro-hnsw-wasm": "^0.2.0",
    "ruvector-gnn-wasm": "^0.1.0",
    "ruvector-hyperbolic-hnsw-wasm": "^0.1.0",
    "ruvector-sparse-inference-wasm": "^0.1.0",
    "@medplum/fhirtypes": "^2.0.0"
  }
}
```

## Consequences

### Positive
- Enables AI-assisted clinical decisions with sub-100ms latency
- HIPAA-compliant through local WASM processing
- Leverages proven medical ontologies for accuracy

### Negative
- Requires medical ontology licensing (SNOMED-CT, etc.)
- Initial embedding model training requires labeled clinical data
- Regulatory approval may be needed for clinical use

### Neutral
- Plugin can operate in "research mode" without clinical deployment

## Related ADRs

| ADR | Relationship |
|-----|--------------|
| ADR-004: Plugin Architecture | Foundation - Defines plugin structure |
| ADR-017: RuVector Integration | Dependency - Provides WASM packages |
| ADR-041: Hyperbolic Reasoning | Related - Medical ontology navigation |
| ADR-039: Cognitive Kernel | Related - Clinical decision support reasoning |

## References

- HL7 FHIR R4 Specification: https://hl7.org/fhir/R4/
- SNOMED CT: https://www.snomed.org/
- ICD-10: https://www.who.int/standards/classifications/classification-of-diseases
- ADR-017: RuVector Integration
- ADR-004: Plugin Architecture

---

**Last Updated:** 2026-01-24
