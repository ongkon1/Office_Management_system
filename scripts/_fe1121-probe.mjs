/**
 * FE-1121 browser probe — the five processing states, rendered, and the live
 * region that announces changes. Requires `npm run dev` on :3000.
 *
 * Status *transitions* cannot be driven from a browser yet — nothing in the
 * mock moves a minute between states until `FE-1126` schedules refreshes — so
 * the announcement itself is verified in `processing-status-announcer.test.tsx`
 * and through the real page in `meeting-minute-detail.test.tsx`. This probe
 * checks what a browser can: the states as rendered, and that the region is
 * present and silent on arrival.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000';
const PASSWORD = 'Demo1234!';
const ADMIN = 'arif.mahmud@demo.local';

const STATES = [
  ['min-1002', 'Not processed', 'AI processing: not requested', 'AI was not asked to read this minute'],
  ['min-1003', 'Pending', 'AI processing: waiting to start', 'Queued. Task generation will start shortly'],
  ['min-1005', 'Processing', 'AI processing: in progress', 'AI is reading the minute and proposing tasks'],
  ['min-1001', 'Processed', 'AI processing: finished', 'Finished. Any summary, decisions and generated tasks'],
  ['min-1004', 'Failed', 'AI processing: failed, the minute is saved', 'Task generation stopped before it finished'],
];

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(browser, width = 1440, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', ADMIN);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 20000 });
  if (new URL(page.url()).pathname.startsWith('/two-factor')) {
    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !new URL(u).pathname.startsWith('/two-factor'), { timeout: 20000 });
  }
  return { context, page, consoleErrors };
}

/** WCAG contrast of a badge's visible label against its own background. */
async function badgeFacts(page, label) {
  return page.evaluate((text) => {
    const parse = (value) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = ([r, g, b]) => {
      const channel = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const span = [...document.querySelectorAll('main span[aria-hidden="true"]')].find(
      (node) => node.textContent.trim() === text,
    );
    if (!span) return null;
    const badge = span.parentElement;
    let bgNode = badge;
    let bg = getComputedStyle(bgNode).backgroundColor;
    while (bgNode && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
      bgNode = bgNode.parentElement;
      bg = bgNode ? getComputedStyle(bgNode).backgroundColor : 'rgb(255, 255, 255)';
    }
    const fg = parse(getComputedStyle(span).color);
    const back = parse(bg);
    const [hi, lo] = [luminance(fg), luminance(back)].sort((a, b) => b - a);
    const icon = badge.querySelector('svg');
    return {
      ratio: (hi + 0.05) / (lo + 0.05),
      hasIcon: Boolean(icon),
      iconHidden: icon?.getAttribute('aria-hidden') === 'true',
      animation: icon ? getComputedStyle(icon).animationName : 'none',
    };
  }, label);
}

async function run() {
  const browser = await chromium.launch();

  /* ------------------------------------------------ each state on its page */
  {
    const { context, page, consoleErrors } = await signIn(browser);
    for (const [id, label, accessible, meaning] of STATES) {
      await page.goto(`${BASE}/meeting-minutes/${id}`, { waitUntil: 'networkidle' });
      await page.waitForSelector(`text=${meaning}`, { timeout: 20000 });

      const facts = await badgeFacts(page, label);
      check(`${label}: visible text`, facts !== null);
      check(`${label}: has a shape`, facts?.hasIcon === true);
      check(`${label}: shape hidden from AT, text carries it`, facts?.iconHidden === true);
      check(`${label}: text contrast ≥ 4.5:1`, (facts?.ratio ?? 0) >= 4.5, facts?.ratio.toFixed(2));
      check(`${label}: no spinning icon`, facts?.animation === 'none', facts?.animation);

      const body = await page.textContent('body');
      check(`${label}: accessible label present`, body.includes(accessible));
      check(`${label}: says what it means`, body.includes(meaning));

      const live = await page.$eval('[role="status"][aria-atomic="true"]', (node) => ({
        polite: node.getAttribute('aria-live') === 'polite',
        text: node.textContent.trim(),
      }));
      check(`${label}: live region present and polite`, live.polite);
      check(`${label}: silent on arrival`, live.text === '', live.text);
    }
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  /* ------------------------------------------------ navigating is not a change */
  {
    const { context, page } = await signIn(browser);
    await page.goto(`${BASE}/meeting-minutes/min-1001`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Vision Platform v2 sprint review")', { timeout: 20000 });
    // Client-side navigation to another minute keeps the component mounted.
    await page.getByRole('link', { name: 'Meeting Minutes', exact: true }).first().click();
    await page.waitForURL(/\/meeting-minutes$/, { timeout: 20000 });
    const view = page.getByRole('link', { name: /^View Westbridge portal go-live readiness$/ }).first();
    await view.waitFor({ state: 'visible', timeout: 20000 });
    await view.click();
    await page.waitForSelector('h1:has-text("Westbridge portal go-live readiness")', { timeout: 20000 });
    const text = await page.$eval('[role="status"][aria-atomic="true"]', (n) => n.textContent.trim());
    check('moving to another minute announces nothing', text === '', text);
    await context.close();
  }

  /* ------------------------------------------------ the list shows all five */
  {
    const { context, page } = await signIn(browser);
    await page.goto(`${BASE}/meeting-minutes`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Westbridge portal go-live readiness', { timeout: 20000 }).catch(() => {});
    for (const [, label] of STATES) {
      const facts = await badgeFacts(page, label);
      check(`list: ${label} rendered with a shape`, facts?.hasIcon === true);
    }
    await context.close();
  }

  /* ------------------------------------------------ reduced motion, phone */
  {
    const { context, page } = await signIn(browser, 375, 'reduce');
    await page.goto(`${BASE}/meeting-minutes/min-1005`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=AI is reading the minute', { timeout: 20000 });
    const facts = await badgeFacts(page, 'Processing');
    check('reduced motion: Processing icon does not move', facts?.animation === 'none', facts?.animation);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check('no horizontal scroll at 375 px', overflow <= 0, `overflow ${overflow}`);
    await context.close();
  }

  await browser.close();
  console.log(`\nFE-1121 probe: ${pass}/${pass + failures.length} checks passed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}

run();
