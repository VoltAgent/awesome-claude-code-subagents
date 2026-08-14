# CLAUDE.md Analysis Report

Generated: 2026-02-01 by `@claude-flow/guidance/analyzer`

## Root CLAUDE.md (`/CLAUDE.md`)

### Composite Score: 73/100 (Grade C)

| Dimension | Score | Weight | Description |
|-----------|-------|--------|-------------|
| Structure | 55/100 | 20% | File is 648 lines; longest section is 153 lines (too long for reliable shard retrieval); constitution section exceeds recommended 60 lines |
| Coverage | 80/100 | 20% | Has build, test, and security content but missing a dedicated Architecture/Structure section |
| Enforceability | 60/100 | 25% | 28 enforcement statements (NEVER/ALWAYS/MUST) but only 1 formal rule statement; very low rule density |
| Compilability | 80/100 | 15% | Compiles to a valid PolicyBundle with shards and manifest, but constitution has no parsed rules |
| Clarity | 85/100 | 10% | 16 code blocks with good examples; mentions npm and git |
| Completeness | 100/100 | 10% | Covers all 10 expected topics (build, security, standards, errors, git, files, deps, docs, performance, deployment) |

### Key Metrics

| Metric | Value |
|--------|-------|
| Total lines | 648 |
| Content lines | 513 |
| H2 sections | 17 |
| Formal rules | 1 |
| Enforcement statements | 28 |
| Code blocks | 16 |
| Estimated shards | 17 |
| Constitution lines | 156 |
| Longest section | 153 lines |

### Findings

**Structure:**
- Constitution (top section) is 156 lines, well above the recommended 10-60 line range. The GuidanceCompiler treats the first ~60 lines as always-loaded invariants; the rest falls into shard retrieval. Exceeding 60 lines means invariants may be diluted.
- Longest section (Automatic Swarm Orchestration) is 153 lines. Sections over 50 lines reduce shard retrieval precision because the retriever treats each section as a single shard.

**Coverage:**
- Missing a dedicated `## Architecture` or `## Project Structure` section. The file describes many features but does not map out the directory layout or module boundaries.

**Enforceability:**
- While the file has 28 NEVER/ALWAYS/MUST statements, they appear in narrative prose rather than as bullet-point rules. The compiler's rule parser looks for imperative list items (e.g., `- NEVER commit secrets`), and finds only 1 matching statement. Converting the prose enforcement into list-format rules would significantly improve enforceability scoring and gate activation.

**Compilability:**
- The GuidanceCompiler successfully produces a PolicyBundle with 17 shards, but the constitution object has no parsed rules because the top section uses headers and code blocks rather than imperative list items.

### Suggestions Applied by Auto-Optimizer

| # | Action | Description | Impact |
|---|--------|-------------|--------|
| 1 | Add | Architecture/Structure section with directory layout | +4 to Coverage, now 100/100 |

### After Optimization: 77/100 (Grade C)

The auto-optimizer added the missing Architecture section, improving Coverage from 80 to 100. The remaining improvement opportunities require manual restructuring:

1. **Split the 153-line Swarm Orchestration section** into 3-4 subsections (e.g., "Swarm Init", "Agent Routing", "Complexity Detection", "Anti-Drift Config")
2. **Convert enforcement prose to list-format rules** — change `**MCP alone does NOT execute work**` to `- NEVER rely on MCP alone — always use Task tool for execution`
3. **Shorten the constitution** — move detailed configuration tables to later sections so the compiler captures core invariants

---

## v3/CLAUDE.md (`/v3/CLAUDE.md`)

### Composite Score: 64/100 (Grade D)

| Dimension | Score | Weight | Description |
|-----------|-------|--------|-------------|
| Structure | 65/100 | 20% | 15 sections, reasonable length, but longest section is 77 lines |
| Coverage | 60/100 | 20% | Missing Security and Architecture sections |
| Enforceability | 50/100 | 25% | 18 enforcement statements but 0 formal rules; very low rule density |
| Compilability | 80/100 | 15% | Compiles cleanly |
| Clarity | 85/100 | 10% | Good code blocks and formatting |
| Completeness | 60/100 | 10% | Missing security rules, coding standards, error handling |

### Suggestions Applied by Auto-Optimizer

| # | Action | Description | Impact |
|---|--------|-------------|--------|
| 1 | Add | Security section with concrete rules | +8 pts |
| 2 | Add | Architecture/Structure section | +6 pts |

### After Optimization: 78/100 (Grade C, +14 improvement)

The v3/CLAUDE.md benefited more from auto-optimization because it was missing both Security and Architecture sections. Adding these brought Coverage from 60 to 100, Enforceability from 50 to 60, and Compilability from 80 to 100.

---

## How to Run This Analysis

```bash
# From the guidance package directory
cd v3/@claude-flow/guidance

# Run the analysis script
npx tsx scripts/analyze-claude-md.ts

# Or use the API programmatically
import { analyze, autoOptimize, formatReport } from '@claude-flow/guidance/analyzer';

const result = analyze(claudeMdContent);
console.log(formatReport(result));

const optimized = autoOptimize(claudeMdContent);
console.log(optimized.benchmark.delta); // score improvement
```

## Scoring Methodology

The analyzer scores 6 dimensions, each 0-100, with weighted composition:

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| **Structure** | 20% | H1 title, H2 sections (3-5+), content length (20-200 lines), section length (<50 lines), constitution (10-60 lines) |
| **Coverage** | 20% | Build command, test command, security section, architecture section, domain rules (3+) |
| **Enforceability** | 25% | NEVER/ALWAYS/MUST count (5+), rule statements (10+), absence of vague language, rule density (>15%) |
| **Compilability** | 15% | Compiles without error, constitution has rules, produces shards (3+), valid manifest, local overlay works |
| **Clarity** | 10% | Code blocks (3+), tool mentions (3+), tables, average line length (20-100 chars) |
| **Completeness** | 10% | 10 topic checks: build/test, security, standards, errors, git, files, deps, docs, performance, deployment |

Grades: A (90+), B (80-89), C (70-79), D (60-69), F (<60)
