import { beforeEach, describe, expect, it, vi } from 'vitest';
import { operationalLog } from './logger';
import { incrementMetric, metricsSnapshot, observeDuration, resetMetricsForTest } from './metrics';
import { safeObservabilityData } from './safe-data';

beforeEach(resetMetricsForTest);

describe('Phase 8 observability safety', () => {
  it('redacts credentials and protected business values recursively', () => {
    const result = safeObservabilityData({
      actor: 'user-1',
      password: 'Demo1234!',
      nested: { authorization: 'Bearer abc.def', salaryAmount: '50000.00' },
      url: 'mysql://office_app:secret@db/office',
    });
    expect(result).toEqual({
      actor: 'user-1',
      password: '[redacted]',
      nested: { authorization: '[redacted]', salaryAmount: '[redacted]' },
      url: 'mysql://[redacted]@db/office',
    });
  });

  it('writes one bounded structured event with required operational fields', () => {
    const sink = vi.fn();
    operationalLog({
      event: 'request.complete', severity: 'info', correlationId: 'cor-1', actorRef: 'usr-1',
      resourceType: 'report', resourceRef: 'employee-hours', durationMs: 12.4, outcome: 'success',
      details: { token: 'secret', rows: 4 },
    }, sink);
    const line = JSON.parse(String(sink.mock.calls[0][0]));
    expect(line).toMatchObject({ event: 'request.complete', correlationId: 'cor-1', durationMs: 12, outcome: 'success' });
    expect(line.details).toEqual({ token: '[redacted]', rows: 4 });
  });

  it('collects low-cardinality counters and timings without labels containing personal data', () => {
    incrementMetric('request.success');
    incrementMetric('request.success', 2);
    observeDuration('request.duration', 20);
    observeDuration('request.duration', 40);
    expect(metricsSnapshot()).toEqual({
      counters: { 'request.success': 3 },
      timings: { 'request.duration': { count: 2, totalMs: 60, maxMs: 40 } },
    });
    expect(() => incrementMetric('employee:nadia@example.com')).toThrow();
  });
});

