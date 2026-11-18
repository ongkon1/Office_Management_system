import { describe, expect, it } from 'vitest';
import { checkJobReadiness, type JobProbe } from './dependencies';

const probe = (value: Awaited<ReturnType<JobProbe['run']>>): JobProbe => ({ run: async () => value });

describe('job and Redis readiness', () => {
  it('is unhealthy in production when Redis is absent', async () => {
    const result = await checkJobReadiness({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(result).toMatchObject({ status: 'unhealthy', redis: 'not_configured', workers: 'unhealthy' });
  });

  it('requires one active worker per durable queue in production', async () => {
    const result = await checkJobReadiness(
      { NODE_ENV: 'production', REDIS_URL: 'redis://example.invalid' } as NodeJS.ProcessEnv,
      probe({ redis: 'healthy', activeWorkers: 3, waitingJobs: 2, delayedJobs: 1, failedJobs: 0 }),
    );
    expect(result).toMatchObject({ status: 'unhealthy', workers: 'unhealthy', activeWorkers: 3 });
  });

  it('reports queue failures as degraded without exposing job contents', async () => {
    const result = await checkJobReadiness(
      { NODE_ENV: 'production', REDIS_URL: 'redis://example.invalid' } as NodeJS.ProcessEnv,
      probe({ redis: 'healthy', activeWorkers: 4, waitingJobs: 2, delayedJobs: 1, failedJobs: 5 }),
    );
    expect(result).toMatchObject({ status: 'degraded', workers: 'healthy', failedJobs: 5 });
    expect(result).not.toHaveProperty('jobs');
  });
});

