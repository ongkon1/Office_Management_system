import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Pool } from 'mysql2/promise';
import { NotificationDeliveryWorker, emailSenderFromEnvironment } from './delivery';
import { NotificationRuleRunner } from './rules';

/**
 * The persistent worker host for notifications (`BE-0703`, `BE-0704`).
 *
 * Redis only wakes the work up. Which rule windows ran and which deliveries
 * are due both live in MySQL, so an interrupted Redis loses nothing: the next
 * tick finds the same rows. Runs alongside `startHrScheduler` and
 * `startExportWorker` in the worker process, never inside `next start`.
 */
export async function startNotificationWorkers(pool: Pool, connection: ConnectionOptions) {
  const rules = new NotificationRuleRunner(pool);
  const delivery = new NotificationDeliveryWorker(pool, emailSenderFromEnvironment());
  const queue = new Queue('office-notifications', { connection });
  await queue.upsertJobScheduler('daily-rules', { pattern: '0 6 * * *', tz: 'Asia/Dhaka' }, { name: 'rules' });
  await queue.upsertJobScheduler('deliveries', { every: 60_000 }, { name: 'deliver' });
  const worker = new Worker('office-notifications', async (job) => {
    if (job.name === 'rules') {
      const results = await rules.runDaily();
      if (results.some((result) => result.outcome === 'failed')) throw new Error('A notification rule failed; its window will be retried.');
      return results;
    }
    return delivery.processDue(100);
  }, { connection, concurrency: 1 });
  return {
    queue,
    worker,
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
