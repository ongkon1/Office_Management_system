# Phase 8 — Responsive, Accessibility and Quality Hardening Verification

Phase 8 builds no screens. Its deliverable is *evidence*, and evidence is only worth having if it can fail — so the four new gates were written to look for defects the existing ones structurally cannot see, and they found nine.

## New Gates

| Gate | Command | Covers | Result |
|---|---|---|---:|
| Accessibility | `npm run audit:a11y` | `FE-0810`–`FE-0814` | 217/217 |
| Content stress and interaction | `npm run audit:stress` | `FE-0803`, `FE-0805`, `FE-0825`, `FE-0826` | 63/63 |
| Role journeys | `npm run audit:journeys` | `FE-0821` | 41/41 |
| Performance | `npm run audit:perf` | `FE-0827` | 16/16 |

Each runs against the real rendered page. Nothing here is inferred from source.

## What Each Gate Asks

**Accessibility** — can a keyboard alone sign in, open a drawer and close it; is the skip link the first tab stop and does it work; is focus trapped in an overlay and restored on close; does every route have one `h1`, no skipped heading level, one `main`, labelled landmarks and a page title; is every control named and every field labelled; are decorative icons hidden; do tables carry captions and scoped headers; does anything depend on colour alone; does the page reflow at 200% zoom and at 200% text size; does reduced motion suppress animation; is a validation failure announced.

**Content stress** — the responsive audit proves the layout holds with *this* dataset, which is not the same as proving it holds. This injects a 43-character name, a 90-character project title, `BDT 12,345,678,901.99`, and labels padded 60% (roughly English → Bengali) into the live DOM, then re-measures at 375, 768 and 1440 px. It is a test of the CSS rather than of the fixtures.

**Role journeys** — each phase gate proves one screen behaves. This proves a *person* gets through their day: the employee records and reads a classified day, the Team Lead reviews an exception and raises a correction, HR verifies a period, Finance moves from verified hours to a payroll-ready preview, Management explores read-only, the administrator clears two-factor and administers. A failure means the demo itself is broken.

**Performance** — DOM node count and cumulative layout shift, measured in the browser.

## Defects Found and Fixed

| Defect | Found by | Fix |
|---|---|---|
| **A clickable table row was mouse-only.** `onRowClick` set `cursor-pointer` and a click handler on `<tr>` and `<li>` with no `tabIndex` and no key handler, so a keyboard user could not reach or activate it. Present since Phase 1 | stress, `FE-0826` | `tabIndex`, Enter/Space handling and a focus ring; the handler ignores events from controls inside the row |
| **Every card heading skipped a level.** `CardHeader` defaulted to `h3` directly under the page `h1`, so heading navigation jumped h1 → h3 on 14 routes | a11y, `FE-0811` | Default changed to `h2`; `h3` is now passed only where a card genuinely nests |
| **The focus trap could silently disable itself.** It filtered focusables by `offsetParent !== null`, which is `null` for descendants of a fixed-position container in some engines — and always `null` in jsdom, so the behaviour was untestable | component test | Filter on computed `display`/`visibility` instead, which asks the question actually being asked |
| **A `Card` stretched its grid track.** A card is nearly always a grid child, and grid children default to `min-width: auto`, so a long title pushed the whole page sideways at 375 px | stress, `FE-0803` | `min-w-0` on `Card` and on the chart `figure`, at the component rather than ~40 call sites |
| **`CardHeader` actions could not wrap.** `shrink-0` on the actions container meant a long title had nothing to give — the same defect fixed in `PageHeader` in Phase 3 | stress, `FE-0803` | `flex-wrap` and `min-w-0`, matching the `PageHeader` fix |
| **A `Badge` could not wrap.** `whitespace-nowrap` on a translated-length label overflowed the viewport | stress, `FE-0803` | Removed `whitespace-nowrap`, added `max-w-full min-w-0 break-words` |
| **A loading metric announced nothing.** The skeleton is `aria-hidden`, so a screen-reader user heard the label and then silence with no indication a value was coming | state-coverage test | `role="status"`, `aria-busy` and an `sr-only` "Loading {label}" |
| **The recorded reason for an exception never reached the reviewer.** A Team Lead opening a Critical day saw the classification and the entries but not the explanation the employee was *required* to give for it | journeys, team-lead | `overtimeReason` and `criticalExplanation` added to `TodaySummaryView` and surfaced in the anomaly panel, with an explicit warning when a critical day has none |
| **The donut centre used an arbitrary font size.** `text-[1.25rem]` instead of the type scale, so a chart's most prominent number sat a step off every other figure | stress, `FE-0825` | Uses `text-h3` and `text-caption` tokens |

The first and last two are the ones worth dwelling on. The clickable row had been shipped in every table since Phase 1 and passed every gate, because no gate had ever asked whether a mouse affordance was matched by a keyboard one. The missing exception reason was invisible to every automated check because the screen was *correct* — it simply omitted the one field that makes the review possible; only walking the journey as a Team Lead surfaced it.

## Checks That Were Wrong, and Removed

Three of my own checks were over-broad or unstable, and are recorded here rather than quietly tuned:

- **In-text link decoration** flagged every card wrapped in an anchor inside an `<li>`. WCAG 1.4.1 concerns a link *within a block of text*; a link that is the entire content of its parent has no surrounding text to differ from. Narrowed to genuinely inline links.
- **Text clipping** flagged every `sr-only` element, which is a deliberately clipped 1 px box and is itself the readable alternative. Excluded, along with SVG marks, which are drawn rather than laid out.
- **Script transfer ratio** measured the dev server's compilation order, not the application: whichever route compiled first paid for the shared graph, so identical code read as 5 MB cold and 1 KB warm. A check that flips with cache state is worse than no check, so it was **removed**, and script size is now reported without being gated. Bundle size is a production-build measurement and belongs with demo packaging (`FE-0903`).

## `FE-0825` Is Not Complete

Its measurable half is automated and passing: type-scale consistency, clipping, overflow at four widths, cumulative layout shift, and WCAG colour contrast. Its other half — spacing rhythm, alignment, visual hierarchy — is a judgement a person has to make by looking at the screens. It stays `[~]`, and that review is the same stakeholder walkthrough the Phase 1 showcase criterion has been waiting on.

## Optimisation (`FE-0827`)

- Fonts already use `next/font` with a Latin subset, `display: swap`, four weights and a real fallback stack — no change needed, confirmed rather than assumed.
- Icons are named `lucide-react` imports and tree-shake.
- The five unused Next.js starter SVGs were removed from `public/`.
- Avatar images are `loading="lazy"` and `decoding="async"`.
- Client boundaries were audited: every `(app)` route is a client component because the session guard is client-side by design, and no component carries `'use client'` without needing it.
- Large-list rendering was measured rather than assumed: the biggest table renders 132 rows and 1,401 DOM nodes, well inside the 6,000-node budget.

Cumulative layout shift is **0.000 on every route measured**.

## Automated Evidence

| Gate | Result |
|---|---:|
| `npm run audit:a11y` | 217/217 accessibility checks pass |
| `npm run audit:stress` | 63/63 content-stress, interaction and consistency checks pass |
| `npm run audit:journeys` | 41/41 role journey steps pass |
| `npm run audit:perf` | 16/16 performance checks pass |
| `npm run audit:responsive` | 268/268 route × width combinations pass; 22,694 elements contrast-checked |
| `npm run audit:contrast` | 48/48 token pairings pass |
| `npm run audit:flows` … `flows7` | 16, 18, 20, 51, 40, 55 — all pass |
| `npm run test` | 264/264 tests pass (50 new: component, state-coverage and reconciliation) |
| `npm run verify` | Type check, lint, contrast, tests and a 61-route production build pass |

The reconciliation suite (`FE-0823`) deserves a note: every expectation in it is derived from the calculation engine at run time rather than hard-coded, so it stays true if the fixtures change and fails only if two screens genuinely disagree.
