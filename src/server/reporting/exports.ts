import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { ExportFormat } from '@/contracts/domain';
import { success, type Result } from '@/contracts/results';
import { hasPermission, indistinguishableNotFound } from '@/server/authorization/policy';
import { RequestApplication } from '@/server/hr/requests';
import { HrRepository, decode, instant, type Row } from '@/server/hr/repository';
import { conflict, invalid } from '@/server/time/validation';
import { ReportApplication, denied, type ReportDataset } from './application';
import { renderExport, mediaTypes, extensions } from './formats';
import type { ExportStorage } from './storage';
export const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function datasetFingerprint(d: ReportDataset) { return hash({ rows: d.rows.map(r => ({ key: r.key, cells: r.cells })), totals: d.totals, metadata: { ...d.metadata, generatedAt: undefined } }); }
export interface StoredExport {
    id: string;
    reportKey: string;
    format: ExportFormat;
    state: 'queued' | 'processing' | 'ready' | 'failed' | 'cancelled' | 'expired';
    requestedAt: string;
    completedAt: string | null;
    expiresAt: string | null;
    failureCode: string | null;
}
export class ExportApplication {
    constructor(readonly reports: ReportApplication, readonly storage: ExportStorage, readonly options: {
        ttlMs?: number;
        leaseMs?: number;
        fontPath?: string;
    } = {}) { }
    private get repo() { return this.reports.requests.repository; }
    private now() { return this.reports.requests.now(); }
    private view(r: Row): StoredExport { return { id: String(r.id), reportKey: String(r.report_key), format: (r.format === 'xlsx' ? 'excel' : r.format) as ExportFormat, state: r.state as StoredExport['state'], requestedAt: instant(r.requested_at), completedAt: r.completed_at ? instant(r.completed_at) : null, expiresAt: r.expires_at ? instant(r.expires_at) : null, failureCode: r.failure_code ? String(r.failure_code) : null }; }
    private async owned(repo: HrRepository, id: string) { const a = await this.reports.actor(); if (!a)
        return null; return (await repo.rows('SELECT * FROM export_jobs WHERE id=? AND requested_by_user_id=? AND deleted_at IS NULL', [id, a.userId]))[0] ?? null; }
    private async allowed(data: ReportDataset) { const a = await this.reports.actor(); if (!a || !hasPermission(a, 'report.export') || a.roles.includes('management'))
        return false; const protectedFields = data.hasProtectedFields || data.cost !== undefined || data.spec.costOnly || data.spec.category === 'evaluation' || data.spec.category === 'remarks'; return !protectedFields || hasPermission(a, 'reporting.export.protected'); }
    async request(raw: unknown): Promise<Result<StoredExport>> {
        return this.reports.requests.run(async () => {
            const p = z.object({ reportKey: z.string().max(100), format: z.enum(['excel', 'csv', 'pdf', 'print']), query: z.record(z.string(), z.unknown()), idempotencyKey: z.string().min(1).max(128) }).strict().safeParse(raw);
            if (!p.success)
                return invalid('export', p.error.issues[0].message);
            const v = p.data;
            const result = await this.reports.run(v.reportKey, v.query, true);
            if (result.status !== 'success')
                return result;
            if (!await this.allowed(result.data))
                return denied;
            const actor = (await this.reports.actor())!;
            return this.repo.transaction(async (repo) => {
                const existing = (await repo.rows('SELECT * FROM export_jobs WHERE requested_by_user_id=? AND idempotency_key=?', [actor.userId, v.idempotencyKey]))[0];
                const requestHash = hash({ reportKey: v.reportKey, format: v.format, query: v.query });
                if (existing)
                    return existing.request_hash === requestHash ? success(this.view(existing)) : conflict('The retry key was used with different export filters.');
                const id = randomUUID();
                await repo.execute('INSERT INTO report_definitions(id,report_key,name,module,configuration) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE report_key=VALUES(report_key)', [randomUUID(), v.reportKey, result.data.spec.title, result.data.spec.category, '{}']);
                const definition = (await repo.rows('SELECT id FROM report_definitions WHERE report_key=?', [v.reportKey]))[0];
                await repo.execute("INSERT INTO export_jobs(id,requested_by_user_id,report_definition_id,report_key,format,filters,timezone,state,requested_at,idempotency_key,request_hash,permission_fingerprint,policy_versions) VALUES(?,?,?,?,?,?,?,'queued',?,?,?,?,?)", [id, actor.userId, String(definition.id), v.reportKey, v.format === 'excel' ? 'xlsx' : v.format, JSON.stringify(result.data.query), 'Asia/Dhaka', new Date(this.now()), v.idempotencyKey, requestHash, datasetFingerprint(result.data), JSON.stringify(result.data.metadata.policyVersions)]);
                await repo.record(actor, 'export.request', id, null, { reportKey: v.reportKey, format: v.format, filters: result.data.query }, 'Export requested');
                return success(this.view((await repo.rows('SELECT * FROM export_jobs WHERE id=?', [id]))[0]));
            });
        });
    }
    async list(): Promise<Result<StoredExport[]>> { return this.reports.requests.run(async () => { const actor = await this.reports.actor(); if (!actor)
        return denied; await this.expire(); return success((await this.repo.rows('SELECT * FROM export_jobs WHERE requested_by_user_id=? AND deleted_at IS NULL ORDER BY requested_at DESC,id DESC LIMIT 100', [actor.userId])).map(r => this.view(r))); }); }
    async get(id: string): Promise<Result<StoredExport>> { return this.reports.requests.run(async () => { await this.expire(); const row = await this.owned(this.repo, id); return row ? success(this.view(row)) : indistinguishableNotFound(); }); }
    async transition(id: string, action: 'cancel' | 'retry' | 'delete'): Promise<Result<StoredExport>> {
        return this.reports.requests.run(() => this.repo.transaction(async (repo) => {
            const row = await this.owned(repo, id), actor = await this.reports.actor();
            if (!row || !actor)
                return indistinguishableNotFound();
            if (action === 'retry') {
                if (row.state !== 'failed')
                    return conflict('Only failed exports can be retried.');
                const refreshed = await new ReportApplication(new RequestApplication(repo, this.reports.requests.resolveActor, this.reports.requests.now)).run(String(row.report_key), decode(row.filters, {}), true);
                if (refreshed.status !== 'success' || !await this.allowed(refreshed.data))
                    return denied;
                await repo.execute("UPDATE export_jobs SET state='queued',lease_token=NULL,lease_until=NULL,failure_code=NULL,permission_fingerprint=?,policy_versions=? WHERE id=?", [datasetFingerprint(refreshed.data), JSON.stringify(refreshed.data.metadata.policyVersions), id]);
            }
            else if (action === 'cancel') {
                if (!['queued', 'processing'].includes(String(row.state)))
                    return conflict('Only pending exports can be cancelled.');
                await repo.execute("UPDATE export_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=?", [id]);
            }
            else {
                const artifact = (await repo.rows('SELECT storage_key FROM export_artifacts WHERE export_job_id=?', [id]))[0];
                if (artifact)
                    await this.storage.delete(String(artifact.storage_key));
                await repo.execute("UPDATE export_jobs SET state='expired',deleted_at=?,lease_token=NULL,lease_until=NULL WHERE id=?", [new Date(this.now()), id]);
            }
            await repo.record(actor, `export.${action}`, id, { state: row.state }, { action }, `Export ${action}`);
            return success(this.view((await repo.rows('SELECT * FROM export_jobs WHERE id=?', [id]))[0]));
        }));
    }
    /** SQL is the durable outbox. A lease and attempt-specific object key fence stale workers. */
    async process(id: string): Promise<Result<StoredExport>> {
        return this.reports.requests.run(async () => {
            const token = randomUUID();
            const claim = await this.repo.transaction(async (repo) => {
                const row = await this.owned(repo, id);
                if (!row)
                    return indistinguishableNotFound();
                if (row.state === 'ready')
                    return success({ row, claimed: false });
                if (row.state !== 'queued' && !(row.state === 'processing' && row.lease_until && instant(row.lease_until) < this.now()))
                    return conflict('This export is already being processed or is terminal.');
                await repo.execute("UPDATE export_jobs SET state='processing',lease_token=?,lease_until=?,attempt=attempt+1 WHERE id=?", [token, new Date(Date.parse(this.now()) + (this.options.leaseMs ?? 300000)), id]);
                return success({ row, claimed: true });
            });
            if (claim.status !== 'success')
                return claim;
            if (!claim.data.claimed)
                return success(this.view(claim.data.row));
            const row = claim.data.row, objectKey = `exports/${id}/${token}.${extensions[(row.format === 'xlsx' ? 'excel' : row.format) as ExportFormat]}`;
            let directory: string | undefined, uploaded = false;
            try {
                const result = await this.reports.run(String(row.report_key), decode(row.filters, {}), true);
                if (result.status !== 'success' || !await this.allowed(result.data))
                    throw new Error('Export authorization or query changed');
                // Refuse to materialize a request that now has a different visible dataset.
                if (datasetFingerprint(result.data) !== row.permission_fingerprint)
                    throw new Error('Export source or authorization changed');
                directory = await mkdtemp(join(tmpdir(), 'office-export-'));
                const path = join(directory, 'artifact');
                const format = (row.format === 'xlsx' ? 'excel' : row.format) as ExportFormat;
                await renderExport(result.data, format, path, this.options.fontPath);
                const size = (await stat(path)).size;
                if (size > 64 * 1024 * 1024)
                    throw new Error('Export size limit exceeded');
                const digest = createHash('sha256');
                for await (const chunk of createReadStream(path))
                    digest.update(chunk);
                const sha256 = digest.digest('hex');
                await this.storage.put(objectKey, path, mediaTypes[format], sha256);
                uploaded = true;
                const completed = await this.repo.transaction(async (repo) => {
                    const current = await this.owned(repo, id), actor = await this.reports.actor();
                    if (!current || !actor || current.lease_token !== token || current.state !== 'processing')
                        return conflict('The export lease changed.');
                    const expiresAt = new Date(Date.parse(this.now()) + (this.options.ttlMs ?? 86400000));
                    await repo.execute('INSERT INTO export_artifacts(id,export_job_id,storage_key,sha256,size_bytes,media_type,expires_at) VALUES(?,?,?,?,?,?,?)', [randomUUID(), id, objectKey, sha256, size, mediaTypes[format], expiresAt]);
                    await repo.execute("UPDATE export_jobs SET state='ready',completed_at=?,expires_at=?,lease_token=NULL,lease_until=NULL,generated_metadata=? WHERE id=?", [new Date(this.now()), expiresAt, JSON.stringify(result.data.metadata), id]);
                    await repo.record(actor, 'export.complete', id, { state: 'processing' }, { state: 'ready', sha256, size }, 'Export generated');
                    return success(this.view((await repo.rows('SELECT * FROM export_jobs WHERE id=?', [id]))[0]));
                });
                if (completed.status !== 'success')
                    await this.storage.delete(objectKey);
                return completed;
            }
            catch {
                if (uploaded)
                    await this.storage.delete(objectKey);
                return this.repo.transaction(async (repo) => {
                    const current = await this.owned(repo, id), actor = await this.reports.actor();
                    if (!current || !actor)
                        return indistinguishableNotFound();
                    if (current.lease_token !== token)
                        return conflict('The export lease changed.');
                    await repo.execute("UPDATE export_jobs SET state='failed',failure_code='GENERATION_FAILED',lease_token=NULL,lease_until=NULL WHERE id=?", [id]);
                    await repo.record(actor, 'export.failure', id, { state: 'processing' }, { state: 'failed' }, 'Generation failed; review source data, permissions and worker configuration');
                    return success(this.view((await repo.rows('SELECT * FROM export_jobs WHERE id=?', [id]))[0]));
                });
            }
            finally {
                if (directory)
                    await rm(directory, { recursive: true, force: true });
            }
        });
    }
    async expire(): Promise<Result<{
        count: number;
    }>> {
        return this.reports.requests.run(() => this.repo.transaction(async (repo) => {
            const actor = await this.reports.actor();
            if (!actor)
                return denied;
            const rows = await repo.rows("SELECT j.id,a.storage_key FROM export_jobs j JOIN export_artifacts a ON a.export_job_id=j.id WHERE j.requested_by_user_id=? AND j.state='ready' AND j.expires_at<=?", [actor.userId, new Date(this.now())]);
            for (const row of rows) {
                await this.storage.delete(String(row.storage_key));
                await repo.execute("UPDATE export_jobs SET state='expired' WHERE id=?", [String(row.id)]);
                await repo.record(actor, 'export.expiry', String(row.id), { state: 'ready' }, { state: 'expired' }, 'Artifact access expired');
                await repo.record(actor, 'export.deletion', String(row.id), null, { artifactDeleted: true }, 'Expired artifact removed');
            }
            return success({ count: rows.length });
        }));
    }
    async download(id: string): Promise<Result<{
        stream: ReadableStream<Uint8Array>;
        mediaType: string;
        filename: string;
    }>> {
        return this.reports.requests.run(async () => {
            await this.expire();
            const row = await this.owned(this.repo, id);
            if (!row || row.state !== 'ready' || !row.expires_at || instant(row.expires_at) <= this.now())
                return indistinguishableNotFound();
            const report = await this.reports.run(String(row.report_key), decode(row.filters, {}), true);
            if (report.status !== 'success' || !await this.allowed(report.data) || datasetFingerprint(report.data) !== row.permission_fingerprint)
                return indistinguishableNotFound();
            const artifact = (await this.repo.rows('SELECT * FROM export_artifacts WHERE export_job_id=?', [id]))[0];
            if (!artifact)
                return indistinguishableNotFound();
            const stream = await this.storage.get(String(artifact.storage_key));
            const actor = (await this.reports.actor())!;
            await this.repo.record(actor, 'export.download', id, null, { sha256: artifact.sha256 }, 'Protected artifact accessed');
            return success({ stream, mediaType: String(artifact.media_type), filename: `report-${id}.${extensions[(row.format === 'xlsx' ? 'excel' : row.format) as ExportFormat]}` });
        });
    }
}
