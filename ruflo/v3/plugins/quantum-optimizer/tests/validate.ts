/**
 * Validation script for quantum-optimizer plugin
 * Tests all 5 MCP tools with valid data
 */

import { quantumOptimizerTools, getTool, getToolNames } from '../dist/mcp-tools.js';
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
  console.log('=== Quantum Optimizer Plugin Validation ===\n');

  const toolNames = getToolNames();
  console.log(`Found ${toolNames.length} tools: ${toolNames.join(', ')}\n`);

  let passed = 0;
  let failed = 0;
  const results: { tool: string; status: string; error?: string }[] = [];

  // Test 1: quantum_annealing_solve
  try {
    console.log('Testing quantum_annealing_solve...');
    const tool = getTool('quantum_annealing_solve');
    if (!tool) throw new Error('Tool not found');

    const rawResult = await tool.handler({
      problem: {
        type: 'qubo',
        variables: 5,
        objective: { '0': -1, '1': -1, '2': -1, '3': -1, '4': -1, '0,1': 2, '1,2': 2, '2,3': 2, '3,4': 2 }
      },
      parameters: {
        numReads: 100,
        annealingTime: 10,
        temperature: { initial: 100, final: 0.01, type: 'exponential' }
      },
      embedding: 'auto'
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (!data.solution) throw new Error('Invalid response format');
    if (typeof data.solution.energy !== 'number') throw new Error('Missing energy');

    console.log(`  OK: Energy: ${data.solution.energy.toFixed(2)}, samples: ${data.samples?.length || 0}`);
    passed++;
    results.push({ tool: 'quantum_annealing_solve', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'quantum_annealing_solve', status: 'FAIL', error: e.message });
  }

  // Test 2: quantum_qaoa_optimize
  try {
    console.log('Testing quantum_qaoa_optimize...');
    const tool = getTool('quantum_qaoa_optimize');
    if (!tool) throw new Error('Tool not found');

    const rawResult = await tool.handler({
      problem: {
        type: 'max_cut',
        graph: {
          nodes: 4,
          edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]],
          weights: [1.0, 1.0, 1.0, 1.0, 0.5]
        }
      },
      circuit: {
        depth: 2,
        optimizer: 'cobyla',
        initialParams: 'heuristic'
      },
      shots: 512
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (!data.solution) throw new Error('Invalid response format');
    if (typeof data.approximationRatio !== 'number') throw new Error('Missing approximationRatio');

    console.log(`  OK: Approx ratio: ${data.approximationRatio.toFixed(3)}, energy: ${data.solution.energy.toFixed(2)}`);
    passed++;
    results.push({ tool: 'quantum_qaoa_optimize', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'quantum_qaoa_optimize', status: 'FAIL', error: e.message });
  }

  // Test 3: quantum_grover_search
  try {
    console.log('Testing quantum_grover_search...');
    const tool = getTool('quantum_grover_search');
    if (!tool) throw new Error('Tool not found');

    const rawResult = await tool.handler({
      searchSpace: {
        size: 1000,
        oracle: 'element == 42',
        structure: 'unstructured'
      },
      targets: 1,
      iterations: 'optimal',
      amplification: {
        method: 'standard'
      }
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (!Array.isArray(data.solutions)) throw new Error('Invalid response format');
    if (typeof data.queries !== 'number') throw new Error('Missing queries');

    console.log(`  OK: Found ${data.solutions.length} solutions in ${data.queries} queries`);
    passed++;
    results.push({ tool: 'quantum_grover_search', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'quantum_grover_search', status: 'FAIL', error: e.message });
  }

  // Test 4: quantum_dependency_resolve
  try {
    console.log('Testing quantum_dependency_resolve...');
    const tool = getTool('quantum_dependency_resolve');
    if (!tool) throw new Error('Tool not found');

    const rawResult = await tool.handler({
      packages: [
        { name: 'react', version: '^18.0.0', dependencies: { 'react-dom': '^18.0.0' }, size: 100000 },
        { name: 'react-dom', version: '^18.0.0', dependencies: { scheduler: '^0.23.0' }, size: 120000 },
        { name: 'scheduler', version: '^0.23.0', dependencies: {}, size: 50000 },
        { name: 'typescript', version: '^5.0.0', dependencies: {}, size: 200000 }
      ],
      constraints: {
        minimize: 'size',
        includePeer: true,
        timeout: 5000
      },
      solver: 'quantum_annealing'
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (!data.resolved) throw new Error('Invalid response format');
    if (!Array.isArray(data.installOrder)) throw new Error('Missing installOrder');

    console.log(`  OK: Resolved ${Object.keys(data.resolved).length} packages, install order: ${data.installOrder.length}`);
    passed++;
    results.push({ tool: 'quantum_dependency_resolve', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'quantum_dependency_resolve', status: 'FAIL', error: e.message });
  }

  // Test 5: quantum_schedule_optimize
  try {
    console.log('Testing quantum_schedule_optimize...');
    const tool = getTool('quantum_schedule_optimize');
    if (!tool) throw new Error('Tool not found');

    const rawResult = await tool.handler({
      tasks: [
        { id: 'task1', duration: 10, dependencies: [], resources: ['cpu'], priority: 1 },
        { id: 'task2', duration: 5, dependencies: ['task1'], resources: ['cpu'], priority: 2 },
        { id: 'task3', duration: 8, dependencies: ['task1'], resources: ['gpu'], priority: 1 },
        { id: 'task4', duration: 3, dependencies: ['task2', 'task3'], resources: ['cpu'], priority: 3 }
      ],
      resources: [
        { id: 'cpu', capacity: 2, cost: 1.0 },
        { id: 'gpu', capacity: 1, cost: 2.0 }
      ],
      objective: 'makespan'
    });

    const { success, data, error } = parseResult(rawResult);
    if (!success) throw new Error(error);
    if (!data.schedule) throw new Error('Invalid response format');
    if (typeof data.makespan !== 'number') throw new Error('Missing makespan');

    console.log(`  OK: Makespan: ${data.makespan}, cost: ${data.cost.toFixed(2)}`);
    passed++;
    results.push({ tool: 'quantum_schedule_optimize', status: 'PASS' });
  } catch (e: any) {
    console.log(`  FAIL: ${e.message}`);
    failed++;
    results.push({ tool: 'quantum_schedule_optimize', status: 'FAIL', error: e.message });
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
