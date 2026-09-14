import { describe, it, expect, vi } from 'vitest';
import { handleReportingMutation } from './http';
const origin = 'http://localhost:3000';
describe('reporting HTTP boundary', () => {
    it('rejects a foreign origin before constructing services', async () => { const factory = vi.fn(); const r = await handleReportingMutation(new Request(origin, { method: 'POST', headers: { origin: 'https://evil.invalid' }, body: '{}' }), factory, origin); expect(r.status).toBe(403); expect(factory).not.toHaveBeenCalled(); });
    it('rejects worker advancement and unknown request fields', async () => { for (const body of [{ operation: 'export.process', id: 'guess' }, { operation: 'report.run', reportKey: 'employee-hours', query: {}, userId: 'impersonated' }]) {
        const factory = vi.fn();
        const r = await handleReportingMutation(new Request(origin, { method: 'POST', headers: { origin }, body: JSON.stringify(body) }), factory, origin);
        expect(r.status).toBe(400);
        expect(factory).not.toHaveBeenCalled();
    } });
    it('returns private safe errors for dependency failures', async () => { const r = await handleReportingMutation(new Request(origin, { method: 'POST', headers: { origin }, body: JSON.stringify({ operation: 'report.run', reportKey: 'employee-hours', query: {} }) }), () => { throw new Error('database password secret'); }, origin); expect(await r.text()).not.toContain('password'); expect(r.headers.get('cache-control')).toContain('no-store'); });
});
