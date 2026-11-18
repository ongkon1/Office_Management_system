import { Queue } from 'bullmq';
import Redis from 'ioredis';

const QUEUES = ['office-hr', 'office-exports', 'office-notifications', 'office-supporting'] as const;

export interface JobReadiness {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly redis: 'healthy' | 'unhealthy' | 'not_configured';
  readonly workers: 'healthy' | 'unhealthy' | 'not_required';
  readonly activeWorkers: number;
  readonly waitingJobs: number;
  readonly delayedJobs: number;
  readonly failedJobs: number;
  readonly latencyMs: number;
}

export interface JobProbe {
  run(redisUrl: string): Promise<Omit<JobReadiness, 'status' | 'workers' | 'latencyMs'>>;
}

const defaultProbe: JobProbe = {
  async run(redisUrl) {
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
    });
    const queues: Queue[] = [];
    try {
      await redis.connect();
      await redis.ping();
      let activeWorkers = 0;
      let waitingJobs = 0;
      let delayedJobs = 0;
      let failedJobs = 0;
      for (const name of QUEUES) {
        const queue = new Queue(name, { connection: redis });
        queues.push(queue);
        const [workers, counts] = await Promise.all([
          queue.getWorkers(),
          queue.getJobCounts('waiting', 'delayed', 'failed'),
        ]);
        activeWorkers += workers.length;
        waitingJobs += counts.waiting ?? 0;
        delayedJobs += counts.delayed ?? 0;
        failedJobs += counts.failed ?? 0;
      }
      return { redis: 'healthy', activeWorkers, waitingJobs, delayedJobs, failedJobs };
    } finally {
      await Promise.allSettled(queues.map((queue) => queue.close()));
      redis.disconnect();
    }
  },
};

/** Public-safe dependency status: exceptions and connection details never escape. */
export async function checkJobReadiness(
  environment: NodeJS.ProcessEnv = process.env,
  probe: JobProbe = defaultProbe,
): Promise<JobReadiness> {
  const startedAt = performance.now();
  const required = environment.NODE_ENV === 'production' || environment.WORKER_READINESS_REQUIRED === 'true';
  const redisUrl = environment.REDIS_URL;
  if (!redisUrl) {
    return {
      status: required ? 'unhealthy' : 'degraded',
      redis: 'not_configured',
      workers: required ? 'unhealthy' : 'not_required',
      activeWorkers: 0, waitingJobs: 0, delayedJobs: 0, failedJobs: 0,
      latencyMs: Math.ceil(performance.now() - startedAt),
    };
  }
  try {
    const result = await probe.run(redisUrl);
    const workers = required ? (result.activeWorkers >= QUEUES.length ? 'healthy' : 'unhealthy') : 'not_required';
    return {
      ...result,
      workers,
      status: workers === 'unhealthy' ? 'unhealthy' : result.failedJobs > 0 ? 'degraded' : 'healthy',
      latencyMs: Math.ceil(performance.now() - startedAt),
    };
  } catch {
    return {
      status: 'unhealthy', redis: 'unhealthy', workers: required ? 'unhealthy' : 'not_required',
      activeWorkers: 0, waitingJobs: 0, delayedJobs: 0, failedJobs: 0,
      latencyMs: Math.ceil(performance.now() - startedAt),
    };
  }
}

