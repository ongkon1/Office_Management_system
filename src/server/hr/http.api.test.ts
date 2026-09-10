import { describe, it, expect, vi } from 'vitest';
import { handleHrMutation } from './http';
describe('HR HTTP boundary', () => {
    it('rejects cross-origin writes before resolving a service', async () => {
        const factory = vi.fn();
        const r = await handleHrMutation(new Request('http://localhost:3000/api/hr', { method: 'POST', headers: { origin: 'https://other.example' }, body: '{}' }), factory, 'http://localhost:3000');
        expect(r.status).toBe(403);
        expect(factory).not.toHaveBeenCalled();
    });
    it('returns field guidance for malformed commands', async () => {
        const factory = vi.fn();
        const r = await handleHrMutation(new Request('http://localhost:3000/api/hr', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: 'not JSON' }), factory, 'http://localhost:3000');
        expect(r.status).toBe(400);
        expect((await r.json()).fieldErrors[0].guidance).toBeTruthy();
        expect(factory).not.toHaveBeenCalled();
    });
    it('does not expose dependency exceptions', async () => {
        const r = await handleHrMutation(new Request('http://localhost:3000/api/hr', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: JSON.stringify({ operation: 'evaluation.period', input: {} }) }), () => {
            throw new Error('private connection details');
        }, 'http://localhost:3000');
        expect(r.status).toBe(503);
        expect(await r.text()).not.toContain('private connection details');
        expect(r.headers.get('cache-control')).toBe('private, no-store');
    });
});
