import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const baseUrl = process.env.PHASE8_BASE_URL ?? 'http://127.0.0.1:3000';
const concurrency = Number(process.env.PHASE8_CONCURRENCY ?? 20);
const iterations = Number(process.env.PHASE8_ITERATIONS ?? 20);
const cookie = process.env.PHASE8_SESSION_COOKIE ?? '';
const scenarioFile = process.env.PHASE8_SCENARIOS ?? 'docs/backend/phase-8/load-scenarios.example.json';
const scenarios = JSON.parse(await readFile(scenarioFile, 'utf8'));

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 500) throw new Error('PHASE8_CONCURRENCY must be 1..500.');
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) throw new Error('PHASE8_ITERATIONS must be 1..10000.');
if (!Array.isArray(scenarios) || scenarios.length === 0) throw new Error('At least one load scenario is required.');

const percentile = (values, p) => values.slice().sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];

async function runOne(scenario) {
  const started = performance.now();
  const response = await fetch(new URL(scenario.path, baseUrl), {
    method: scenario.method ?? 'GET',
    redirect: 'manual',
    headers: {
      accept: scenario.accept ?? 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(scenario.body ? { 'content-type': 'application/json', origin: baseUrl } : {}),
      'x-correlation-id': randomUUID(),
    },
    body: scenario.body ? JSON.stringify(scenario.body) : undefined,
  });
  await response.arrayBuffer();
  return { duration: performance.now() - started, status: response.status };
}

let failed = false;
for (const scenario of scenarios) {
  const results = [];
  for (let batch = 0; batch < iterations; batch += 1) {
    results.push(...await Promise.all(Array.from({ length: concurrency }, () => runOne(scenario))));
  }
  const durations = results.map((result) => result.duration);
  const expectedStatuses = Array.isArray(scenario.expectedStatuses) ? scenario.expectedStatuses : [200];
  const errors = results.filter((result) => !expectedStatuses.includes(result.status)).length;
  const p95 = percentile(durations, 0.95);
  const threshold = Number(scenario.p95Ms);
  const pass = errors === 0 && p95 <= threshold;
  failed ||= !pass;
  console.log(JSON.stringify({
    scenario: scenario.name,
    requests: results.length,
    concurrency,
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(p95),
    maxMs: Math.round(Math.max(...durations)),
    errors,
    expectedStatuses,
    thresholdMs: threshold,
    outcome: pass ? 'pass' : 'fail',
  }));
}
if (failed) process.exitCode = 1;

