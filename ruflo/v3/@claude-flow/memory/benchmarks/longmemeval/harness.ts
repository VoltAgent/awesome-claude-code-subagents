/**
 * LongMemEval Benchmark Harness for AgentDB
 *
 * ADR-088: Full LongMemEval benchmark implementation
 *
 * Usage:
 *   npx tsx harness.ts --mode raw --limit 50      # Quick test (50 questions)
 *   npx tsx harness.ts --mode raw                  # Full benchmark (500 questions)
 *   npx tsx harness.ts --mode hybrid               # With Haiku reranking
 *   npx tsx harness.ts --mode baseline             # Plain cosine baseline
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Session,
  Question,
  QuestionResult,
  CategoryResult,
  BenchmarkReport,
  BenchmarkMode,
  MemoryAdapter,
  QuestionType,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI Args ──────────────────────────────────────────────────

function parseArgs(): { mode: BenchmarkMode; limit: number; dataDir: string; adapter: string } {
  const args = process.argv.slice(2);
  let mode: BenchmarkMode = 'raw';
  let limit = 0; // 0 = all
  let dataDir = join(__dirname, 'data');
  let adapter = 'agentdb';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode': mode = (args[++i] as BenchmarkMode) || 'raw'; break;
      case '--limit': limit = parseInt(args[++i], 10) || 0; break;
      case '--data': dataDir = args[++i]; break;
      case '--adapter': adapter = args[++i]; break;
    }
  }

  return { mode, limit, dataDir, adapter };
}

// ── Dataset Loading ───────────────────────────────────────────

function loadDataset(dataDir: string): { sessions: Session[]; questions: Question[] } {
  const oracleFile = join(dataDir, 'longmemeval_oracle.json');
  if (!existsSync(oracleFile)) {
    console.error(`Dataset not found at ${oracleFile}`);
    console.error('Run: bash scripts/download-dataset.sh');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(oracleFile, 'utf-8'));

  // LongMemEval format: array of items with sessions + question
  const sessions: Session[] = [];
  const questions: Question[] = [];
  const seenSessions = new Set<string>();

  for (const item of raw) {
    // Extract sessions
    if (item.sessions) {
      for (const sess of item.sessions) {
        if (!seenSessions.has(sess.session_id)) {
          seenSessions.add(sess.session_id);
          sessions.push(sess);
        }
      }
    }

    // Extract question
    if (item.question) {
      questions.push({
        question_id: item.question_id ?? item.id ?? `q-${questions.length}`,
        question: item.question,
        answer: item.answer ?? item.answers ?? '',
        question_type: mapQuestionType(item.question_type ?? item.type ?? ''),
        evidence_session_ids: item.evidence_session_ids ?? [],
        num_hops: item.num_hops ?? 1,
      });
    }
  }

  return { sessions, questions };
}

function mapQuestionType(raw: string): QuestionType {
  const normalized = raw.toLowerCase().replace(/[^a-z-]/g, '-');
  const mapping: Record<string, QuestionType> = {
    'single-session-single-hop': 'single-session-single-hop',
    'single-session-multi-hop': 'single-session-multi-hop',
    'multi-session-single-hop': 'multi-session-single-hop',
    'multi-session-multi-hop': 'multi-session-multi-hop',
    'knowledge-update': 'knowledge-update',
    'temporal-reasoning': 'temporal-reasoning',
  };
  return mapping[normalized] ?? 'single-session-single-hop';
}

// ── Answer Evaluation ─────────────────────────────────────────

function evaluateAnswer(predicted: string, gold: string | string[]): boolean {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, '');
  const pred = normalize(predicted);

  const golds = Array.isArray(gold) ? gold : [gold];

  for (const g of golds) {
    const ng = normalize(g);
    // Exact match
    if (pred === ng) return true;
    // Contains match (lenient — official eval is more nuanced)
    if (pred.includes(ng) || ng.includes(pred)) return true;
  }
  return false;
}

// ── Answer Generation ─────────────────────────────────────────

async function generateAnswer(
  question: string,
  context: Array<{ content: string; score: number }>,
  mode: BenchmarkMode
): Promise<string> {
  // Raw mode: extract answer directly from top retrieved chunk
  if (mode === 'raw' || mode === 'baseline') {
    // Simple extractive: return the most relevant chunk
    // A real system would use an LLM here, but raw mode = zero API
    return context.length > 0 ? context[0].content : '';
  }

  // Hybrid / Full mode: use Haiku for answer generation
  if (mode === 'hybrid' || mode === 'full') {
    const contextText = context
      .slice(0, 5)
      .map((c, i) => `[${i + 1}] ${c.content}`)
      .join('\n\n');

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic();

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `Based on the following conversation excerpts, answer the question concisely.\n\nContext:\n${contextText}\n\nQuestion: ${question}\n\nAnswer (be concise, just the answer):`,
          },
        ],
      });

      const block = response.content[0];
      return block.type === 'text' ? block.text.trim() : '';
    } catch (err) {
      console.warn(`[Haiku] Failed: ${(err as Error).message}`);
      return context.length > 0 ? context[0].content : '';
    }
  }

  return '';
}

// ── Percentile Calculation ────────────────────────────────────

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Main Benchmark ────────────────────────────────────────────

async function main() {
  const { mode, limit, dataDir, adapter: adapterName } = parseArgs();

  console.log('=== LongMemEval Benchmark for AgentDB ===');
  console.log(`Mode:    ${mode}`);
  console.log(`Adapter: ${adapterName}`);
  console.log(`Limit:   ${limit || 'all'}`);
  console.log('');

  // Load dataset
  console.log('[1/5] Loading dataset...');
  const { sessions, questions } = loadDataset(dataDir);
  const evalQuestions = limit > 0 ? questions.slice(0, limit) : questions;
  console.log(`  Sessions: ${sessions.length}, Questions: ${evalQuestions.length}/${questions.length}`);

  // Initialize adapter
  console.log(`[2/5] Initializing ${adapterName} adapter...`);
  let adapter: MemoryAdapter;

  if (adapterName === 'baseline') {
    const { BaselineAdapter } = await import('./adapters/baseline-adapter.js');
    adapter = new BaselineAdapter();
  } else {
    const { AgentDBAdapter } = await import('./adapters/agentdb-adapter.js');
    adapter = new AgentDBAdapter();
  }

  await adapter.init();

  // Ingest sessions
  console.log('[3/5] Ingesting sessions...');
  const ingestStart = performance.now();
  let totalMessages = 0;

  for (let i = 0; i < sessions.length; i++) {
    await adapter.ingestSession(sessions[i]);
    totalMessages += sessions[i].messages.length;
    if ((i + 1) % 50 === 0 || i === sessions.length - 1) {
      process.stdout.write(`  Ingested ${i + 1}/${sessions.length} sessions (${totalMessages} messages)\r`);
    }
  }
  const ingestMs = performance.now() - ingestStart;
  console.log(`\n  Ingestion complete in ${(ingestMs / 1000).toFixed(1)}s`);

  // Evaluate questions
  console.log('[4/5] Evaluating questions...');
  const results: QuestionResult[] = [];
  let correct = 0;

  for (let i = 0; i < evalQuestions.length; i++) {
    const q = evalQuestions[i];

    // Retrieve
    const retStart = performance.now();
    const retrieved = await adapter.retrieve(q.question);
    const retrievalMs = performance.now() - retStart;

    // Generate answer
    const genStart = performance.now();
    const predicted = await generateAnswer(q.question, retrieved, mode);
    const generationMs = performance.now() - genStart;

    // Evaluate
    const isCorrect = evaluateAnswer(predicted, q.answer);
    if (isCorrect) correct++;

    results.push({
      question_id: q.question_id,
      question_type: q.question_type,
      predicted_answer: predicted.slice(0, 200),
      gold_answer: q.answer,
      correct: isCorrect,
      retrieval_time_ms: Math.round(retrievalMs * 100) / 100,
      generation_time_ms: Math.round(generationMs * 100) / 100,
      retrieved_chunks: retrieved.length,
    });

    if ((i + 1) % 25 === 0 || i === evalQuestions.length - 1) {
      const pct = ((correct / (i + 1)) * 100).toFixed(1);
      process.stdout.write(`  ${i + 1}/${evalQuestions.length} — ${correct}/${i + 1} correct (${pct}%)\r`);
    }
  }

  const overallAccuracy = (correct / evalQuestions.length) * 100;
  console.log(`\n  Overall: ${correct}/${evalQuestions.length} (${overallAccuracy.toFixed(1)}%)`);

  // Per-category breakdown
  const categories = new Map<QuestionType, { total: number; correct: number; retMs: number[]; genMs: number[] }>();
  for (const r of results) {
    const cat = categories.get(r.question_type) ?? { total: 0, correct: 0, retMs: [], genMs: [] };
    cat.total++;
    if (r.correct) cat.correct++;
    cat.retMs.push(r.retrieval_time_ms);
    cat.genMs.push(r.generation_time_ms);
    categories.set(r.question_type, cat);
  }

  const byCategory: CategoryResult[] = [...categories.entries()].map(([type, cat]) => ({
    question_type: type,
    total: cat.total,
    correct: cat.correct,
    accuracy: Math.round((cat.correct / cat.total) * 10000) / 100,
    avg_retrieval_ms: Math.round(cat.retMs.reduce((a, b) => a + b, 0) / cat.retMs.length * 100) / 100,
    avg_generation_ms: Math.round(cat.genMs.reduce((a, b) => a + b, 0) / cat.genMs.length * 100) / 100,
  }));

  // Latency stats
  const allRetMs = results.map(r => r.retrieval_time_ms);
  const allGenMs = results.map(r => r.generation_time_ms);

  // Storage stats
  const stats = await adapter.getStats();

  // Build report
  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    mode,
    system: adapter.name,
    version: '3.5.78',
    overall: {
      total: evalQuestions.length,
      correct,
      accuracy: Math.round(overallAccuracy * 100) / 100,
    },
    by_category: byCategory,
    latency: {
      retrieval_p50_ms: percentile(allRetMs, 50),
      retrieval_p95_ms: percentile(allRetMs, 95),
      retrieval_p99_ms: percentile(allRetMs, 99),
      generation_p50_ms: percentile(allGenMs, 50),
      generation_p95_ms: percentile(allGenMs, 95),
    },
    storage: {
      sessions_ingested: sessions.length,
      total_messages: totalMessages,
      db_size_bytes: stats.sizeBytes,
      index_size_bytes: 0,
    },
    config: {
      embedding_model: 'all-MiniLM-L6-v2',
      embedding_dims: 384,
      hnsw_m: 16,
      hnsw_ef_search: 100,
      top_k: 10,
      similarity_threshold: 0.3,
    },
  };

  // Save report
  console.log('[5/5] Saving report...');
  const resultsDir = join(__dirname, 'results');
  mkdirSync(resultsDir, { recursive: true });

  const reportFile = join(resultsDir, `report-${mode}-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`  Report: ${reportFile}`);

  // Save detailed results
  const detailFile = join(resultsDir, `details-${mode}-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(detailFile, JSON.stringify(results, null, 2) + '\n', 'utf-8');
  console.log(`  Details: ${detailFile}`);

  // Print summary table
  console.log('');
  console.log('=== Results ===');
  console.log(`System:   ${adapter.name}`);
  console.log(`Mode:     ${mode}`);
  console.log(`Overall:  ${report.overall.accuracy}% (${correct}/${evalQuestions.length})`);
  console.log('');
  console.log('By Category:');
  console.log('  Type                          | Total | Correct | Accuracy');
  console.log('  ------------------------------|-------|---------|--------');
  for (const cat of byCategory) {
    const name = cat.question_type.padEnd(30);
    console.log(`  ${name}| ${String(cat.total).padStart(5)} | ${String(cat.correct).padStart(7)} | ${cat.accuracy.toFixed(1)}%`);
  }
  console.log('');
  console.log('Latency:');
  console.log(`  Retrieval p50: ${report.latency.retrieval_p50_ms.toFixed(1)}ms`);
  console.log(`  Retrieval p95: ${report.latency.retrieval_p95_ms.toFixed(1)}ms`);
  console.log(`  Retrieval p99: ${report.latency.retrieval_p99_ms.toFixed(1)}ms`);

  // Cleanup
  await adapter.close();
  console.log('');
  console.log('Benchmark complete.');
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
