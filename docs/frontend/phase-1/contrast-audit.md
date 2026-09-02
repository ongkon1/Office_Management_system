# Contrast Audit

Covers `FE-0108`. Verifies every semantic colour pairing in `src/app/globals.css` against WCAG 2.2 AA.

| Field | Value |
|---|---|
| Standard | WCAG 2.2 AA — 1.4.3 (text 4.5:1), 1.4.11 (non-text 3:1) |
| Theme audited | Light (the MVP product theme) |
| Command | `npm run audit:contrast` |
| Script | `scripts/contrast-audit.mjs` |
| Result | **47/47 pass** |

## 1. How This Is Enforced

The audit script parses the colour tokens directly out of `src/app/globals.css` rather than holding its own copy of the palette. A token changed without re-checking its pairings therefore fails the audit instead of shipping silently. The check runs as part of `npm run verify`, so it gates the same pipeline as type checking, linting, tests, and the production build.

Two thresholds are applied:

- **4.5:1** for any pairing where the foreground carries text.
- **3:1** for control borders, focus rings, and chart series — WCAG 1.4.11 non-text contrast.

A third check, not required by WCAG but required by this product, is described in section 4.

## 2. Corrections Made During the Audit

The first run failed five checks. Each was fixed by changing the token, not by lowering the threshold or granting an exception.

| Token | Before | After | Failure corrected |
|---|---|---|---|
| `--color-ink-subtle` | `#78716c` | `#6e6760` | 4.41:1 on canvas — below the 4.5:1 text minimum |
| `--color-accent` | `#9a6f16` | `#835e12` | 4.14:1 on canvas and 4.19:1 on its own subtle surface |
| `--color-accent-hover` | `#835e12` | `#694a0d` | Had to move darker to stay distinct from the new accent |
| `--color-border-strong` | `#cdc6b9` | `#8b8070` | 1.70:1 on surface — control edges were far below 3:1 |
| `--color-chart-3` … `-6` | reordered | reordered | Chart 3 and 4 differed by only 1.02 in luminance |

The border correction is the most visible: a control edge at 1.70:1 is decorative, not perceivable, and every input, select, and table border in the system depended on it. Enterprise dashboards routinely ship this failure because the border still *looks* present to a designer on a calibrated display.

## 3. Results

### 3.1 Text on surfaces

| Pairing | Ratio | Minimum |
|---|---:|---:|
| Body text on canvas | 15.81:1 | 4.5 |
| Body text on surface | 17.21:1 | 4.5 |
| Body text on sunken surface | 14.86:1 | 4.5 |
| Muted text on canvas | 7.01:1 | 4.5 |
| Muted text on surface | 7.63:1 | 4.5 |
| Muted text on sunken surface | 6.59:1 | 4.5 |
| Subtle text on canvas | 5.11:1 | 4.5 |
| Subtle text on surface | 5.57:1 | 4.5 |
| Inverse text on primary button | 13.64:1 | 4.5 |
| Inverse text on primary hover | 16.36:1 | 4.5 |
| Inverse text on inverse surface | 16.36:1 | 4.5 |

### 3.2 Accent

| Pairing | Ratio | Minimum |
|---|---:|---:|
| Accent text on surface | 5.87:1 | 4.5 |
| Accent text on canvas | 5.39:1 | 4.5 |
| Accent text on accent subtle | 5.46:1 | 4.5 |
| Accent button label | 5.87:1 | 4.5 |
| Accent button label on hover | 8.12:1 | 4.5 |

### 3.3 Day status

Each status is checked both on its own tinted surface (badge) and on plain surface (inline text).

| Status | On its surface | On surface | Minimum |
|---|---:|---:|---:|
| Missing | 5.05:1 | 5.74:1 | 4.5 |
| Under-time | 5.10:1 | 5.54:1 | 4.5 |
| Complete | 5.79:1 | 6.47:1 | 4.5 |
| Overtime | 5.44:1 | 6.08:1 | 4.5 |
| Critical | 6.57:1 | 7.46:1 | 4.5 |

Contrast alone does not satisfy the requirement here. `REQ-TIME-017` forbids communicating these five states by colour at all, so `StatusIndicator` renders a distinct shape and a text label alongside the colour, and `src/components/ui/status-indicator.test.tsx` asserts that every status has both.

### 3.4 Feedback

| Pairing | Ratio | Minimum |
|---|---:|---:|
| Success text on its surface | 5.79:1 | 4.5 |
| Warning text on its surface | 5.10:1 | 4.5 |
| Danger text on its surface | 6.57:1 | 4.5 |
| Info text on its surface | 6.33:1 | 4.5 |

### 3.5 Non-text (WCAG 1.4.11)

| Pairing | Ratio | Minimum |
|---|---:|---:|
| Control border on surface | 3.87:1 | 3.0 |
| Control border on canvas | 3.56:1 | 3.0 |
| Control border on sunken surface | 3.35:1 | 3.0 |
| Focus ring on canvas | 6.59:1 | 3.0 |
| Focus ring on surface | 7.17:1 | 3.0 |
| Focus ring on sunken surface | 6.20:1 | 3.0 |

The focus ring is a blue that appears nowhere else in the palette. That is deliberate: focus must never be confused with a status, a selection, or an accent, and it must remain visible on every surface a control can sit on.

## 4. Chart Series Separation

| Series | Hex | On surface | Separation from previous |
|---|---|---:|---:|
| chart-1 | `#2f5d7c` | 7.05:1 | — |
| chart-2 | `#9a6f16` | 4.51:1 | 1.56 |
| chart-3 | `#43506b` | 8.08:1 | 1.79 |
| chart-4 | `#a55a2a` | 5.13:1 | 1.58 |
| chart-5 | `#1f6b45` | 6.47:1 | 1.26 |
| chart-6 | `#9d5a86` | 4.95:1 | 1.31 |

Adjacent series must differ in **lightness** by at least 1.2, not only in hue. A palette that separates by hue alone collapses into a single grey band when printed, projected, or viewed by someone with a colour-vision deficiency — and division-contribution charts are exactly the sort of thing that gets printed for a payroll meeting. The original order placed a green and a purple 1.02 apart, which is indistinguishable; the series were reordered so each neighbour alternates lighter and darker.

Series colour is still never the only encoding: `ChartContainer` always renders a legend with values and keeps a full data table in the DOM.

## 5. Scope and Limits

- **Light theme only.** Dark values are staged under `[data-theme="dark"]` in `globals.css` but are not activated in the MVP (`FE-0112`), and are not audited here. Auditing them is a prerequisite of ever enabling dark mode.
- **Token pairings, not rendered screens.** This audit proves the palette is sound. It does not prove that every screen uses the right pairing — for example, placing muted text on an accent surface would be a real failure this script cannot see. Rendered-screen verification is `FE-0813` in Phase 8.
- **Opacity is not modelled.** Where a component composites a translucent surface (the top bar's `bg-surface/85`, dialog backdrops), the effective ratio differs from the token pair. These are navigation and overlay surfaces carrying no body text; any translucent surface that later carries text must be re-checked against its composited value.
