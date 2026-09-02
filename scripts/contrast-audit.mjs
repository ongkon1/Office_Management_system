/**
 * FE-0108 - Contrast audit.
 *
 * Reads the colour tokens straight out of `src/app/globals.css` and checks
 * every semantic pairing against WCAG 2.2 AA. Because it parses the stylesheet
 * rather than a copy of the palette, a token edited without re-checking its
 * pairings fails here instead of shipping.
 *
 * Run with `npm run audit:contrast`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cssPath = fileURLToPath(new URL('../src/app/globals.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

/** Extracts `--color-*: #rrggbb;` declarations from the `@theme` block. */
function readTokens(source) {
  const tokens = {};
  const pattern = /--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    // The first definition wins, so the light theme is audited, not the
    // staged dark overrides further down the file.
    if (!(match[1] in tokens)) tokens[match[1]] = match[2].toLowerCase();
  }
  return tokens;
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 4.5 for body text, 3.0 for UI components and graphical objects. */
const PAIRS = [
  ['Body text on canvas', 'ink', 'canvas', 4.5],
  ['Body text on surface', 'ink', 'surface', 4.5],
  ['Body text on sunken surface', 'ink', 'surface-sunken', 4.5],
  ['Muted text on canvas', 'ink-muted', 'canvas', 4.5],
  ['Muted text on surface', 'ink-muted', 'surface', 4.5],
  ['Muted text on sunken surface', 'ink-muted', 'surface-sunken', 4.5],
  ['Subtle text on canvas', 'ink-subtle', 'canvas', 4.5],
  ['Subtle text on surface', 'ink-subtle', 'surface', 4.5],
  ['Inverse text on primary button', 'ink-inverse', 'primary', 4.5],
  ['Inverse text on primary hover', 'ink-inverse', 'primary-hover', 4.5],
  ['Inverse text on inverse surface', 'ink-inverse', 'surface-inverse', 4.5],
  ['Accent text on surface', 'accent', 'surface', 4.5],
  ['Accent text on canvas', 'accent', 'canvas', 4.5],
  ['Accent text on accent subtle', 'accent', 'accent-subtle', 4.5],
  ['Accent button label', 'ink-on-accent', 'accent', 4.5],
  ['Accent button label on hover', 'ink-on-accent', 'accent-hover', 4.5],
  ['Missing status on its surface', 'missing', 'missing-surface', 4.5],
  ['Under-time status on its surface', 'undertime', 'undertime-surface', 4.5],
  ['Complete status on its surface', 'complete', 'complete-surface', 4.5],
  ['Overtime status on its surface', 'overtime', 'overtime-surface', 4.5],
  ['Critical status on its surface', 'critical', 'critical-surface', 4.5],
  ['Missing status on surface', 'missing', 'surface', 4.5],
  ['Under-time status on surface', 'undertime', 'surface', 4.5],
  ['Complete status on surface', 'complete', 'surface', 4.5],
  ['Overtime status on surface', 'overtime', 'surface', 4.5],
  ['Critical status on surface', 'critical', 'surface', 4.5],
  ['Success text on its surface', 'success', 'success-surface', 4.5],
  ['Warning text on its surface', 'warning', 'warning-surface', 4.5],
  ['Danger text on its surface', 'danger', 'danger-surface', 4.5],
  ['Info text on its surface', 'info', 'info-surface', 4.5],
  ['Control border on surface', 'border-strong', 'surface', 3.0],
  ['Control border on canvas', 'border-strong', 'canvas', 3.0],
  ['Control border on sunken surface', 'border-strong', 'surface-sunken', 3.0],
  ['Focus ring on canvas', 'focus', 'canvas', 3.0],
  ['Focus ring on surface', 'focus', 'surface', 3.0],
  ['Focus ring on sunken surface', 'focus', 'surface-sunken', 3.0],
  ['Chart series 1 on surface', 'chart-1', 'surface', 3.0],
  ['Chart series 2 on surface', 'chart-2', 'surface', 3.0],
  ['Chart series 3 on surface', 'chart-3', 'surface', 3.0],
  ['Chart series 4 on surface', 'chart-4', 'surface', 3.0],
  ['Chart series 5 on surface', 'chart-5', 'surface', 3.0],
  ['Chart series 6 on surface', 'chart-6', 'surface', 3.0],
];

/**
 * Adjacent chart series must also separate in lightness, so a chart survives
 * greyscale printing and colour-vision deficiency.
 */
const MIN_SERIES_SEPARATION = 1.2;
const SERIES = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'];

const tokens = readTokens(css);
const failures = [];

console.log('Contrast audit (WCAG 2.2 AA)\n');

for (const [name, foreground, background, minimum] of PAIRS) {
  const fg = tokens[foreground];
  const bg = tokens[background];

  if (!fg || !bg) {
    failures.push(`${name}: missing token (${!fg ? foreground : background})`);
    console.log(`MISSING | ${name}`);
    continue;
  }

  const ratio = contrast(fg, bg);
  const pass = ratio >= minimum;
  if (!pass) failures.push(`${name}: ${ratio.toFixed(2)}:1, needs ${minimum}:1`);

  console.log(
    `${pass ? 'PASS' : 'FAIL'} | ${ratio.toFixed(2).padStart(5)}:1 (min ${minimum.toFixed(1)}) | ${name} | ${fg} on ${bg}`,
  );
}

console.log('\nChart series lightness separation\n');

for (let index = 1; index < SERIES.length; index += 1) {
  const previous = tokens[SERIES[index - 1]];
  const current = tokens[SERIES[index]];
  const separation = contrast(previous, current);
  const pass = separation >= MIN_SERIES_SEPARATION;
  if (!pass) {
    failures.push(
      `${SERIES[index - 1]} vs ${SERIES[index]}: ${separation.toFixed(2)}, needs ${MIN_SERIES_SEPARATION}`,
    );
  }
  console.log(
    `${pass ? 'PASS' : 'FAIL'} | ${separation.toFixed(2).padStart(5)} (min ${MIN_SERIES_SEPARATION}) | ${SERIES[index - 1]} vs ${SERIES[index]}`,
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrast failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\nAll ${PAIRS.length + SERIES.length - 1} checks pass.`);
