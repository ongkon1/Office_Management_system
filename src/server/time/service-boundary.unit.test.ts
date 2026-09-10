import { describe, expect, it } from 'vitest';
import { guardService } from './composition';

describe('time service dependency boundary', () => {
    it('returns a safe Result when a read adapter dependency throws', async () => {
        const service = guardService({ async list() { throw new Error('private database details'); } });
        const result = await service.list();
        expect(result).toMatchObject({status:'error',code:'DEPENDENCY_FAILED',retryable:true});
        expect(JSON.stringify(result)).not.toContain('private database details');
    });
    it('preserves adapter method context and successful results', async () => {
        const service = guardService({ count: 3, async list() { return {status:'success',data:this.count}; } });
        expect(await service.list()).toEqual({status:'success',data:3});
    });
});
