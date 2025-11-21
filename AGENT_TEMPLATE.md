# Agent Template - Anthropic Best Practices

This template follows Anthropic's "Building Effective Agents" guide principles:
- Start simple, add complexity only when needed
- Choose the right workflow pattern for the task
- Invest in tool design (ACI - Agent-Computer Interface)
- Maintain transparency in planning and reasoning
- Include clear guidance on when NOT to use agents

## Template Structure

```yaml
---
name: agent-name
description: One-line description of when to use this agent
tools: [Minimal required tools for this role]
---

# Role

[2-3 sentence role definition. Be specific about expertise and primary focus.]

# When to Use This Agent

Use this agent when:
- [Specific scenario 1]
- [Specific scenario 2]
- [Tasks that benefit from this agent's pattern]

# When NOT to Use

Prefer simpler approaches when:
- [Scenario where a single prompt would suffice]
- [Scenario where another agent is more appropriate]
- [Tasks that don't require this agent's complexity]

# Workflow Pattern

[Choose ONE pattern that matches this agent's work style:]

## Pattern: [Prompt Chaining | Routing | Parallelization | Orchestrator-Workers | Evaluator-Optimizer]

[Brief explanation of how this agent applies the pattern]

# Core Process

1. **[Step Name]**: [Concrete action with expected output]
2. **[Step Name]**: [Concrete action with expected output]
3. **[Step Name]**: [Concrete action with expected output]

# Tool Usage

**Primary tools and their purpose:**
- `[Tool]`: [How this agent uses it]
- `[Tool]`: [How this agent uses it]

# Error Handling

- **[Error type]**: [Recovery strategy]
- **[Error type]**: [Recovery strategy]

# Collaboration

- **Escalate to**: [Agent name] when [condition]
- **Hand off to**: [Agent name] for [task type]

# Example

**Task**: [Concrete example task]

**Approach**:
1. [What the agent does first]
2. [Next step]
3. [Final output]
```

## Workflow Patterns Reference

### 1. Prompt Chaining
Sequential steps where each builds on the previous output.
**Best for**: Code review, documentation generation, step-by-step analysis
**Structure**: Input → Step 1 → Step 2 → ... → Final Output

### 2. Routing
Classify input and delegate to specialized handling.
**Best for**: Support tickets, multi-domain queries, architecture decisions
**Structure**: Input → Classify → Route to Specialist → Output

### 3. Parallelization
Execute independent subtasks concurrently.
**Best for**: Multi-file analysis, test execution, security scanning
**Structure**: Input → Split → [Parallel Tasks] → Merge Results

### 4. Orchestrator-Workers
Central coordinator dynamically delegates to worker agents.
**Best for**: Complex multi-step tasks, agent coordination, workflow management
**Structure**: Orchestrator → [Dynamic Worker Assignment] → Synthesis

### 5. Evaluator-Optimizer
Iterative refinement with evaluation feedback.
**Best for**: Code optimization, prompt engineering, quality improvement
**Structure**: Generate → Evaluate → Refine → [Loop until satisfied]
