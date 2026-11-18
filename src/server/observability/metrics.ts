export interface MetricSnapshot {
  readonly counters: Readonly<Record<string, number>>;
  readonly timings: Readonly<Record<string, { count: number; totalMs: number; maxMs: number }>>;
}

const counters = new Map<string, number>();
const timings = new Map<string, { count: number; totalMs: number; maxMs: number }>();

function safeName(name: string): string {
  if (!/^[a-z][a-z0-9_.-]{1,80}$/i.test(name)) throw new Error('Metric names must be bounded safe identifiers.');
  return name;
}

export function incrementMetric(name: string, amount = 1): void {
  const key = safeName(name);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Metric increments must be finite and non-negative.');
  counters.set(key, (counters.get(key) ?? 0) + amount);
}

export function observeDuration(name: string, durationMs: number): void {
  const key = safeName(name);
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error('Metric durations must be finite and non-negative.');
  const current = timings.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
  timings.set(key, {
    count: current.count + 1,
    totalMs: current.totalMs + durationMs,
    maxMs: Math.max(current.maxMs, durationMs),
  });
}

export function metricsSnapshot(): MetricSnapshot {
  return {
    counters: Object.fromEntries([...counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
    timings: Object.fromEntries([...timings.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function resetMetricsForTest(): void {
  counters.clear();
  timings.clear();
}

