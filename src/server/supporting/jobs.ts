import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Pool } from 'mysql2/promise';
import { startNotificationWorkers } from '@/server/notifications/jobs';
import { createSupportingServices } from './composition';

/**
 * The Phase 7 worker host (`BE-0703`, `BE-0704`, `BE-0710`, `BE-0722`,
 * `BE-0731`, `BE-0732`). Runs in the worker process with the HR and export
 * workers, never in `next start`.
 *
 * Every job reads its due work from MySQL and is safe to run twice: scans
 * claim by attempt counter, deliveries by lease, reindexing is a rebuild, and
 * calendar sync upserts by event. Redis only decides *when* to look.
 */
export async function startSupportingWorkers(pool: Pool, connection: ConnectionOptions) {
  const services = createSupportingServices(pool);
  const notifications = await startNotificationWorkers(pool, connection);
  const queue = new Queue('office-supporting', { connection });
  await queue.upsertJobScheduler('files', { every: 60_000 }, { name: 'files' });
  await queue.upsertJobScheduler('webhooks', { every: 30_000 }, { name: 'webhooks' });
  await queue.upsertJobScheduler('calendar', { every: 5 * 60_000 }, { name: 'calendar' });
  await queue.upsertJobScheduler('search', { every: 15 * 60_000 }, { name: 'search' });
  const worker = new Worker('office-supporting', async (job) => {
    switch (job.name) {
      case 'files': return { scanned: await services.files.scanPending(50), expired: await services.files.expireStale() };
      case 'webhooks': return services.webhooks.deliverDue(50);
      case 'calendar': return services.calendar.syncDue(20);
      case 'search': return services.indexer.reindex();
      default: return null;
    }
  }, { connection, concurrency: 1 });
  return {
    queue,
    worker,
    async close() {
      await worker.close();
      await queue.close();
      await notifications.close();
    },
  };
}
