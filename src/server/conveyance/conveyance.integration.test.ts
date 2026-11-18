import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConveyanceFormInput } from '@/contracts/conveyance';
import { FileApplication } from '@/server/files/application';
import { LocalObjectStore } from '@/server/files/storage';
import type { MalwareScanner } from '@/server/files/scanner';
import { data, EMPLOYEE, USER, phase7Database } from '@/server/test/phase7-fixture';
import { MysqlConveyanceService } from './application';

let env: Awaited<ReturnType<typeof phase7Database>>;
let storeRoot: string;
let files: FileApplication;
const NOW = '2026-11-16T04:00:00.000Z';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const scanner: MalwareScanner = { async scan() { return { verdict: 'clean' }; } };
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const form = (overrides: Partial<ConveyanceFormInput> = {}): ConveyanceFormInput => ({
  businessName: 'Client office', clientName: 'Northwind', visitedDate: '2026-11-15',
  visitedTime: '10:30', mode: 'uber', modeDescription: '', amount: '480.50', receipt: null,
  ...overrides,
});

beforeAll(async () => {
  env = await phase7Database();
  await env.pool.execute("INSERT INTO user_roles(id,user_id,role_id,effective_from) VALUES(UUID(),?,'20000000-0000-4000-8000-000000000003','2026-01-01')", [USER(7)]);
  await env.pool.execute("INSERT INTO employee_division_assignments(id,employee_id,division_id,department_id,lead_employee_id,effective_from,allocation_percent_basis_points,expected_weekly_minutes,is_primary) VALUES(UUID(),?,'10000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001',?,'2026-01-01',10000,2100,TRUE)", [EMPLOYEE(7), EMPLOYEE(2)]);
  storeRoot = mkdtempSync(join(tmpdir(), 'conveyance-files-'));
  files = new FileApplication(env.pool, new LocalObjectStore(storeRoot, 'http://localhost:3000'), scanner, { now: () => NOW });
});
afterAll(async () => {
  await env?.close();
  if (storeRoot) rmSync(storeRoot, { recursive: true, force: true });
});
const service = async (number: number) => new MysqlConveyanceService(env.pool, await env.actor(number), () => NOW);

async function uploadReceipt() {
  const actor = await env.actor(7);
  const started = data(await files.initiate(actor, {
    ownerType: 'conveyance_claim', ownerId: EMPLOYEE(7), fileName: 'receipt.pdf',
    mediaType: 'application/pdf', sizeBytes: PDF.length, sha256: sha(PDF),
  }));
  data(await files.receive(actor, started.attachment.id, Readable.from([PDF])));
  data(await files.complete(actor, started.attachment.id));
  return started.attachment.id;
}

describe('Backend Phase 11 conveyance', () => {
  it('routes Employee to Team Lead, then waits for both parallel reviewers', async () => {
    const employee = await service(7), lead = await service(2), hr = await service(4), admin = await service(1);
    const created = data(await employee.submit(USER(7), form()));
    expect(created).toMatchObject({ amountDisplay: 'BDT 480.50', stage: 'team_lead_review' });
    expect((await hr.get(USER(4), created.id)).status).toBe('not_found');
    expect(data(await lead.decide(USER(2), created.id, { decision: 'approved', reason: '' })).stage).toBe('reviewer_review');
    expect(data(await hr.decide(USER(4), created.id, { decision: 'approved', reason: '' })).outcome).toBeNull();
    expect(data(await admin.decide(USER(1), created.id, { decision: 'approved', reason: '' })).outcome).toBe('approved');
  });

  it('sends a Team Lead own claim directly to HR and Super Administrator', async () => {
    const lead = await service(2);
    expect(data(await lead.submit(USER(2), form())).stage).toBe('reviewer_review');
  });

  it('validates journey time, Other details and exact BDT precision', async () => {
    const employee = await service(7);
    expect((await employee.submit(USER(7), form({ visitedDate: '2026-11-17' }))).status).toBe('validation_failure');
    expect((await employee.submit(USER(7), form({ mode: 'other', modeDescription: '' }))).status).toBe('validation_failure');
    expect((await employee.submit(USER(7), form({ amount: '1.001' }))).status).toBe('validation_failure');
    const other = data(await employee.submit(USER(7), form({ mode: 'other', modeDescription: 'Rickshaw', amount: '19.99' })));
    expect(other).toMatchObject({ modeLabel: 'Other', modeDescription: 'Rickshaw', amountDisplay: 'BDT 19.99' });
    const [stored] = await env.rows('SELECT amount,submitted_at_utc,visited_at_utc FROM conveyance_claims WHERE id=?', [other.id]);
    expect(String(stored.amount)).toBe('19.99');
    expect(new Date(String(stored.submitted_at_utc)).toISOString()).toBe(NOW);
  });

  it('supports rejection, withdrawal, identical not-found and append-only reviews', async () => {
    const employee = await service(7), lead = await service(2), outsider = await service(6);
    const rejected = data(await employee.submit(USER(7), form()));
    expect((await lead.decide(USER(2), rejected.id, { decision: 'rejected', reason: '' })).status).toBe('validation_failure');
    expect(data(await lead.decide(USER(2), rejected.id, { decision: 'rejected', reason: 'Not a business journey' })).outcome).toBe('rejected');
    const open = data(await employee.submit(USER(7), form()));
    expect(data(await employee.withdraw(USER(7), open.id)).outcome).toBe('withdrawn');
    expect(await outsider.get(USER(6), open.id)).toEqual(await outsider.get(USER(6), randomUUID()));
    const [review] = await env.rows('SELECT id FROM conveyance_reviews WHERE claim_id=?', [rejected.id]);
    await expect(env.pool.execute('UPDATE conveyance_reviews SET reason=? WHERE id=?', ['changed', review.id])).rejects.toThrow();
  });

  it('serializes concurrent decisions for the same reviewer role', async () => {
    const lead = await service(2), hr = await service(4);
    const created = data(await lead.submit(USER(2), form()));
    const results = await Promise.all([
      hr.decide(USER(4), created.id, { decision: 'approved', reason: '' }),
      hr.decide(USER(4), created.id, { decision: 'approved', reason: '' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['conflict', 'success']);
  });

  it('uses the Phase 7 receipt pipeline and applies claim visibility before download', async () => {
    const attachmentId = await uploadReceipt();
    const employee = await service(7), lead = await service(2), hr = await service(4);
    const receipt = { attachmentId, fileName: 'receipt.pdf', sizeBytes: PDF.length, mimeType: 'application/pdf' };
    const claim = data(await employee.submit(USER(7), form({ receipt })));
    expect(claim.receipt.state).toBe('processing');
    expect(await files.scanPending()).toMatchObject({ clean: 1 });
    expect(data(await employee.get(USER(7), claim.id)).receipt.state).toBe('attached');
    expect(data(await files.download(await env.actor(2), attachmentId)).kind).toBe('stream');
    expect((await files.download(await env.actor(4), attachmentId)).status).toBe('not_found');
    expect((await files.download(await env.actor(1), attachmentId)).status).toBe('not_found');
    expect(await files.download(await env.actor(6), attachmentId)).toEqual(await files.download(await env.actor(6), randomUUID()));
    expect((await files.deactivate(await env.actor(7), attachmentId, 'Replace it')).status).toBe('permission_denied');
    data(await lead.decide(USER(2), claim.id, { decision: 'approved', reason: '' }));
    expect(data(await hr.getReceipt(USER(4), claim.id)).id).toBe(attachmentId);
    expect(data(await files.download(await env.actor(4), attachmentId)).kind).toBe('stream');
    expect(data(await files.download(await env.actor(1), attachmentId)).kind).toBe('stream');
    expect(await env.rows("SELECT action FROM audit_events WHERE resource_id=? AND action='file.downloaded'", [attachmentId])).toHaveLength(3);
  });

  it('reroutes an open claim when the effective Team Lead changes and escalates if none remains', async () => {
    const employee = await service(7);
    const created = data(await employee.submit(USER(7), form()));
    await env.pool.execute("UPDATE department_lead_assignments SET effective_to='2026-10-03' WHERE id='23000000-0000-4000-8000-000000000002'");
    await env.pool.execute("INSERT INTO department_lead_assignments(id,department_id,lead_employee_id,effective_from,reason) VALUES(UUID(),'22000000-0000-4000-8000-000000000001',?,'2026-10-04','Conveyance reassignment test')", [EMPLOYEE(8)]);
    const newLead = await service(8);
    await newLead.refreshAssignments();
    expect(data(await newLead.get(USER(8), created.id)).canDecide).toBe(true);
    await env.pool.execute("UPDATE department_lead_assignments SET effective_to='2026-10-04' WHERE department_id='22000000-0000-4000-8000-000000000001' AND lead_employee_id=? AND effective_to IS NULL", [EMPLOYEE(8)]);
    await newLead.refreshAssignments();
    expect(data(await (await service(4)).get(USER(4), created.id)).stage).toBe('reviewer_review');
    expect(await env.rows("SELECT action FROM audit_events WHERE resource_id=? AND action IN ('conveyance.team_lead.reassigned','conveyance.team_lead.unavailable_escalation')", [created.id])).toHaveLength(2);
  });
});
