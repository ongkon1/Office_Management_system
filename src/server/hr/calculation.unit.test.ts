import { describe, it, expect } from 'vitest';
import { scheduledWindow } from './jobs';
import { AREAS, DEFAULT_WEIGHTS, weightedScore, completeCompetencies, COMPETENCIES } from './evaluations';
describe('evaluation weights', () => {
    it('uses all six independent areas with 30/25/15/10/10/10', () => {
        expect(Object.values(DEFAULT_WEIGHTS)).toEqual([30, 25, 15, 10, 10, 10]);
        expect(weightedScore(AREAS.map((area, index) => ({ area, score: index === 0 ? 5 : 3, comment: null })), DEFAULT_WEIGHTS)).toBe(3.6);
    });
    it('rejects missing/duplicate areas and invalid weight totals', () => {
        expect(weightedScore([], DEFAULT_WEIGHTS)).toBeNull();
        expect(weightedScore(AREAS.map(() => ({ area: 'task_completion', score: 5, comment: null })), DEFAULT_WEIGHTS)).toBeNull();
        expect(weightedScore(AREAS.map(area => ({ area, score: 3, comment: null })), { ...DEFAULT_WEIGHTS, task_completion: 31 })).toBeNull();
    });
});
it('scheduled monthly retries retain the scheduled Dhaka reporting month', () => {
    expect(scheduledWindow('2026-10-31T20:00:00Z', true)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(scheduledWindow('2026-10-09T19:00:00Z', false)).toEqual({ from: '2026-10-09', to: '2026-10-09' });
});

it('requires all nine qualitative competencies without changing the six weighted totals', () => {
    const scores = AREAS.map(area => ({ area, score: 4, comment: 'Evidence', competencies: COMPETENCIES[area].map(key => ({ area: key, score: 3, comment: 'Specific evidence' })) }));
    expect(completeCompetencies(scores)).toBe(true);
    expect(weightedScore(scores, DEFAULT_WEIGHTS)).toBe(4);
    expect(completeCompetencies(scores.map(s => ({ ...s, competencies: [] })))).toBe(false);
    expect(completeCompetencies(scores.map(s => ({ ...s, competencies: s.competencies.map(c => ({ ...c, comment: ' ' })) })))).toBe(false);
});
