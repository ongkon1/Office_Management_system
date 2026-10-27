import type { RowDataPacket } from 'mysql2';
import type { OrganizationBrandingView } from '@/contracts/admin';
import type { Result } from '@/contracts/results';
import { parseStoredBrandLogo } from '@/lib/branding';
import { createDatabaseClient } from '@/server/database/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let database: ReturnType<typeof createDatabaseClient> | undefined;

const headers = {
  'Cache-Control': 'public, no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(): Promise<Response> {
  try {
    database ??= createDatabaseClient();
    const [rows] = await database.pool.execute<
      (RowDataPacket & { logo_payload: unknown })[]
    >('SELECT logo_payload FROM organization_branding WHERE id = 1 LIMIT 1');
    const storedLogo = parseStoredBrandLogo(rows[0]?.logo_payload);
    const branding: OrganizationBrandingView = {
      productName: 'PowerInAI',
      logo: storedLogo
        ? {
            ...storedLogo,
            // The original local file name is not part of the public brand.
            fileName: 'organization-logo',
          }
        : null,
    };
    const result: Result<OrganizationBrandingView> = {
      status: 'success',
      data: branding,
    };
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch {
    const result: Result<OrganizationBrandingView> = {
      status: 'error',
      code: 'DEPENDENCY_FAILED',
      message: 'Branding could not be loaded.',
      retryable: true,
    };
    return new Response(JSON.stringify(result), { status: 503, headers });
  }
}
