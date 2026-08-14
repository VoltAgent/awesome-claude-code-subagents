# ADR-034: Legal Contract Analysis Plugin

**Status:** Proposed
**Date:** 2026-01-24
**Category:** Practical Vertical Application
**Author:** Plugin Architecture Team
**Version:** 1.0.0
**Deciders:** Plugin Architecture Team, Legal Technology Experts
**Supersedes:** None

## Context

Legal professionals spend significant time reviewing contracts, identifying risks, and ensuring compliance with regulatory requirements. Manual review is error-prone and expensive. AI-powered contract analysis can dramatically reduce review time while improving accuracy, but requires specialized understanding of legal document structure, clause semantics, and jurisdictional variations.

## Decision

Create a **Legal Contract Analysis Plugin** that leverages RuVector WASM packages for semantic clause matching, risk identification, and contract comparison with support for multiple jurisdictions and regulatory frameworks.

## Plugin Name

`@claude-flow/plugin-legal-contracts`

## Description

A comprehensive legal contract analysis plugin combining hyperbolic embeddings for legal ontology navigation with fast vector search for clause similarity. The plugin enables automated clause extraction, risk scoring, obligation tracking, and regulatory compliance checking while maintaining attorney-client privilege through on-device processing.

## Key WASM Packages

| Package | Purpose |
|---------|---------|
| `micro-hnsw-wasm` | Fast semantic search for clause similarity and precedent matching |
| `ruvector-hyperbolic-hnsw-wasm` | Legal taxonomy navigation (contract types, clause hierarchies) |
| `ruvector-attention-wasm` | Cross-attention for contract comparison (redline analysis) |
| `ruvector-dag-wasm` | Contract dependency graphs (obligations, conditions, timelines) |

## MCP Tools

### 1. `legal/clause-extract`

Extract and classify clauses from contracts.

```typescript
{
  name: 'legal/clause-extract',
  description: 'Extract and classify clauses from legal documents',
  inputSchema: {
    type: 'object',
    properties: {
      document: { type: 'string', description: 'Contract text or file path' },
      clauseTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'indemnification', 'limitation_of_liability', 'termination',
            'confidentiality', 'ip_assignment', 'governing_law', 'arbitration',
            'force_majeure', 'warranty', 'payment_terms', 'non_compete'
          ]
        }
      },
      jurisdiction: { type: 'string', default: 'US' },
      includePositions: { type: 'boolean', default: true }
    },
    required: ['document']
  }
}
```

### 2. `legal/risk-assess`

Identify and score contractual risks.

```typescript
{
  name: 'legal/risk-assess',
  description: 'Assess contractual risks with severity scoring',
  inputSchema: {
    type: 'object',
    properties: {
      document: { type: 'string' },
      partyRole: { type: 'string', enum: ['buyer', 'seller', 'licensor', 'licensee', 'employer', 'employee'] },
      riskCategories: {
        type: 'array',
        items: { type: 'string', enum: ['financial', 'operational', 'legal', 'reputational', 'compliance'] }
      },
      industryContext: { type: 'string' },
      threshold: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
    },
    required: ['document', 'partyRole']
  }
}
```

### 3. `legal/contract-compare`

Compare contracts using attention-based alignment.

```typescript
{
  name: 'legal/contract-compare',
  description: 'Compare two contracts with detailed diff and semantic alignment',
  inputSchema: {
    type: 'object',
    properties: {
      baseDocument: { type: 'string', description: 'Reference contract' },
      compareDocument: { type: 'string', description: 'Contract to compare' },
      comparisonMode: {
        type: 'string',
        enum: ['structural', 'semantic', 'full'],
        default: 'full'
      },
      highlightChanges: { type: 'boolean', default: true },
      generateRedline: { type: 'boolean', default: false }
    },
    required: ['baseDocument', 'compareDocument']
  }
}
```

### 4. `legal/obligation-track`

Extract and track obligations, deadlines, and conditions.

```typescript
{
  name: 'legal/obligation-track',
  description: 'Extract obligations, deadlines, and dependencies using DAG analysis',
  inputSchema: {
    type: 'object',
    properties: {
      document: { type: 'string' },
      party: { type: 'string', description: 'Party name to filter obligations' },
      timeframe: { type: 'string', description: 'ISO duration or date range' },
      obligationTypes: {
        type: 'array',
        items: { type: 'string', enum: ['payment', 'delivery', 'notification', 'approval', 'compliance'] }
      },
      includeDependencies: { type: 'boolean', default: true }
    },
    required: ['document']
  }
}
```

### 5. `legal/playbook-match`

Match clauses against standard playbook positions.

```typescript
{
  name: 'legal/playbook-match',
  description: 'Compare contract clauses against negotiation playbook',
  inputSchema: {
    type: 'object',
    properties: {
      document: { type: 'string' },
      playbook: { type: 'string', description: 'Playbook identifier or custom JSON' },
      strictness: { type: 'string', enum: ['strict', 'moderate', 'flexible'] },
      suggestAlternatives: { type: 'boolean', default: true },
      prioritizeClauses: { type: 'array', items: { type: 'string' } }
    },
    required: ['document', 'playbook']
  }
}
```

## Use Cases

1. **Contract Review**: Paralegals accelerate initial contract review with AI-assisted clause extraction
2. **M&A Due Diligence**: Analyze hundreds of contracts rapidly during acquisitions
3. **Compliance Audit**: Identify non-compliant clauses across contract portfolios
4. **Negotiation Support**: Compare incoming contracts against standard playbook positions
5. **Obligation Management**: Track deadlines and conditions across active contracts

## Architecture

```
+------------------+     +----------------------+     +------------------+
|  Document Input  |---->|   Legal Plugin       |---->|  Clause Index    |
|  (PDF/DOCX/TXT)  |     |  (Privacy-First)     |     | (HNSW + Hyper)   |
+------------------+     +----------------------+     +------------------+
                                   |
                         +---------+---------+
                         |         |         |
                    +----+---+ +---+----+ +--+-----+
                    |Attention| | DAG   | |Hyper-  |
                    |Compare  | |Oblig. | |bolic   |
                    +---------+ +-------+ +--------+
```

## Legal Taxonomy

```
Contract Types (Hyperbolic Embedding)
|
+-- Commercial
|   +-- Sales Agreement
|   +-- Service Agreement
|   +-- License Agreement
|   +-- Distribution Agreement
|
+-- Employment
|   +-- Employment Contract
|   +-- NDA
|   +-- Non-Compete
|
+-- Corporate
|   +-- Shareholder Agreement
|   +-- M&A Agreement
|   +-- Joint Venture
```

## Performance Targets

| Metric | Target | Baseline (Traditional) | Improvement |
|--------|--------|------------------------|-------------|
| Clause extraction | <2s for 50-page contract | ~10min (manual) | 300x |
| Risk assessment | <5s full analysis | ~2hr (attorney review) | 1440x |
| Contract comparison | <10s for two 100-page contracts | ~4hr (redlining) | 1440x |
| Obligation extraction | <3s per contract | ~30min (paralegal) | 600x |
| Playbook matching | <1s per clause | ~5min (lookup) | 300x |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missed critical clause | Low | High | Confidence scores, mandatory human review for low confidence |
| Privilege breach | Low | Critical | On-device processing, no cloud transmission |
| Jurisdictional errors | Medium | Medium | Multi-jurisdiction training, jurisdiction flagging |
| Over-reliance on AI | Medium | High | Clear disclaimers, attorney-in-the-loop design |

## Security Considerations

### CRITICAL: Attorney-Client Privilege Protection

| Requirement | Implementation | Severity |
|-------------|----------------|----------|
| **Privilege Preservation** | Zero-knowledge processing - no document content transmitted | CRITICAL |
| **Work Product Protection** | Analysis results encrypted, attorney-eyes-only by default | CRITICAL |
| **Document Isolation** | Each matter processed in isolated WASM instance | CRITICAL |
| **Chain of Custody** | Cryptographic proof of document handling | HIGH |
| **Conflict Detection** | Prevent cross-matter data leakage | HIGH |

### Input Validation (CRITICAL)

All MCP tool inputs MUST be validated using Zod schemas:

```typescript
// legal/clause-extract input validation
const ClauseExtractSchema = z.object({
  document: z.string().max(10_000_000), // 10MB max document size
  clauseTypes: z.array(z.enum([
    'indemnification', 'limitation_of_liability', 'termination',
    'confidentiality', 'ip_assignment', 'governing_law', 'arbitration',
    'force_majeure', 'warranty', 'payment_terms', 'non_compete'
  ])).optional(),
  jurisdiction: z.string().max(50).default('US'),
  includePositions: z.boolean().default(true)
}).refine(doc => !containsExecutableContent(doc.document), {
  message: 'Document contains potentially malicious content'
});

// legal/risk-assess input validation
const RiskAssessSchema = z.object({
  document: z.string().max(10_000_000),
  partyRole: z.enum(['buyer', 'seller', 'licensor', 'licensee', 'employer', 'employee']),
  riskCategories: z.array(z.enum(['financial', 'operational', 'legal', 'reputational', 'compliance'])).optional(),
  industryContext: z.string().max(200).optional(),
  threshold: z.enum(['low', 'medium', 'high', 'critical']).optional()
});

// legal/contract-compare input validation
const ContractCompareSchema = z.object({
  baseDocument: z.string().max(10_000_000),
  compareDocument: z.string().max(10_000_000),
  comparisonMode: z.enum(['structural', 'semantic', 'full']).default('full'),
  highlightChanges: z.boolean().default(true),
  generateRedline: z.boolean().default(false)
});

// Path traversal prevention for file inputs
function validateFilePath(path: string): boolean {
  const normalized = path.normalize(path);
  const resolved = path.resolve(normalized);
  return resolved.startsWith(ALLOWED_DOCUMENT_ROOT) &&
         !normalized.includes('..') &&
         !normalized.includes('\0');
}
```

### WASM Security Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Memory Limit | 2GB max | Handle large contract documents |
| CPU Time Limit | 120 seconds per operation | Allow complex multi-document comparison |
| No Network Access | Enforced by WASM sandbox | Privilege protection |
| No File System Access | Sandboxed, matter-isolated FS only | Cross-matter isolation |
| Instance Isolation | New WASM instance per matter | Prevent data leakage between matters |

### Matter Isolation (CRITICAL)

```typescript
// Each legal matter MUST have isolated processing
interface MatterIsolation {
  matterId: string;           // Unique matter identifier
  wasmInstance: WebAssembly.Instance; // Dedicated WASM instance
  memoryRegion: ArrayBuffer;  // Isolated memory
  documentHashes: string[];   // Track which documents processed
  accessLog: AuditEntry[];    // Matter-specific audit trail
}

// CRITICAL: Prevent cross-matter contamination
async function processDocument(matterId: string, document: string): Promise<AnalysisResult> {
  const isolation = await getMatterIsolation(matterId);

  // Verify no cross-matter access
  if (isolation.matterId !== matterId) {
    throw new SecurityError('Cross-matter access violation');
  }

  // Process in isolated instance
  return isolation.wasmInstance.exports.analyze(document);
}
```

### Authentication & Authorization

```typescript
// Required role-based access control for legal tools
const LegalRoles = {
  PARTNER: ['clause-extract', 'risk-assess', 'contract-compare', 'obligation-track', 'playbook-match'],
  ASSOCIATE: ['clause-extract', 'risk-assess', 'contract-compare', 'obligation-track'],
  PARALEGAL: ['clause-extract', 'obligation-track'],
  CONTRACT_MANAGER: ['obligation-track', 'playbook-match'],
  CLIENT: [] // No direct tool access - results only via attorney
};

// Ethical wall enforcement
interface EthicalWall {
  matterId: string;
  blockedUsers: string[];     // Users who cannot access this matter
  reason: string;             // Conflict reason (encrypted)
  createdBy: string;          // Partner who created wall
  createdAt: string;
}
```

### Audit Logging Requirements (Legal Ethics)

```typescript
interface LegalAuditLog {
  timestamp: string;          // ISO 8601
  userId: string;             // Authenticated user ID
  userRole: string;           // Role at time of access
  matterId: string;           // Matter accessed
  toolName: string;           // MCP tool invoked
  documentHash: string;       // Hash of document processed (not content)
  operationType: 'analyze' | 'compare' | 'export';
  resultSummary: string;      // High-level result (no privileged content)
  billingCode?: string;       // Optional billing reference
}

// Audit logs MUST be:
// - Encrypted at rest (AES-256)
// - Accessible only to ethics/compliance
// - Retained per jurisdiction requirements (typically 7+ years)
// - Not contain actual document content
```

### Identified Security Risks

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| LEG-SEC-001 | **CRITICAL** | Privilege breach via embedding leakage | No document content in embeddings, position-only analysis |
| LEG-SEC-002 | **CRITICAL** | Cross-matter data contamination | Isolated WASM instances per matter |
| LEG-SEC-003 | **HIGH** | Unauthorized document access | Role-based access, ethical wall enforcement |
| LEG-SEC-004 | **HIGH** | Work product disclosure | Client-side encryption, no cloud processing |
| LEG-SEC-005 | **MEDIUM** | Metadata leakage (document names, dates) | Metadata encryption, hash-based references |

### Document Security

```typescript
// Document handling security
interface SecureDocumentHandler {
  // Sanitize document before processing
  sanitize(document: string): string;  // Remove macros, scripts

  // Validate document format
  validateFormat(document: string): ValidationResult;

  // Extract text safely (no code execution)
  extractText(document: Buffer, format: 'pdf' | 'docx'): string;

  // Verify document integrity
  verifyIntegrity(document: Buffer, expectedHash: string): boolean;
}

// Prevent malicious document attacks
function sanitizeDocument(content: string): string {
  // Remove potential script injections
  // Remove embedded objects that could execute
  // Validate character encoding
  // Strip metadata that could leak information
}
```

### Privacy & Privilege

- **On-Device Processing**: All analysis happens locally via WASM
- **No Cloud Transmission**: Documents never leave the user's system
- **Privilege Protection**: Maintains attorney-client privilege through zero-knowledge design
- **Audit Logging**: Comprehensive logging for ethics compliance (content-free)
- **Ethical Wall Support**: Built-in conflict checking and access barriers

## Implementation Notes

### Phase 1: Core Extraction
- PDF/DOCX parsing with layout preservation
- Clause boundary detection
- Basic clause classification

### Phase 2: Semantic Analysis
- Legal-domain embeddings
- HNSW index for precedent matching
- Hyperbolic ontology for legal taxonomy

### Phase 3: Advanced Features
- Attention-based contract comparison
- DAG-based obligation tracking
- Playbook negotiation support

## Dependencies

```json
{
  "dependencies": {
    "micro-hnsw-wasm": "^0.2.0",
    "ruvector-hyperbolic-hnsw-wasm": "^0.1.0",
    "ruvector-attention-wasm": "^0.1.0",
    "ruvector-dag-wasm": "^0.1.0",
    "pdf-parse": "^1.1.1",
    "mammoth": "^1.6.0"
  }
}
```

## Consequences

### Positive
- 10x faster contract review with consistent quality
- Maintains attorney-client privilege through local processing
- Scalable across contract portfolios

### Negative
- Requires domain-specific training data for accuracy
- May miss nuanced legal arguments
- Not a replacement for legal judgment

### Neutral
- Designed as attorney augmentation, not replacement
- Confidence scores indicate when human review is critical

## Related ADRs

| ADR | Relationship |
|-----|--------------|
| ADR-004: Plugin Architecture | Foundation - Defines plugin structure |
| ADR-017: RuVector Integration | Dependency - Provides WASM packages |
| ADR-041: Hyperbolic Reasoning | Related - Legal taxonomy navigation |
| ADR-035: Code Intelligence | Related - Shares DAG analysis patterns |

## References

- Model Rules of Professional Conduct: https://www.americanbar.org/groups/professional_responsibility/
- IACCM Contract Complexity Index
- ADR-017: RuVector Integration
- ADR-004: Plugin Architecture

---

**Last Updated:** 2026-01-24
