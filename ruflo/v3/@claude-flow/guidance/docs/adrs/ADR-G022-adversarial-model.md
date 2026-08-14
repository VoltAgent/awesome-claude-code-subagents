# ADR-G022: Adversarial Model

**Status:** Accepted
**Date:** 2026-02-01
**Author:** Guidance Control Plane Team

## Context

The governance substrate assumes agents are well-intentioned but fallible. It does not model adversarial scenarios: prompt injection through tool inputs, memory poisoning through coordinated writes, privilege escalation through shard manipulation, or collusion between agents to circumvent gates. In a multi-agent system where agents process external inputs and communicate with each other, these threat vectors are real and must be addressed at the governance layer.

## Decision

Introduce three security components: `ThreatDetector`, `CollusionDetector`, and `MemoryQuorum`.

**ThreatDetector:**
Six threat categories with configurable detection patterns:

| Category | Detection Method | Default Pattern |
|----------|-----------------|-----------------|
| `prompt-injection` | Regex + heuristic | `/ignore previous\|system prompt\|you are now\|forget instructions/i` |
| `memory-poisoning` | Regex + rate analysis | `/\b(admin\|root\|sudo)\b.*=.*true/i`, >10 writes/minute |
| `shard-manipulation` | Pattern matching | `/shard[_-]?id\|shard[_-]?override\|inject[_-]?shard/i` |
| `malicious-delegation` | Pattern matching | `/delegate.*all\|transfer.*authority\|impersonate/i` |
| `privilege-escalation` | Pattern matching | `/\b(chmod\|chown\|setuid\|capabilities)\b/i` |
| `data-exfiltration` | Regex + encoding | `/\b(curl\|wget\|fetch)\s+https?:\/\//i`, base64 blocks |

- `analyzeInput(input, context)`: scans tool inputs for injection, exfiltration
- `analyzeMemoryWrite(key, value, agentId)`: detects poisoning patterns and rate violations
- `getThreatScore(agentId)`: aggregated score (0-1) with recency weighting
- Max 10,000 signals with LRU eviction

**CollusionDetector:**
- Records inter-agent interactions as a directed graph
- `detectCollusion()` identifies three suspicious patterns:
  1. **Ring topology**: A→B→C→A coordination cycles (DFS cycle detection)
  2. **Unusual frequency**: pair interaction count exceeds threshold (default 10)
  3. **Coordinated timing**: multiple actions within a time window (default 5 seconds)
- Returns `CollusionReport` with detected flag, suspicious patterns, agents involved, and confidence scores

**MemoryQuorum:**
- Byzantine fault-tolerant consensus for critical memory operations
- `propose(key, value, proposerId)` → proposalId
- `vote(proposalId, voterId, approve)` → records vote
- `resolve(proposalId)` → checks if quorum threshold met (default 0.67 = 2/3 majority)
- Max 1,000 active proposals with oldest-first eviction
- Prevents single-agent memory poisoning by requiring multi-agent agreement

## Consequences

- Prompt injection attempts are detected before they reach the LLM context
- Memory poisoning requires defeating the quorum, not just compromising one agent
- Collusion between agents is surfaced through graph analysis
- Threat scores integrate with the TrustSystem (G017) for automated privilege reduction
- The adversarial model is defense-in-depth: detection (ThreatDetector) + prevention (MemoryQuorum) + monitoring (CollusionDetector)

## Alternatives Considered

- **Input sanitization only**: Catches known patterns but misses novel attacks; detection + prevention is stronger
- **Full Byzantine consensus (PBFT)**: Correct but requires 3f+1 agents for f faults; quorum voting is simpler for the common case
- **External security service**: Adds latency and network dependency; local-first detection is faster
