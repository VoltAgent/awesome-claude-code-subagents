/**
 * MCPTool *definitions* for the hooks_* family (alpha.2 — ADR-100 §Discovery).
 *
 * Pure data — name, description, inputSchema only. No handler functions.
 *
 * Subset shipped: the most-used hooks that plugin skills actually invoke
 * across the cost-tracker, intelligence, and SPARC plugins. Rationale:
 * the full hooks-tools.ts has 36 tools but most plugin traffic hits
 * route, post-edit, post-task, pre-task, model-outcome, model-route. The
 * remaining 30 stay in @claude-flow/cli for now (they pull in heavy ML
 * deps — sona-optimizer, ewc-consolidation, ruvector/*).
 *
 * If a session needs a hooks_* not in this list, it falls through to
 * @claude-flow/cli@alpha at the cost of one extra cold-cache hit.
 *
 * Description framing matches the 3.6.30 sharpening: lead with "Use when
 * native X is wrong because Y" or "Native tools have no equivalent".
 */

import type { MCPToolDef } from './memory-defs.js';

export const hooksToolDefs: MCPToolDef[] = [
  {
    name: 'hooks_route',
    description:
      'Get a 3-tier routing recommendation for a task: Tier 1 (Agent Booster, 0ms / $0 — for var-to-const, add-types, etc.), Tier 2 (Haiku — simple), Tier 3 (Sonnet/Opus — complex). Use this BEFORE spawning an agent to avoid sending simple transforms to Sonnet. Native tools have no equivalent — Claude Code does not introspect its own model-selection cost. Returns the recommended model + a `[AGENT_BOOSTER_AVAILABLE]` literal when the WASM bypass applies.',
    category: 'hooks',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description' },
        context: { type: 'string', description: 'Additional context (optional)' },
        useSemanticRouter: { type: 'boolean', description: 'Use semantic similarity routing (default: true; no-op in cli-core lite path)' },
      },
      required: ['task'],
    },
  },
  {
    name: 'hooks_pre-task',
    description:
      'Record task start + return optimal-agent suggestions, model-routing recommendations, and any cached optimization patterns for similar past tasks. Use BEFORE invoking the Task tool when you want the pre-flight insight. Output includes `[AGENT_BOOSTER_AVAILABLE]` and `[TASK_MODEL_RECOMMENDATION]` literals where applicable.',
    category: 'hooks',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Task description (will be classified for tier routing)' },
        coordinateSwarm: { type: 'boolean', description: 'If true, also coordinate via swarm topology (default: false)' },
      },
      required: ['description'],
    },
  },
  {
    name: 'hooks_post-task',
    description:
      'Record task completion outcome — success/failure flag, optional results — so future routing decisions learn from this trajectory. Pair with hooks_pre-task: the (start, end) pair feeds the SONA neural router so subsequent similar tasks pick a better tier next time. No native equivalent — Claude Code does not have a learning loop.',
    category: 'hooks',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (from hooks_pre-task)' },
        success: { type: 'boolean', description: 'Did the task succeed?' },
        storeResults: { type: 'boolean', description: 'Persist to learning bank (default: true)' },
      },
      required: ['taskId', 'success'],
    },
  },
  {
    name: 'hooks_post-edit',
    description:
      'Record an Edit/Write/MultiEdit outcome — file path, success flag — so the system can train neural patterns on what worked. Use AFTER each Edit to feed the auto-routing learning loop. The trained patterns let future similar edits route through the cheaper tier.',
    category: 'hooks',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path edited' },
        success: { type: 'boolean', description: 'Was the edit successful?' },
        trainNeural: { type: 'boolean', description: 'Train neural patterns from this outcome (default: true)' },
      },
      required: ['file'],
    },
  },
  {
    name: 'hooks_model-outcome',
    description:
      'Record the outcome of a model selection (success / escalated / failure) so the router learns which tier handled the task best. Typed equivalent of the legacy routing-outcomes namespace. Use after an applied cost-optimize recommendation closes the loop on whether the downgrade worked.',
    category: 'hooks',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description (matched against router patterns)' },
        model: { type: 'string', description: 'Model used (haiku, sonnet, opus, ...)' },
        outcome: {
          type: 'string',
          enum: ['success', 'escalated', 'failure'],
          description: 'success = handled fine; escalated = had to upgrade tier; failure = errored',
        },
      },
      required: ['task', 'model', 'outcome'],
    },
  },
  {
    name: 'hooks_model-route',
    description:
      'Recommend a model (haiku / sonnet / opus) for a given task description based on past routing-outcomes. Use when you have a task and want the router\'s opinion before paying for Sonnet. Returns null if no learned signal exists yet — fall back to your default model.',
    category: 'hooks',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description' },
      },
      required: ['task'],
    },
  },
  {
    name: 'hooks_explain',
    description:
      'Why did the router pick what it picked? Returns a human-readable explanation of the most recent routing decision for a topic — which past trajectories matched, what tier was selected, what the confidence was. Useful when an agent picks Sonnet for something you expected to route to Haiku.',
    category: 'hooks',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic/task to explain routing for' },
        detailed: { type: 'boolean', description: 'Include full trajectory matches (default: false)' },
      },
      required: ['topic'],
    },
  },
];
