# ProofNest Auditable Agents

**Tamper-evident AI agent decisions. Bitcoin-anchored. Quantum-proof.**

This category contains agents enhanced with [ProofNest SDK](https://github.com/Proofnest/proofnest) integration for:

- **Auditable decisions** - Every agent action is logged to a hash chain
- **Bitcoin timestamps** - Proof of WHEN decisions were made
- **Quantum-safe signatures** - Dilithium3 cryptographic signatures
- **Audit support** - Verifiable records for various compliance needs

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
| [auditable-code-reviewer](auditable-code-reviewer.md) | code-reviewer | Code review with verifiable findings |
| [auditable-security-auditor](auditable-security-auditor.md) | security-auditor | Security assessments with audit trail |
| [auditable-financial-advisor](auditable-financial-advisor.md) | fintech-engineer | Financial recommendations with records |

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

| Industry | Need | How ProofNest Helps |
|----------|------|---------------------|
| **Finance** | Explainable AI decisions | Verifiable decision logs |
| **Healthcare** | Record keeping | Tamper-evident audit trails |
| **Legal** | Client records | Timestamped, signed decisions |
| **Government** | Transparency | Cryptographically verifiable records |
| **AI Development** | Responsible AI | Auditable agent behavior |

*Note: ProofNest provides cryptographic verification tools. Consult compliance experts for specific regulatory requirements.*

## Learn More

- [ProofNest SDK](https://github.com/Proofnest/proofnest) - Core library
- [ProofNest Anchor](https://github.com/Proofnest/proofnest-anchor) - CLI tool
- [Documentation](https://proofnest.io) - Full documentation

---

*Proof, not promises. Quantum-ready trust infrastructure for AI agents.*

(c) 2025 Stellanium Ltd. Apache-2.0 License.
