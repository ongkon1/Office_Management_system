import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { checkUpload, contentMatchesType, sanitizeFileName } from '@/server/files/policy';
import { TestSignatureScanner } from '@/server/files/scanner';
import { assertObjectKey, contentDisposition } from '@/server/files/storage';
import { NOTIFICATION_TEMPLATES, canonicalType, hrefFor, relatedFromStored, storedRelated } from '@/server/notifications/catalogue';
import { NotificationDeliveryWorker, safeErrorCode } from '@/server/notifications/delivery';
import { likePattern, normalizeTerm } from '@/server/search/application';
import { isPrivateAddress, signPayload, verifyWebhookSignature, WebhookService } from '@/server/integrations/webhooks';
import { eventToProposal } from '@/server/integrations/calendar';
import { providerConfig } from '@/server/integrations/oauth';
import { INTEGRATIONS, integrationStatus } from '@/server/integrations/catalogue';
import { integrationKeyProvider } from '@/server/integrations/keys';
import { decryptSecret, encryptSecret } from '@/server/security/crypto';
import type { Pool } from 'mysql2/promise';

const SHA = 'a'.repeat(64);

describe('BE-0710 upload policy', () => {
  it('accepts a declared office document and refuses unsafe names, types and sizes', () => {
    expect(checkUpload({ ownerType: 'document', fileName: 'Handbook 2026.pdf', mediaType: 'application/pdf', sizeBytes: 1000, sha256: SHA })).toEqual({ ok: true, fileName: 'Handbook 2026.pdf' });
    expect(checkUpload({ ownerType: 'document', fileName: 'run.exe', mediaType: 'application/x-msdownload', sizeBytes: 10, sha256: SHA })).toMatchObject({ ok: false, field: 'mediaType' });
    expect(checkUpload({ ownerType: 'document', fileName: 'page.html', mediaType: 'text/html', sizeBytes: 10, sha256: SHA })).toMatchObject({ ok: false, field: 'mediaType' });
    expect(checkUpload({ ownerType: 'document', fileName: 'image.svg', mediaType: 'image/svg+xml', sizeBytes: 10, sha256: SHA })).toMatchObject({ ok: false });
    expect(checkUpload({ ownerType: 'document', fileName: 'report.pdf.exe', mediaType: 'application/pdf', sizeBytes: 10, sha256: SHA })).toMatchObject({ ok: false, field: 'fileName' });
    expect(checkUpload({ ownerType: 'profile', fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: 10, sha256: SHA })).toMatchObject({ ok: false, field: 'mediaType' });
    expect(checkUpload({ ownerType: 'message', fileName: 'big.pdf', mediaType: 'application/pdf', sizeBytes: 11 * 1024 * 1024, sha256: SHA })).toMatchObject({ ok: false, field: 'sizeBytes' });
    expect(checkUpload({ ownerType: 'task', fileName: 'notes.txt', mediaType: 'text/plain', sizeBytes: 10, sha256: 'not-a-hash' })).toMatchObject({ ok: false, field: 'sha256' });
  });

  it('strips directories and control characters from a display name, and never uses it as a key', () => {
    expect(sanitizeFileName('..\\..\\windows\\system32\\evil.pdf')).toBe('evil.pdf');
    expect(sanitizeFileName('../../etc/passwd')).toBeNull();
    expect(sanitizeFileName('re\u0000port<1>.pdf')).toBe('report1.pdf');
    expect(() => assertObjectKey('../secret')).toThrow();
    expect(() => assertObjectKey('files/2026/10/123e4567-e89b-12d3-a456-426614174000')).not.toThrow();
    expect(contentDisposition('Rapport "été".pdf')).toContain("filename*=UTF-8''Rapport%20%22%C3%A9t%C3%A9%22.pdf");
  });

  it('checks the leading bytes match the declared type', () => {
    expect(contentMatchesType('application/pdf', Buffer.from('%PDF-1.7\n'))).toBe(true);
    expect(contentMatchesType('application/pdf', Buffer.from('MZ\x90\x00'))).toBe(false);
    expect(contentMatchesType('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(contentMatchesType('text/csv', Buffer.from('a,b\n1,2'))).toBe(true);
    expect(contentMatchesType('text/csv', Buffer.from([0x61, 0x00, 0x62]))).toBe(false);
  });

  it('the development scanner rejects the EICAR test file, including across chunk boundaries', async () => {
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const scanner = new TestSignatureScanner();
    expect(await scanner.scan(Readable.from([Buffer.from('hello')]))).toEqual({ verdict: 'clean' });
    expect(await scanner.scan(Readable.from([Buffer.from(eicar.slice(0, 30)), Buffer.from(eicar.slice(30))]))).toMatchObject({ verdict: 'infected' });
  });
});

describe('BE-0701 and BE-0705 notification catalogue', () => {
  it('has fixed, content-free text for every type', () => {
    for (const template of Object.values(NOTIFICATION_TEMPLATES)) {
      expect(template.title).not.toMatch(/\$\{|\{\{/);
      expect(template.body).not.toMatch(/\$\{|\{\{/);
    }
    expect(NOTIFICATION_TEMPLATES.critical_time.mandatory).toBe(true);
  });

  it('reads legacy stored types without rewriting them', () => {
    expect(canonicalType('time.critical')).toBe('critical_time');
    expect(canonicalType('time.remark.added')).toBe('remark_added');
    expect(canonicalType('overtime')).toBe('overtime');
    expect(canonicalType('free text')).toBeNull();
  });

  it('round-trips related records and links each to its own authorized route', () => {
    const day = { type: 'timesheet' as const, employeeId: 'e1', date: '2026-09-02' };
    const stored = storedRelated(day);
    expect(relatedFromStored(stored.relatedType, stored.relatedId, stored.date)).toEqual(day);
    expect(hrefFor(day, 'e1')).toBe('/timesheets/2026-09-02');
    expect(hrefFor(day, 'lead')).toBe('/team/timesheets/e1/2026-09-02');
    expect(relatedFromStored('hr', 'x', null)).toBeNull();
  });
});

describe('BE-0704 delivery safety', () => {
  it('reduces provider errors to safe codes', () => {
    expect(safeErrorCode('Rate limit exceeded: user@example.com')).toBe('rate_limit_exceeded_user_example_com');
    expect(safeErrorCode('x'.repeat(200))).toHaveLength(64);
    expect(safeErrorCode(undefined)).toBe('unknown');
  });

  it('backs off exponentially with bounded jitter', () => {
    const worker = new NotificationDeliveryWorker({} as Pool, null, { random: () => 0.5 });
    expect([1, 2, 3, 4].map((attempt) => worker.backoffSeconds(attempt))).toEqual([60, 120, 240, 480]);
    expect(worker.backoffSeconds(20)).toBe(3600);
    const low = new NotificationDeliveryWorker({} as Pool, null, { random: () => 0 });
    const high = new NotificationDeliveryWorker({} as Pool, null, { random: () => 1 });
    expect(low.backoffSeconds(1)).toBe(48);
    expect(high.backoffSeconds(1)).toBe(72);
  });
});

describe('BE-0723 search input is matched literally', () => {
  it('escapes LIKE wildcards and normalizes control characters', () => {
    expect(likePattern('100%_done\\')).toBe('100\\%\\_done\\\\');
    expect(normalizeTerm('  ﬁle\u0000name\t ')).toBe('file name');
    expect(normalizeTerm("'; DROP TABLE users; --")).toBe("'; DROP TABLE users; --");
  });
});

describe('BE-0731 webhook signatures and destinations', () => {
  const body = JSON.stringify({ id: 'evt', type: 'task.status_changed' });

  it('verifies a valid signature and refuses tampering, wrong secrets and replays', () => {
    const now = 1_800_000_000;
    const header = { timestamp: String(now), signature: signPayload(['whsec_a'], now, body) };
    expect(verifyWebhookSignature('whsec_a', header, body, now)).toBe(true);
    expect(verifyWebhookSignature('whsec_a', header, `${body} `, now)).toBe(false);
    expect(verifyWebhookSignature('whsec_b', header, body, now)).toBe(false);
    expect(verifyWebhookSignature('whsec_a', header, body, now + 301)).toBe(false);
    expect(verifyWebhookSignature('whsec_a', { timestamp: 'abc', signature: header.signature }, body, now)).toBe(false);
  });

  it('signs with both secrets during a rotation so either verifies', () => {
    const now = 1_800_000_000;
    const signature = signPayload(['whsec_new', 'whsec_old'], now, body);
    expect(verifyWebhookSignature('whsec_new', { timestamp: String(now), signature }, body, now)).toBe(true);
    expect(verifyWebhookSignature('whsec_old', { timestamp: String(now), signature }, body, now)).toBe(true);
  });

  it('recognizes private, loopback, link-local and mapped addresses', () => {
    for (const address of ['10.0.0.1', '127.0.0.1', '172.16.5.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.1.2.3']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) expect(isPrivateAddress(address), address).toBe(false);
  });

  it('backs off webhook retries up to six hours', () => {
    const service = new WebhookService({} as Pool, integrationKeyProvider({ NODE_ENV: 'test' } as NodeJS.ProcessEnv), { random: () => 0.5 });
    expect([1, 2, 3].map((attempt) => service.backoffSeconds(attempt))).toEqual([30, 60, 120]);
    expect(service.backoffSeconds(30)).toBe(21600);
  });
});

describe('BE-0733 calendar events become proposals, never time', () => {
  const event = { id: 'e', changeKey: 'v1', allDay: false, title: 'Client  workshop', cancelled: false, declined: false };

  it('proposes whole minutes for the local start date, clipped at local midnight', () => {
    // 22:00–02:00 Dhaka (UTC+6) on 2 September: two hours belong to the 2nd.
    expect(eventToProposal({ ...event, start: '2026-09-02T16:00:00Z', end: '2026-09-02T20:00:00Z' }))
      .toEqual({ workDate: '2026-09-02', minutes: 120, description: 'Calendar: Client workshop' });
    expect(eventToProposal({ ...event, start: '2026-09-02T03:00:00Z', end: '2026-09-02T04:30:59Z' })?.minutes).toBe(90);
  });

  it('proposes nothing for all-day, cancelled, declined, zero-length or day-long events', () => {
    const base = { ...event, start: '2026-09-02T03:00:00Z', end: '2026-09-02T04:00:00Z' };
    expect(eventToProposal({ ...base, allDay: true })).toBeNull();
    expect(eventToProposal({ ...base, cancelled: true })).toBeNull();
    expect(eventToProposal({ ...base, declined: true })).toBeNull();
    expect(eventToProposal({ ...base, end: base.start })).toBeNull();
    expect(eventToProposal({ ...base, end: '2026-09-04T04:00:00Z' })).toBeNull();
  });
});

describe('BE-0734 and BE-0735 providers and catalogue', () => {
  it('offers a provider only when it is both approved and configured', () => {
    const configured = { GOOGLE_CALENDAR_CLIENT_ID: 'id', GOOGLE_CALENDAR_CLIENT_SECRET: 'secret' } as unknown as NodeJS.ProcessEnv;
    expect(providerConfig('google_calendar', configured)).toBeNull();
    expect(providerConfig('google_calendar', { ...configured, INTEGRATION_APPROVED_PROVIDERS: 'microsoft_calendar' })).toBeNull();
    expect(providerConfig('google_calendar', { ...configured, INTEGRATION_APPROVED_PROVIDERS: 'google_calendar' })?.scopes).toEqual(['https://www.googleapis.com/auth/calendar.readonly']);
  });

  it('lists every future integration as not implemented, and nothing as connected', () => {
    const statuses = Object.fromEntries(INTEGRATIONS.map((entry) => [entry.key, integrationStatus(entry, {} as NodeJS.ProcessEnv)]));
    expect(statuses).toMatchObject({ jira: 'not_implemented', slack: 'not_implemented', sso: 'not_implemented', payroll: 'not_implemented', google_calendar: 'requires_approval', rest_api: 'available' });
  });

  it('encrypts integration secrets with a key distinct from authentication, and requires one in production', () => {
    const keys = integrationKeyProvider({ NODE_ENV: 'test', BETTER_AUTH_SECRET: 's'.repeat(40) } as NodeJS.ProcessEnv);
    const envelope = encryptSecret('refresh-token', keys);
    expect(envelope).not.toContain('refresh-token');
    expect(decryptSecret(envelope, keys)).toBe('refresh-token');
    expect(() => integrationKeyProvider({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow();
    const rotated = integrationKeyProvider({ NODE_ENV: "test", INTEGRATION_ENCRYPTION_KEYS: `k2:${Buffer.alloc(32, 2).toString("base64")},k1:${Buffer.alloc(32, 1).toString("base64")}` } as NodeJS.ProcessEnv);
    const old = encryptSecret('x', integrationKeyProvider({ NODE_ENV: "test", INTEGRATION_ENCRYPTION_KEYS: `k1:${Buffer.alloc(32, 1).toString("base64")}` } as NodeJS.ProcessEnv));
    expect(decryptSecret(old, rotated)).toBe('x');
  });
});
