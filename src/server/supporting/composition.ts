import type { Pool } from 'mysql2/promise';
import { DocumentApplication } from '@/server/documents/application';
import { FileApplication } from '@/server/files/application';
import { scannerFromEnvironment } from '@/server/files/scanner';
import { objectStoreFromEnvironment, type ObjectStore } from '@/server/files/storage';
import type { MalwareScanner } from '@/server/files/scanner';
import { MessageApplication } from '@/server/messages/application';
import { SearchApplication } from '@/server/search/application';
import { SearchIndexer } from '@/server/search/indexer';
import { ApiTokenService } from '@/server/integrations/api-tokens';
import { CalendarSyncService, GoogleCalendarProvider, MicrosoftCalendarProvider } from '@/server/integrations/calendar';
import { integrationKeyProvider } from '@/server/integrations/keys';
import { OAuthService } from '@/server/integrations/oauth';
import { WebhookService } from '@/server/integrations/webhooks';
import { ModuleSettings } from './modules';

/**
 * One place that builds the Phase 7 services from the environment, for the
 * routes and the worker host alike. Tests build the classes directly with
 * their own store, scanner, clock and `fetch`.
 */
export function createSupportingServices(pool: Pool, overrides: { readonly store?: ObjectStore; readonly scanner?: MalwareScanner | null } = {}) {
  const store = overrides.store ?? objectStoreFromEnvironment();
  const files = new FileApplication(pool, store, overrides.scanner === undefined ? scannerFromEnvironment() : overrides.scanner);
  const indexer = new SearchIndexer(pool);
  const keys = integrationKeyProvider();
  const oauth = new OAuthService(pool, keys);
  return {
    store,
    files,
    documents: new DocumentApplication(pool, files, undefined, async (id) => { await indexer.indexOne('document', id); }),
    messages: new MessageApplication(pool),
    search: new SearchApplication(pool),
    indexer,
    modules: new ModuleSettings(pool),
    tokens: new ApiTokenService(pool),
    webhooks: new WebhookService(pool, keys, { allowLocalTargets: process.env.NODE_ENV !== 'production' }),
    oauth,
    calendar: new CalendarSyncService(pool, oauth, { google_calendar: new GoogleCalendarProvider(), microsoft_calendar: new MicrosoftCalendarProvider() }),
  };
}
