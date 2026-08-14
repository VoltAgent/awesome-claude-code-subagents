/**
 * Validation script for hyperbolic-reasoning plugin
 * Tests all 5 MCP tools with valid data
 */

import { hyperbolicReasoningTools, getTool, getToolNames } from '../dist/mcp-tools.js';
import type { MCPToolResult } from '../dist/types.js';

// Helper to parse MCP result
function parseResult(result: MCPToolResult): { success: boolean; data: any; error?: string } {
  if (result.isError) {
    const parsed = JSON.parse(result.content[0]?.text || '{}');
    return { success: false, data: null, error: parsed.message || 'Unknown error' };
  }
  const data = JSON.parse(result.content[0]?.text || '{}');
  return { success: true, data };
}

async function validate() {
  console.log('=== Hyperbolic Reasoning Plugin Validation ===\n');

  const toolNames = getToolNames();
  console.log(`Found ${toolNames.length} tools: ${toolNames.join(', ')}\n`);

  let passed = 0;
  let failed = 0;
  const results: { tool: string; status: string; error?: string }[] = [];

  let embeddingIndexId: string | null = null;

  // Test 1: hyperbolic_embed_hierarchy
  try {
    console.log('Testing hyperbolic_embed_hierarchy...');
    const tool = getTool('hyperbolic_embed_hierarchy');
    if (!tool) throw new Error('Tool not found');

    const rawResult = await tool.handler({
      hierarchy: {
        nodes: [
          { id: 'entity', parent: null },
          { id: 'animal', parent: 'entity' },
          { id: 'mammal', parent: 'animal' },
          { id: 'dog', parent: 'mammal' },
          { id: 'cat', parent: 'mammal' },
          { id: 'bird', parent: 'animal' },
          { id: 'plant', parent: 'entity' },
          { id: 'tree', parent: 'plant' },
          { id: 'flower', parent: 'plant' }
        ],
        edges: []
      },
      model: 'poincare_ball',
      parameters: {
        dimensions: 32,
        curvature: -1.0,
        learnCurvature: false,
        epochs: 50,
        learningRate: 0.01
      }
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (!data.indexId) throw new Error('Missing indexId');
    if (typeof data.curvature !== 'number') throw new Error('Invalid response format');

    embeddingIndexId = data.indexId;
    console.log(`  OK: Index: ${data.indexId}, curvature: ${data.curvature.toFixed(2)}, nodes: ${data.totalNodes}`);
    passed++;
    results.push({ tool: 'hyperbolic_embed_hierarchy', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'hyperbolic_embed_hierarchy', status: 'FAIL', error: e.message });
  }

  // Test 2: hyperbolic_taxonomic_reason (requires embedding from test 1)
  try {
    console.log('Testing hyperbolic_taxonomic_reason...');
    const tool = getTool('hyperbolic_taxonomic_reason');
    if (!tool) throw new Error('Tool not found');

    if (!embeddingIndexId) {
      throw new Error('No embedding index available (test 1 may have failed)');
    }

    const rawResult = await tool.handler({
      query: {
        type: 'is_a',
        subject: 'dog',
        object: 'animal'
      },
      taxonomy: embeddingIndexId,
      inference: {
        transitive: true,
        fuzzy: false,
        confidence: 0.8
      }
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (typeof data.confidence !== 'number') throw new Error('Invalid response format');

    console.log(`  OK: Result: ${data.result}, confidence: ${data.confidence.toFixed(2)}`);
    passed++;
    results.push({ tool: 'hyperbolic_taxonomic_reason', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'hyperbolic_taxonomic_reason', status: 'FAIL', error: e.message });
  }

  // Test 3: hyperbolic_semantic_search (requires embedding from test 1)
  try {
    console.log('Testing hyperbolic_semantic_search...');
    const tool = getTool('hyperbolic_semantic_search');
    if (!tool) throw new Error('Tool not found');

    if (!embeddingIndexId) {
      throw new Error('No embedding index available (test 1 may have failed)');
    }

    const rawResult = await tool.handler({
      query: 'mammal',
      index: embeddingIndexId,
      searchMode: 'nearest',
      constraints: {
        maxDepth: 10
      },
      topK: 5
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (!Array.isArray(data.items)) throw new Error('Invalid response format');

    console.log(`  OK: Found ${data.items.length} items in ${data.searchTimeMs?.toFixed(2) || 'N/A'}ms`);
    passed++;
    results.push({ tool: 'hyperbolic_semantic_search', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'hyperbolic_semantic_search', status: 'FAIL', error: e.message });
  }

  // Test 4: hyperbolic_hierarchy_compare
  try {
    console.log('Testing hyperbolic_hierarchy_compare...');
    const tool = getTool('hyperbolic_hierarchy_compare');
    if (!tool) throw new Error('Tool not found');

    const rawResult = await tool.handler({
      source: {
        nodes: [
          { id: 'root', parent: null },
          { id: 'A', parent: 'root' },
          { id: 'B', parent: 'root' },
          { id: 'A1', parent: 'A' }
        ],
        edges: []
      },
      target: {
        nodes: [
          { id: 'root', parent: null },
          { id: 'A', parent: 'root' },
          { id: 'C', parent: 'root' },
          { id: 'A1', parent: 'A' }
        ],
        edges: []
      },
      alignment: 'wasserstein',
      metrics: ['structural_similarity', 'semantic_similarity']
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (typeof data.similarity !== 'number') throw new Error('Invalid response format');
    if (!Array.isArray(data.alignments)) throw new Error('Missing alignments');

    console.log(`  OK: Similarity: ${data.similarity.toFixed(3)}, alignments: ${data.alignments.length}`);
    passed++;
    results.push({ tool: 'hyperbolic_hierarchy_compare', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'hyperbolic_hierarchy_compare', status: 'FAIL', error: e.message });
  }

  // Test 5: hyperbolic_entailment_graph
  try {
    console.log('Testing hyperbolic_entailment_graph...');
    const tool = getTool('hyperbolic_entailment_graph');
    if (!tool) throw new Error('Tool not found');

    const rawResult = await tool.handler({
      action: 'build',
      concepts: [
        { id: 'c1', text: 'All dogs are mammals', type: 'universal' },
        { id: 'c2', text: 'All mammals are animals', type: 'universal' },
        { id: 'c3', text: 'Rex is a dog', type: 'instance' },
        { id: 'c4', text: 'Rex is an animal', type: 'instance' }
      ],
      entailmentThreshold: 0.7,
      transitiveClosure: true,
      pruneStrategy: 'none'
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (!data.graphId) throw new Error('Invalid response format');

    console.log(`  OK: Graph: ${data.graphId}, nodes: ${data.stats?.nodeCount || 'N/A'}`);
    passed++;
    results.push({ tool: 'hyperbolic_entailment_graph', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'hyperbolic_entailment_graph', status: 'FAIL', error: e.message });
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}/${toolNames.length}`);
  console.log(`Failed: ${failed}/${toolNames.length}`);

  if (failed > 0) {
    console.log('\nFailed tools:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.tool}: ${r.error}`);
    });
    process.exit(1);
  }

  console.log('\nAll tools validated successfully!');
}

validate().catch(e => {
  console.error('Validation error:', e);
  process.exit(1);
});
