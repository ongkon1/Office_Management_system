import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileApplication } from '@/server/files/application';
import { LocalObjectStore } from '@/server/files/storage';
import type { MalwareScanner } from '@/server/files/scanner';
import type { AttachmentOwnerType } from '@/server/files/policy';
import { DocumentApplication } from '@/server/documents/application';
import { MessageApplication } from '@/server/messages/application';
import { ModuleSettings } from '@/server/supporting/modules';
import { SearchApplication } from '@/server/search/application';
import { SearchIndexer } from '@/server/search/indexer';
import { TimeApplication } from '@/server/time/application';
import { MysqlTimeRepository } from '@/server/time/mysql-repository';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { CRM, CRM_TASK, EMPLOYEE, GOVERNMENT, GOV_TASK, POWERINAI, USER, data, phase7Database, workLog } from '@/server/test/phase7-fixture';

let env: Awaited<ReturnType<typeof phase7Database>>;
let storeRoot: string;
let files: FileApplication;
let documents: DocumentApplication;
const NOW = () => '2026-10-04T04:00:00.000Z';
let admin: ActorPolicyContext, lead: ActorPolicyContext, employee: ActorPolicyContext, hr: ActorPolicyContext, unplaced: ActorPolicyContext;

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
/**
 * A harmless marker the test scanner flags. The real EICAR string is not
 * written to disk here: host antivirus quarantines it on sight, which makes
 * the result depend on the machine. EICAR detection is covered in memory by
 * `phase7.unit.test.ts`.
 */
const FLAGGED = Buffer.from('OMS-TEST-MALWARE-MARKER: this text is treated as infected by the test scanner.');
const markerScanner: MalwareScanner = {
  async scan(body) {
    let seen = '';
    for await (const chunk of body) seen += Buffer.from(chunk as Buffer).toString('utf8');
    return seen.includes('OMS-TEST-MALWARE-MARKER') ? { verdict: 'infected', code: 'test_marker' } : { verdict: 'clean' };
  },
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Initiate → upload through the local store → complete → scan. Returns the attachment id. */
async function upload(actor: ActorPolicyContext, ownerType: AttachmentOwnerType, ownerId: string, bytes = PDF, options: { declaredSha?: string; mediaType?: string; fileName?: string } = {}) {
  const started = data(await files.initiate(actor, {
    ownerType, ownerId, fileName: options.fileName ?? 'evidence.pdf', mediaType: options.mediaType ?? 'application/pdf',
    sizeBytes: bytes.length, sha256: options.declaredSha ?? sha(bytes),
  }));
  data(await files.receive(actor, started.attachment.id, Readable.from([bytes])));
  return { id: started.attachment.id, completed: await files.complete(actor, started.attachment.id) };
}

beforeAll(async () => {
  env = await phase7Database();
  storeRoot = mkdtempSync(join(tmpdir(), 'office-files-'));
  files = new FileApplication(env.pool, new LocalObjectStore(storeRoot, 'http://localhost:3000'), markerScanner, { now: NOW });
  documents = new DocumentApplication(env.pool, files, NOW);
  [admin, lead, employee, hr, unplaced] = await Promise.all([1, 2, 3, 4, 7].map((n) => env.actor(n)));
});
afterAll(async () => {
  await env?.close();
  if (storeRoot) rmSync(storeRoot, { recursive: true, force: true });
});

describe('BE-0710 and BE-0711: safe upload, integrity, scanning and authorized download', () => {
  it('releases a file only after its bytes match and the scan is clean', async () => {
    const { id, completed } = await upload(employee, 'time_entry', EMPLOYEE(3));
    expect(data(completed).state).toBe('scanning');
    expect((await files.download(employee, id)).status).toBe('conflict');
    expect(await files.scanPending()).toMatchObject({ clean: 1 });
    const download = data(await files.download(employee, id));
    expect(download).toMatchObject({ kind: 'stream', fileName: 'evidence.pdf', mediaType: 'application/pdf' });
    expect((await env.rows("SELECT action FROM audit_events WHERE resource_id=? ORDER BY sequence_id", [id])).map((row) => row.action))
      .toEqual(['file.upload_initiated', 'file.upload_completed', 'file.downloaded']);
  });

  it('refuses a changed checksum and content that is not the declared type, and deletes the object', async () => {
    const tampered = await upload(employee, 'time_entry', EMPLOYEE(3), PDF, { declaredSha: sha(Buffer.from('something else')) });
    expect(tampered.completed).toMatchObject({ status: 'validation_failure' });
    const disguised = await upload(employee, 'time_entry', EMPLOYEE(3), Buffer.from('MZ not a pdf'), {});
    expect(disguised.completed).toMatchObject({ status: 'validation_failure' });
    const [row] = await env.rows('SELECT scan_status,safe_scan_code,storage_key FROM attachments WHERE id=?', [disguised.id]);
    expect(row).toMatchObject({ scan_status: 'rejected', safe_scan_code: 'type_mismatch' });
    expect(await new LocalObjectStore(storeRoot, '').stat(String(row.storage_key))).toBeNull();
  });

  it('rejects and deletes a file the scanner flags', async () => {
    const infected = await upload(employee, 'time_entry', EMPLOYEE(3), FLAGGED, { mediaType: 'text/plain', fileName: 'flagged.txt' });
    data(infected.completed);
    await files.scanPending();
    expect((await env.rows('SELECT scan_status FROM attachments WHERE id=?', [infected.id]))[0].scan_status).toBe('rejected');
    expect((await files.download(employee, infected.id)).status).toBe('conflict');
  });

  it('refuses more bytes than declared, and closes expired upload windows', async () => {
    const started = data(await files.initiate(employee, { ownerType: 'time_entry', ownerId: EMPLOYEE(3), fileName: 'a.pdf', mediaType: 'application/pdf', sizeBytes: 10, sha256: sha(PDF) }));
    expect((await files.receive(employee, started.attachment.id, Readable.from([PDF]))).status).toBe('validation_failure');
    const later = new FileApplication(env.pool, new LocalObjectStore(storeRoot, ''), null, { now: () => '2026-10-05T04:00:00.000Z' });
    expect(await later.expireStale()).toBeGreaterThanOrEqual(1);
    expect((await env.rows('SELECT upload_state FROM attachments WHERE id=?', [started.attachment.id]))[0].upload_state).toBe('expired');
  });
});

describe('BE-0712: an attachment has the visibility of its owner', () => {
  let evidence: string;
  beforeAll(async () => {
    evidence = (await upload(employee, 'time_entry', EMPLOYEE(3))).id;
    await files.scanPending();
  });

  it('lets the employee and their lead download, and refuses anyone else as not found', async () => {
    expect(data(await files.download(lead, evidence)).kind).toBe('stream');
    expect(data(await files.download(hr, evidence)).kind).toBe('stream');
    expect((await files.download(unplaced, evidence)).status).toBe('not_found');
    expect(await files.download(unplaced, evidence)).toEqual(await files.download(unplaced, randomUUID()));
  });

  it('only the employee may attach their own evidence; others cannot attach to it', async () => {
    expect((await files.initiate(lead, { ownerType: 'time_entry', ownerId: EMPLOYEE(3), fileName: 'x.pdf', mediaType: 'application/pdf', sizeBytes: 5, sha256: sha(PDF) })).status).toBe('permission_denied');
    expect((await files.initiate(unplaced, { ownerType: 'time_entry', ownerId: EMPLOYEE(3), fileName: 'x.pdf', mediaType: 'application/pdf', sizeBytes: 5, sha256: sha(PDF) })).status).toBe('not_found');
  });

  it('keeps government task files from someone without government access', async () => {
    expect((await files.initiate(lead, { ownerType: 'task', ownerId: GOV_TASK, fileName: 'x.pdf', mediaType: 'application/pdf', sizeBytes: 5, sha256: sha(PDF) })).status).toBe('not_found');
    const govFile = (await upload(admin, 'task', GOV_TASK)).id;
    await files.scanPending();
    expect((await files.download(lead, govFile)).status).toBe('not_found');
  });

  it('a work log links the employee\'s own clean evidence', async () => {
    const time = new TimeApplication(new MysqlTimeRepository(env.pool), async () => employee, NOW);
    data(await time.save(workLog({ attachmentIds: [evidence] })));
    const someoneElses = (await upload(admin, 'task', CRM_TASK)).id;
    await files.scanPending();
    expect((await time.save(workLog({ attachmentIds: [someoneElses] }))).status).toBe('validation_failure');
  });
});

describe('BE-0713 and BE-0715: documents', () => {
  it('lets HR publish a company document everyone can read, with link and file versions', async () => {
    const created = data(await documents.create(hr, { title: 'Leave policy', description: 'How leave works', category: 'policy', scope: 'company', divisionId: null, projectId: null, sensitivity: 'protected', externalLink: 'https://intranet.example/leave' }));
    expect(created).toMatchObject({ currentVersion: 1, canManage: true });
    const file = (await upload(hr, 'document', created.id)).id;
    await files.scanPending();
    const versioned = data(await documents.addVersion(hr, created.id, { attachmentId: file, externalLink: null, changeNote: 'Signed copy', expectedVersion: created.version }));
    expect(versioned.versions.map((version) => [version.number, version.kind])).toEqual([[2, 'file'], [1, 'link']]);
    expect(data(await documents.library(employee)).map((item) => item.title)).toContain('Leave policy');
    expect(data(await documents.download(employee, created.id))).toMatchObject({ kind: 'stream' });
    expect((await env.rows("SELECT event_id FROM audit_events WHERE action='document.downloaded' AND resource_id=?", [created.id])).length).toBe(1);
    expect((await documents.addVersion(hr, created.id, { attachmentId: file, externalLink: null, changeNote: '', expectedVersion: created.version })).status).toBe('conflict');
  });

  it('keeps a division document inside its division and refuses a Team Lead a company document', async () => {
    const division = data(await documents.create(lead, { title: 'PowerInAI coding guideline', description: '', category: 'guideline', scope: 'division', divisionId: POWERINAI, projectId: null, sensitivity: 'protected', externalLink: 'https://intranet.example/guide' }));
    expect(data(await documents.library(employee)).map((item) => item.id)).toContain(division.id);
    expect(data(await documents.library(unplaced)).map((item) => item.id)).not.toContain(division.id);
    expect((await documents.get(unplaced, division.id)).status).toBe('not_found');
    expect((await documents.create(lead, { title: 'Company handbook', description: '', category: 'handbook', scope: 'company', divisionId: null, projectId: null, sensitivity: 'protected', externalLink: null })).status).toBe('permission_denied');
  });

  it('hides government documents completely, and audits an access change with its reason', async () => {
    const gov = data(await documents.create(admin, { title: 'Portal security plan', description: '', category: 'government', scope: 'division', divisionId: GOVERNMENT, projectId: null, sensitivity: 'protected', externalLink: 'https://intranet.example/gov' }));
    expect(data(await documents.library(lead)).map((item) => item.id)).not.toContain(gov.id);
    const company = data(await documents.create(admin, { title: 'Bid evaluation notes', description: '', category: 'other', scope: 'company', divisionId: null, projectId: null, sensitivity: 'protected', externalLink: 'https://intranet.example/bid' }));
    expect(data(await documents.library(employee)).map((item) => item.id)).toContain(company.id);
    expect((await documents.changeAccess(admin, company.id, { sensitivity: 'government', reason: '', expectedVersion: company.version })).status).toBe('validation_failure');
    data(await documents.changeAccess(admin, company.id, { sensitivity: 'government', reason: 'Contains tender details', expectedVersion: company.version }));
    expect(data(await documents.library(employee)).map((item) => item.id)).not.toContain(company.id);
    expect((await env.rows("SELECT reason FROM audit_events WHERE action='document.access_changed' AND resource_id=?", [company.id]))[0].reason).toBe('Contains tender details');
  });

  it('deactivates rather than deletes', async () => {
    const doc = data(await documents.create(hr, { title: 'Old FAQ', description: '', category: 'faq', scope: 'company', divisionId: null, projectId: null, sensitivity: 'protected', externalLink: 'https://intranet.example/faq' }));
    data(await documents.setActive(hr, doc.id, { active: false, reason: 'Superseded', expectedVersion: doc.version }));
    expect(data(await documents.library(employee)).map((item) => item.id)).not.toContain(doc.id);
    expect((await documents.get(employee, doc.id)).status).toBe('not_found');
    expect(data(await documents.get(hr, doc.id)).isActive).toBe(false);
    expect(await env.rows('SELECT id FROM documents WHERE id=?', [doc.id])).toHaveLength(1);
  });
});

describe('BE-0714 and BE-0715: messaging when enabled', () => {
  const messages = () => new MessageApplication(env.pool, NOW);

  it('answers with an explained empty view while switched off, and refuses posts', async () => {
    expect(data(await messages().threads(employee)).threads).toHaveLength(0);
    expect((await messages().post(employee, { scopeType: 'division', scopeId: POWERINAI, body: 'Hello', mentionUserIds: [], isAnnouncement: false, idempotencyKey: 'off-12345678' })).status).toBe('conflict');
  });

  it('is switched on only by a Super Administrator, with a reason, and audited', async () => {
    const settings = new ModuleSettings(env.pool);
    const current = data(await settings.list()).find((item) => item.key === 'messages')!;
    expect((await settings.set(lead, 'messages', true, 'Pilot', current.version)).status).toBe('permission_denied');
    data(await settings.set(admin, 'messages', true, 'Pilot with PowerInAI', current.version));
    expect((await env.rows("SELECT event_id FROM audit_events WHERE action='module.enabled'")).length).toBe(1);
  });

  it('keeps division channels to the division, and mentions to people already in the conversation', async () => {
    const posted = data(await messages().post(employee, { scopeType: 'division', scopeId: POWERINAI, body: 'Standup notes are up', mentionUserIds: [USER(2)], isAnnouncement: false, idempotencyKey: 'standup-0001' }));
    expect((await messages().post(employee, { scopeType: 'division', scopeId: POWERINAI, body: 'Standup notes are up', mentionUserIds: [USER(2)], isAnnouncement: false, idempotencyKey: 'standup-0001' }))).toEqual({ status: 'success', data: posted });
    expect((await env.rows("SELECT id FROM notifications WHERE notification_type='message_mention' AND recipient_user_id=?", [USER(2)])).length).toBe(1);
    expect((await messages().post(employee, { scopeType: 'division', scopeId: POWERINAI, body: 'Hi', mentionUserIds: [USER(7)], isAnnouncement: false, idempotencyKey: 'mention-out-1' })).status).toBe('validation_failure');
    expect(data(await messages().threads(unplaced)).threads).toHaveLength(0);
    expect(data(await messages().threads(lead)).threads.map((thread) => thread.id)).toContain(`division:${POWERINAI}`);
  });

  it('lets only the Team Lead announce and pin, and tells the division', async () => {
    expect((await messages().post(employee, { scopeType: 'division', scopeId: POWERINAI, body: 'All hands', mentionUserIds: [], isAnnouncement: true, idempotencyKey: 'announce-emp1' })).status).toBe('permission_denied');
    const announcement = data(await messages().post(lead, { scopeType: 'division', scopeId: POWERINAI, body: 'Release on Thursday', mentionUserIds: [], isAnnouncement: true, idempotencyKey: 'announce-lead' }));
    expect((await env.rows("SELECT id FROM notifications WHERE notification_type='announcement_posted' AND recipient_user_id=?", [USER(3)])).length).toBe(1);
    expect((await messages().pin(employee, announcement.id, true)).status).toBe('permission_denied');
    data(await messages().pin(lead, announcement.id, true));
    const thread = data(await messages().threads(employee)).threads.find((item) => item.id === `division:${POWERINAI}`)!;
    expect(thread.messages.find((message) => message.id === announcement.id)).toMatchObject({ isPinned: true, isAnnouncement: true });
  });

  it('keeps a direct conversation to its two participants — not HR, not an administrator', async () => {
    const direct = data(await messages().startDirect(employee, USER(2)));
    expect(data(await messages().startDirect(lead, USER(3))).scopeId).toBe(direct.scopeId);
    data(await messages().post(lead, { scopeType: 'direct', scopeId: direct.scopeId, body: 'Can we talk about the estimate?', mentionUserIds: [], isAnnouncement: false, idempotencyKey: 'direct-0001' }));
    expect(data(await messages().threads(employee)).threads.map((thread) => thread.id)).toContain(`direct:${direct.scopeId}`);
    for (const outsider of [hr, admin]) {
      expect(data(await messages().threads(outsider)).threads.map((thread) => thread.id)).not.toContain(`direct:${direct.scopeId}`);
      expect((await messages().post(outsider, { scopeType: 'direct', scopeId: direct.scopeId, body: 'x', mentionUserIds: [], isAnnouncement: false, idempotencyKey: `intrude-${outsider.userId.slice(-4)}` })).status).toBe('not_found');
    }
  });

  it('follows the task for comments: none on government work without that access', async () => {
    data(await messages().post(employee, { scopeType: 'task_comment', scopeId: CRM_TASK, body: 'Blocked on the API', mentionUserIds: [], isAnnouncement: false, idempotencyKey: 'comment-0001' }));
    expect((await messages().post(lead, { scopeType: 'task_comment', scopeId: GOV_TASK, body: 'x', mentionUserIds: [], isAnnouncement: false, idempotencyKey: 'comment-gov1' })).status).toBe('not_found');
  });
});

describe('BE-0720 to BE-0723: authorized search', () => {
  const search = () => new SearchApplication(env.pool, NOW);
  beforeAll(async () => { await new SearchIndexer(env.pool).reindex(); });

  it('finds what the viewer can open, and counts nothing else', async () => {
    const forLead = data(await search().search(lead, 'reporting endpoint'));
    expect(forLead.totalCount).toBe(0);
    expect(JSON.stringify(forLead)).not.toContain('Secure reporting endpoint');
    expect(data(await search().search(admin, 'reporting endpoint')).groups.flatMap((group) => group.results).map((result) => result.id)).toContain(GOV_TASK);
    const own = data(await search().search(employee, 'Implement dashboard'));
    expect(own.groups.flatMap((group) => group.results)[0]).toMatchObject({ id: CRM_TASK, kind: 'task', href: `/tasks/${CRM_TASK}` });
    expect(data(await search().search(unplaced, 'Implement dashboard')).totalCount).toBe(0);
  });

  it('re-authorizes against live records, so a stale index cannot leak', async () => {
    const doc = data(await documents.create(admin, { title: 'Quarterly roadmap', description: '', category: 'other', scope: 'company', divisionId: null, projectId: null, sensitivity: 'protected', externalLink: 'https://intranet.example/roadmap' }));
    await new SearchIndexer(env.pool).indexOne('document', doc.id);
    expect(data(await search().search(employee, 'Quarterly roadmap')).totalCount).toBe(1);
    // Restricted directly, with the index left stale on purpose.
    await env.pool.execute("UPDATE documents SET sensitivity='government' WHERE id=?", [doc.id]);
    expect(data(await search().search(employee, 'Quarterly roadmap')).totalCount).toBe(0);
    // Renamed without reindexing: the old title no longer matches the live record.
    await env.pool.execute("UPDATE tasks SET title='Build overview page' WHERE id=?", [CRM_TASK]);
    expect(data(await search().search(employee, 'Implement dashboard')).totalCount).toBe(0);
    await env.pool.execute("UPDATE tasks SET title='Implement dashboard' WHERE id=?", [CRM_TASK]);
  });

  it('treats wildcards, quotes and SQL as literal text', async () => {
    expect(data(await search().search(admin, '%')).totalCount).toBe(0);
    expect(data(await search().search(admin, '_')).totalCount).toBe(0);
    expect(data(await search().search(admin, "'; DROP TABLE tasks; --")).totalCount).toBe(0);
    expect((await env.rows('SELECT COUNT(*) n FROM tasks'))[0].n).toBeGreaterThan(0);
    expect(data(await search().search(admin, '   ')).guidance).toContain('Type at least one character');
    expect((await search().search(admin, 'x'.repeat(101))).status).toBe('validation_failure');
  });

  it('validates filters and paginates within a bound', async () => {
    expect((await search().search(admin, 'Bulk', undefined, { filters: { divisionIds: ['not-a-uuid'] } })).status).toBe('validation_failure');
    for (let index = 0; index < 520; index += 1) {
      await env.pool.execute("INSERT INTO tasks(id,project_id,division_id,title,status,assignee_employee_id,creator_employee_id,creator_role,review_state) VALUES(?,?,?,?,'pending',?,?,'team_lead','not_required')",
        [randomUUID(), CRM, POWERINAI, `Bulk item ${index}`, EMPLOYEE(3), EMPLOYEE(2)]);
    }
    await new SearchIndexer(env.pool).reindex(['task']);
    const first = data(await search().search(admin, 'Bulk item', ['task'], { pageSize: 50 }));
    expect(first.groups[0].results).toHaveLength(50);
    expect(first.page).toMatchObject({ page: 1, pageSize: 50, hasMore: true, truncated: true });
    expect(first.totalCount).toBeLessThanOrEqual(500);
    const filtered = data(await search().search(admin, 'Bulk item', ['task'], { filters: { projectIds: [randomUUID()] } }));
    expect(filtered.totalCount).toBe(0);
  }, 120_000);
});
