# ProofNest Auditable Agents

**Tamper-evident AI agent decisions. Bitcoin-anchored. Quantum-proof.**

This category contains agents enhanced with [ProofNest SDK](https://github.com/Proofnest/proofnest) integration for:

- **Auditable decisions** - Every agent action is logged to a hash chain
- **Bitcoin timestamps** - Proof of WHEN decisions were made
- **Quantum-safe signatures** - Dilithium3 cryptographic signatures
- **Compliance-ready** - EU AI Act, SOC 2, HIPAA compatible

## Why Auditable Agents?

Standard agents execute tasks but leave no verifiable trail:

```
User: "Approve this loan"
Agent: "Approved"
Later: "Did the agent really say that? When? Why?"
Answer: ¯\_(ツ)_/¯
```

ProofNest-enabled agents create cryptographic proof:

```
User: "Approve this loan"
Agent: "Approved" + ProofBundle{
  hash: "7f3a8b2c...",
  signature: "Dilithium3...",
  bitcoin_anchor: "block #820000",
  timestamp: "2025-12-26T14:00:00Z"
}
Later: "Did the agent really say that?"
Answer: ✅ VERIFIED against Bitcoin blockchain
```

## Available Auditable Agents

| Agent | Base Agent | Use Case |
|-------|------------|----------|
| [auditable-code-reviewer](auditable-code-reviewer.md) | code-reviewer | Security audits with proof |
| [auditable-security-auditor](auditable-security-auditor.md) | security-auditor | Compliance verification |
| [auditable-architect-reviewer](auditable-architect-reviewer.md) | architect-reviewer | Architecture decisions |
| [auditable-compliance-auditor](auditable-compliance-auditor.md) | compliance-auditor | Regulatory compliance |
| [auditable-financial-advisor](auditable-financial-advisor.md) | fintech-engineer | Financial decisions |

## Quick Start

### 1. Install ProofNest

```bash
pip install proofnest
```

### 2. Use an Auditable Agent

Copy any auditable agent definition to your `.claude/agents/` folder.

### 3. Verify Decisions

```python
from proofnest import Bundle

# Load proof from agent output
bundle = Bundle.from_file("decision.proof.json")

# Verify cryptographic integrity
assert bundle.verify()  # True = tamper-evident

# Check Bitcoin anchor
print(bundle.anchor.bitcoin_block)  # Block #820000
print(bundle.anchor.timestamp)       # 2025-12-26T14:00:00Z
```

## Integration Pattern

Every auditable agent includes this section:

```markdown
## ProofNest Integration

This agent logs all decisions to ProofNest for auditability.

Decision logging:
- Action recorded with reasoning
- Risk level assessed
- Alternatives considered
- Hash chain maintained
- Bitcoin anchor created

Verification:
pip install proofnest
python -c "from proofnest import Bundle; Bundle.from_file('proof.json').verify()"
```

## Use Cases

| Industry | Requirement | Solution |
|----------|-------------|----------|
| **Finance** | Explainable AI decisions | Auditable loan/trading agents |
| **Healthcare** | HIPAA compliance | Auditable diagnosis agents |
| **Legal** | Attorney-client records | Auditable legal advisors |
| **Government** | FOIA requests | Auditable public service agents |
| **EU AI Act** | High-risk AI logging | All auditable agents |

## Learn More

- [ProofNest SDK](https://github.com/Proofnest/proofnest) - Core library
- [ProofNest Anchor](https://github.com/Proofnest/proofnest-anchor) - CLI tool
- [Documentation](https://proofnest.io) - Full documentation

---

*Proof, not promises. Quantum-ready trust infrastructure for AI agents.*

(c) 2025 Stellanium Ltd. Apache-2.0 License.
