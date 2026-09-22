import { describe, expect, it, vi } from 'vitest';
import { handleTimeMutation } from './http';
import type { createTimeServices } from './composition';
const origin = 'http://localhost:3000';
const request = (body: string, source = origin) => new Request(`${origin}/api/time`, { method: 'POST', headers: { origin: source, 'content-type': 'application/json' }, body });
describe('Phase 4 HTTP boundary', () => {
    it('rejects cross-origin mutations before constructing database services', async () => { const services = vi.fn(); const r = await handleTimeMutation(request('{}', 'https://other.invalid'), services, origin); expect(r.status).toBe(403); expect(services).not.toHaveBeenCalled(); });
    it('returns field guidance for malformed and invalid JSON', async () => { for (const body of ['{', '{"operation":"unknown"}', '{"operation":"create","input":"invalid"}']) {
        const r = await handleTimeMutation(request(body), vi.fn(), origin);
        expect(r.status).toBe(400);
        const result = await r.json();
        expect(result.fieldErrors[0].guidance).toBeTruthy();
    } });
    it('requires explicit optimistic version on updates', async () => { const r = await handleTimeMutation(request(JSON.stringify({ operation: 'update', id: 'entry', input: {} })), vi.fn(), origin); expect(r.status).toBe(400); });
    it('preserves locked conflicts and forbids response caching', async () => { const services = () => ({ timesheets: { deleteWorkLog: async () => ({ status: 'conflict', code: 'PERIOD_LOCKED', message: 'Locked.', guidance: 'Request an amendment.' }) } } as unknown as ReturnType<typeof createTimeServices>); const r = await handleTimeMutation(request(JSON.stringify({ operation: 'delete', id: 'log', expectedVersion: 1 })), services, origin); expect(r.status).toBe(409); expect(r.headers.get('cache-control')).toBe('private, no-store'); });
    it('maps dependency failures to safe values without database details', async () => { const services = () => { throw new Error('secret database password'); }; const r = await handleTimeMutation(request(JSON.stringify({ operation: 'delete', id: 'log', expectedVersion: 1 })), services, origin); expect(r.status).toBe(503); expect(await r.text()).not.toContain('password'); });
});

describe('MBE-0202 retired HTTP contract', () => {
    it.each(['timer.start', 'timer.stop', 'timer.cancel'])('returns 410 for %s without touching database services', async operation => {
        const services = vi.fn(); const response = await handleTimeMutation(request(JSON.stringify({ operation })), services, origin);
        expect(response.status).toBe(410); expect(response.headers.get('Time-Contract-Version')).toBe('2');
        expect(await response.json()).toMatchObject({ code: 'OPERATION_RETIRED', retryable: false }); expect(services).not.toHaveBeenCalled();
    });
    it.each(['startTime', 'endTime', 'entryMethod', 'activeMinutes'])('rejects legacy field %s instead of silently stripping it', async field => {
        const services = vi.fn(); const response = await handleTimeMutation(request(JSON.stringify({ operation: 'create', input: { [field]: null } })), services, origin);
        expect(response.status).toBe(410); expect(services).not.toHaveBeenCalled();
    });
});
