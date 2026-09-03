# Contrast Audit

Covers `FE-0108` and the full-white aquatic theme refresh. It verifies semantic colour pairings in `src/app/globals.css` against WCAG 2.2 AA.

| Field | Value |
|---|---|
| Standard | WCAG 2.2 AA - 1.4.3 (text 4.5:1), 1.4.11 (non-text 3:1) |
| Theme audited | Full-white aquatic light theme |
| Command | `npm run audit:contrast` |
| Script | `scripts/contrast-audit.mjs` |
| Result | **48/48 pass** |

## 1. Enforcement

The audit parses colour tokens directly from `src/app/globals.css`. A token change therefore affects the audit automatically. The check runs inside `npm run verify` alongside type checking, linting, tests, and the production build.

Thresholds:

- Body text and small control labels require at least 4.5:1.
- Control borders, focus rings, brand indicators, and chart series require at least 3:1.
- Adjacent chart series require at least 1.2 luminance separation so charts remain distinguishable when printed or viewed without reliable hue perception.
- Day status remains shape + text + colour; passing contrast never makes colour the only status signal.

## 2. Aquatic Colour Strategy

| Purpose | Token | Value | Usage decision |
|---|---|---:|---|
| Primary canvas | `--color-canvas` | `#FFFFFF` | Full-white application background |
| Secondary surface | `--color-surface-sunken` | `#F2FBFA` | Table headers, hover states, secondary sections, disabled surfaces |
| Brand teal | `--color-brand` | `#0F9D8A` | Indicators, borders, and graphical brand accents |
| Brand dark | `--color-brand-dark` | `#087F73` | Accessible action and text foundation |
| Brand light | `--color-brand-light` | `#D9F5F1` | Soft selected and pressed treatment |
| Highlight | `--color-highlight` | `#14B8A6` | Decorative highlights and input focus border |
| Highlight hover | `--color-highlight-hover` | `#0D9488` | Aquatic graphical hover state |
| Soft highlight | `--color-accent-subtle` | `#ECFEFA` | Active navigation, selected rows, subtle callouts |
| Primary text | `--color-ink` | `#0F172A` | Headings and body text |
| Secondary text | `--color-ink-muted` | `#475569` | Supporting text |
| Muted text | `--color-ink-subtle` | `#64748B` | Captions and low-emphasis metadata |
| Border | `--color-border` | `#E2E8F0` | Cards, tables, separators, and navbar/sidebar edges |

The requested `#0F9D8A` and `#14B8A6` produce only 3.38:1 and 2.49:1 respectively against white, so they cannot carry small white text at the required 4.5:1. Primary and accent buttons therefore use the requested dark aquatic `#087F73`, which gives white labels 4.89:1. The brighter colours remain present for brand indicators, borders, and highlights.

## 3. Audit Results

### Text and Actions

| Pairing | Ratio | Minimum |
|---|---:|---:|
| Primary text on white canvas/surface | 17.85:1 | 4.5 |
| Primary text on aquatic-tint surface | 16.96:1 | 4.5 |
| Secondary text on white | 7.58:1 | 4.5 |
| Secondary text on aquatic tint | 7.20:1 | 4.5 |
| Muted text on white | 4.76:1 | 4.5 |
| White text on primary action | 4.89:1 | 4.5 |
| White text on primary hover | 6.85:1 | 4.5 |
| Aquatic link text on white | 4.89:1 | 4.5 |
| Aquatic link text on soft highlight | 4.69:1 | 4.5 |

### Status and Feedback

| Status | Text colour | Surface | Ratio | Minimum |
|---|---:|---:|---:|---:|
| Missing | `#64748B` | `#F8FAFC` | 4.55:1 | 4.5 |
| Under-time / Warning | `#92400E` | `#FFFBEB` | 6.84:1 | 4.5 |
| Complete / Success | `#166534` | `#F0FDF4` | 6.81:1 | 4.5 |
| Overtime | `#9A3412` | `#FFF7ED` | 6.88:1 | 4.5 |
| Critical / Error | `#DC2626` | `#FFF7F7` | 4.58:1 | 4.5 |
| Info | `#075985` | `#F0F9FF` | 7.09:1 | 4.5 |

The requested success `#16A34A`, warning `#F59E0B`, error `#DC2626`, and info `#0284C7` remain represented as semantic brand/status tokens. Darker text companions are used where the requested colour does not meet text contrast on a light status surface.

### Controls and Focus

| Pairing | Ratio | Minimum |
|---|---:|---:|
| Strong control border on white | 3.20:1 | 3.0 |
| Strong control border on aquatic tint | 3.04:1 | 3.0 |
| Dark aquatic focus ring on white | 4.89:1 | 3.0 |
| Dark aquatic focus ring on aquatic tint | 4.65:1 | 3.0 |
| Brand indicator on white | 3.38:1 | 3.0 |

Inputs use the requested bright teal focus border plus a dark aquatic outer focus ring. The paired treatment preserves the visual specification and a clearly perceivable keyboard focus indicator.

### Chart Series

| Series | Value | Contrast on white | Separation from previous |
|---|---:|---:|---:|
| Chart 1 | `#087F73` | 4.89:1 | - |
| Chart 2 | `#0F9D8A` | 3.38:1 | 1.45 |
| Chart 3 | `#0F4C5C` | 9.51:1 | 2.81 |
| Chart 4 | `#0D9488` | 3.74:1 | 2.54 |
| Chart 5 | `#155E75` | 7.27:1 | 1.94 |
| Chart 6 | `#0284C7` | 4.10:1 | 1.77 |

Chart colours stay within teal, cyan, and aquatic blue. A visible legend and complete data table remain available, so colour is not the only route to chart values.

## 4. Scope and Limits

- This project currently supports only the approved light theme. There is no active or staged dark-theme token override.
- The token audit verifies declared colour pairings. The responsive browser audit separately checks rendered opaque backgrounds and interactive targets.
- Translucent overlay scrims are not modelled as text surfaces; their foreground panels remain opaque white.
