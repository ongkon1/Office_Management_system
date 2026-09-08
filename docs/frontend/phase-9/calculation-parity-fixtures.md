# Calculation Parity Fixtures

Backend implementations must reproduce these seeded outcomes from `src/lib/calculation/engine.ts` and `src/fixtures/index.ts`.

| Scenario | Fixture/account | Expected result |
|---|---|---|
| Cross-division complete | Nadia, 2026-09-02 | 420 active minutes, one 60-minute recognized break, 480 total, `Complete`; contributions 180/120/120 by PowerInAI/Government Projects/WesternCF. |
| Under-time | Sadia, 2026-08-20 | 419 active minutes; `Under-time` because active threshold is unmet even when the recognized break is present. |
| Overtime boundary | Tanvir, seeded overtime day | Above 480 through exactly 720 total minutes; reason is required. |
| Critical | Tanvir, critical day | Above 720 total minutes; explanation is required and Team Lead + HR notifications are emitted. |
| Missing | Sadia, 2026-08-20 | No time and no approved leave; `Missing`. |
| Approved leave | Sadia, 2026-08-19 | Leave covers the day; no missing-time requirement. |
| Half-day leave | Sadia, 2026-08-18 | Approved half-day leave changes the applicable requirement. |
| Verified/locked | July 2026 period | Entries are reproducible with policy version and reject ordinary mutation after HR verification. |
| Restricted cost | Shakil vs Mahmuda | Same authorized hours; Shakil receives no money value and renders `Restricted`, Mahmuda receives fixed-precision BDT. |

