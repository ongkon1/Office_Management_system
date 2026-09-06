# Contrast Audit

Covers `FE-0108` and the PowerInAI theme. It verifies semantic colour pairings in `src/app/globals.css` against WCAG 2.2 AA.

| Field | Value |
|---|---|
| Standard | WCAG 2.2 AA - 1.4.3 (text 4.5:1), 1.4.11 (non-text 3:1) |
| Theme audited | PowerInAI violet/pink identity on a light canvas |
| Source of the identity | `https://powerinai.com/frontend/assets/css/styles.css` |
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

## 2. Inverting a Dark Brand

powerinai.com declares its own tokens, and these are taken from that stylesheet verbatim:

| Site token | Value | Role on the marketing site |
|---|---|---|
| `--primary` | `#18192b` | Page and navbar ground |
| `--accent2` / `--neon2` | `#6c63ff` | Violet half of the brand gradient |
| `--accent` / `--neon` | `#ff3c7e` | Pink half of the brand gradient |
| `--text-muted` | `#bfc6e0` | Secondary text on the dark ground |
| `--border-radius` | `18px` | Card rounding |

That palette is built to sit on a near-black canvas. **Inverting it is not a matter of swapping foreground for background**: on white, `#6c63ff` reaches only 4.32:1 and `#ff3c7e` only 3.39:1, so neither can legally carry small text or a white button label. Two of the site's own signature colours are therefore unusable for the thing they are most tempting to be used for.

The resolution is to split each identity colour by job rather than dilute it:

| Job | Colour | Why |
|---|---|---|
| Brand indicator, focus ring, chart series | `#6c63ff`, unaltered | Needs 3:1, reaches 4.32:1 — the site's violet appears at full strength |
| Anything bearing a label | `#5b52e6` (violet, one step down) | White text reaches 5.53:1; visibly the same hue family |
| Ink | `#18192b`, the site's own `--primary` | Every line of text on every screen carries the brand's temperature rather than a neutral slate |
| Secondary surface | `#f5f4ff` | A violet-tinted white is what makes a light app read as *this* brand instead of as a default |
| Gradient | `#6c63ff` → `#ff3c7e` | Kept at full vividness, but only on surfaces that carry no text |

**Pink is deliberately absent from the working UI.** `#ff3c7e` sits close enough to the Critical red (`#dc2626`) that a pink control beside a status badge would read as a severity — in a product where Critical means an employee worked over twelve hours, that is not a cosmetic risk. Pink appears on the application mark and the sign-in panel, where nothing is being classified, and in the chart palette where a legend and a data table always accompany it.

## 3. Colour Strategy

| Purpose | Token | Value | Usage decision |
|---|---|---:|---|
| Primary canvas | `--color-canvas` | `#FFFFFF` | Full-white application background |
| Secondary surface | `--color-surface-sunken` | `#F5F4FF` | Table headers, hover states, secondary sections, disabled surfaces |
| Inverse surface | `--color-surface-inverse` | `#18192B` | Tooltips and inverted chips; the site's own ground |
| Brand violet | `--color-brand` | `#6C63FF` | Indicators, focus ring, graphical brand accents |
| Brand dark | `--color-brand-dark` | `#4A41BF` | Accessible action and text foundation |
| Brand light | `--color-brand-light` | `#E8E6FF` | Soft selected and pressed treatment |
| Highlight | `--color-highlight` | `#6C63FF` | Decorative highlights and input focus border |
| Highlight hover | `--color-highlight-hover` | `#5B52E6` | Graphical hover state on cards and inputs |
| Primary action | `--color-primary` | `#5B52E6` | Buttons and links; white label at 5.53:1 |
| Soft highlight | `--color-accent-subtle` | `#F2F0FF` | Active navigation, selected rows, subtle callouts |
| Primary text | `--color-ink` | `#18192B` | Headings and body text |
| Secondary text | `--color-ink-muted` | `#4B4A68` | Supporting text |
| Muted text | `--color-ink-subtle` | `#5C5B78` | Captions and low-emphasis metadata |
| Border | `--color-border` | `#E6E4F2` | Cards, tables, separators, and navbar/sidebar edges |
| Control border | `--color-border-strong` | `#827EA0` | Input and control edges at 3.86:1 |
| Brand pink | `--color-brand-pink` | `#FF3C7E` | Gradient only — never a control, never a status |

Gradients are declared once, in `:root`, and split by obligation: `--gradient-brand` (`#5B52E6` → `#BE185D`) runs between stops that **both** hold a white label at AA, so the application mark stays readable end to end; `--gradient-brand-vivid` (`#6C63FF` → `#FF3C7E`) uses the site's unaltered stops and is only ever laid under empty space.

Radius was opened one step (`--radius-md` 8px → 10px, `--radius-xl` 16px → 20px) to match the site's 20px cards and 10px controls. The scale keeps its shape, so no component needed re-tuning.

## 4. Audit Results

### Text and Actions

| Pairing | Ratio | Minimum |
|---|---:|---:|
| Primary text on white canvas/surface | 17.32:1 | 4.5 |
| Primary text on violet-tint surface | 15.89:1 | 4.5 |
| Secondary text on white | 8.47:1 | 4.5 |
| Secondary text on violet tint | 7.77:1 | 4.5 |
| Muted text on white | 6.52:1 | 4.5 |
| White text on primary action | 5.53:1 | 4.5 |
| White text on primary hover | 7.50:1 | 4.5 |
| White text on inverse surface | 17.32:1 | 4.5 |
| Violet link text on white | 5.53:1 | 4.5 |
| Violet link text on soft highlight | 4.92:1 | 4.5 |
| White text on accent hover | 9.18:1 | 4.5 |

Every one of these is at or above the ratio the previous aquatic theme achieved, and three improve materially: muted text 4.76 → 6.52, the primary button label 4.89 → 5.53, and the control border 3.20 → 3.86.

### Status and Feedback

| Status | Text colour | Surface | Ratio | Minimum |
|---|---:|---:|---:|---:|
| Missing | `#64748B` | `#F8FAFC` | 4.55:1 | 4.5 |
| Under-time / Warning | `#92400E` | `#FFFBEB` | 6.84:1 | 4.5 |
| Complete / Success | `#166534` | `#F0FDF4` | 6.81:1 | 4.5 |
| Overtime | `#9A3412` | `#FFF7ED` | 6.88:1 | 4.5 |
| Critical / Error | `#DC2626` | `#FFF7F7` | 4.58:1 | 4.5 |
| Info | `#075985` | `#F0F9FF` | 7.09:1 | 4.5 |

**The five day classifications were not re-themed.** They are semantic, not decorative: `REQ-TIME-016`/`-017` give each one a meaning a viewer has to read correctly at a glance, and Missing and Critical already sit within 0.1 of the 4.5:1 floor. Tinting them toward violet would have bought a little visual unity at the cost of the one part of this interface where being wrong is expensive.

### Controls and Focus

| Pairing | Ratio | Minimum |
|---|---:|---:|
| Strong control border on white | 3.86:1 | 3.0 |
| Strong control border on violet tint | 3.54:1 | 3.0 |
| Focus ring on white | 4.32:1 | 3.0 |
| Focus ring on violet tint | 3.96:1 | 3.0 |
| Brand indicator on white | 4.32:1 | 3.0 |

The focus ring is now the brand violet itself at full strength — the identity colour and the accessibility affordance are the same colour, which is only possible because `#6c63ff` clears the non-text threshold with room to spare.

### Chart Series

| Series | Value | Contrast on white | Separation from previous |
|---|---:|---:|---:|
| Chart 1 | `#4338CA` | 7.90:1 | - |
| Chart 2 | `#EC4899` | 3.53:1 | 2.24 |
| Chart 3 | `#155E75` | 7.27:1 | 2.06 |
| Chart 4 | `#A855F7` | 3.96:1 | 1.84 |
| Chart 5 | `#0369A1` | 5.93:1 | 1.50 |
| Chart 6 | `#6C63FF` | 4.32:1 | 1.38 |

The series alternate dark and light rather than stepping through one ramp, which is what keeps them separable in greyscale and under colour-vision deficiency; hue alone would not. A visible legend and complete data table remain available, so colour is never the only route to a chart value.

## 5. Scope and Limits

- This project currently supports only the approved light theme. There is no active or staged dark-theme token override, even though the source brand is dark.
- The token audit verifies declared colour pairings. The responsive browser audit separately checks rendered opaque backgrounds and interactive targets, and re-ran clean after this change.
### The defect this re-skin introduced

The responsive audit failed 30+ route/width combinations on the first run after the theme change, and the finding is worth recording because it is invisible to inspection: **a gradient set through `background-image` leaves the computed `background-color` transparent.** Anything resolving a text colour against its background — the audit, forced-colors mode, print, or any engine that drops the image — walks past the gradient to the white card behind and finds white text on white.

The mark looked perfect in a browser the whole time. The fix was to declare an opaque `background-color` under every brand gradient, chosen so it holds the label at AA *unaided*: `#5b52e6` gives the mark's letter 5.53:1 with no gradient at all. No threshold was changed.

Note the shape of the failure — `/dashboard` failed at 768 px and above but passed at 375 px, because the sidebar mark is not rendered on mobile. A per-width difference with identical markup is the signature of a background-resolution problem rather than a layout one.

- Gradient surfaces are not modelled as text surfaces by the token audit. `--gradient-brand` is nonetheless specified so that both stops hold a white label at AA, and `--gradient-brand-wash` so that body ink holds well above 4.5:1 anywhere on the sweep.
- Translucent overlay scrims are not modelled as text surfaces; their foreground panels remain opaque white.
