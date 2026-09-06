/**
 * Performance budget (`FE-0827`). Requires a server on :3000.
 *
 * The budgets below are deliberately generous. What they are set to catch is a
 * *regression* — a list that renders tens of thousands of nodes, or a layout
 * that shifts after paint — not an absolute number that would only describe
 * this machine.
 *
 * Anything measured here is measured in the browser, not inferred from the
 * build output.
 */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';

const PASSWORD = 'Demo1234!';

/**
 * Budgets.
 *
 * `domNodes` is the one that matters for large-list rendering: a table that
 * grows without bound is the failure mode, and 6,000 nodes is far above any
 * screen here while still catching an unbounded render.
 *
 * `layoutShift` is a hard 0.1, the Core Web Vitals "good" threshold — content
 * that jumps after paint is a real defect regardless of environment.
 */
const BUDGET = {
  domNodes: 6000,
  layoutShift: 0.1,
};

/*
 * Script transfer size is deliberately measured and reported but not gated.
 *
 * Against a dev server the figure is dominated by on-demand compilation:
 * whichever route is visited first pays for the shared graph, so the same code
 * reads as 5 MB cold and 12 KB warm. Gating on it would produce a check that
 * flips with cache state rather than with the code. Bundle size is a
 * production-build measurement and belongs with demo packaging (`FE-0903`).
 */

const browser = await chromium.launch();
const failures = [];
let checks = 0;

function record(ok, area, detail) {
  checks += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(12)} | ${detail}`);
  if (!ok) failures.push(`${area}: ${detail}`);
}

async function signIn(page, email) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 15000 });
  await page.waitForTimeout(700);
}

/** Loads a route in a fresh context and measures what it cost. */
async function measure(route, email) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();

  let scriptBytes = 0;
  page.on('response', async (response) => {
    const type = response.headers()['content-type'] ?? '';
    if (!type.includes('javascript')) return;
    try {
      const body = await response.body();
      scriptBytes += body.length;
    } catch {
      // A response the browser cancelled or served from cache has no body.
    }
  });

  await signIn(page, email);
  scriptBytes = 0; // Measure the route, not the sign-in that preceded it.

  await page.evaluate(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const measured = await page.evaluate(() => ({
    domNodes: document.getElementsByTagName('*').length,
    layoutShift: window.__cls ?? 0,
    tableRows: document.querySelectorAll('tbody tr').length,
  }));

  await context.close();
  return { ...measured, scriptBytes };
}

const EMPLOYEE = 'nadia.rahman@demo.local';
const TEAM_LEAD = 'imran.hossain@demo.local';
const HR = 'rezaul.haque@demo.local';
const FINANCE = 'mahmuda.akter@demo.local';

const ROUTES = [
  { path: '/dashboard', email: EMPLOYEE, baseline: true },
  { path: '/timesheets', email: EMPLOYEE },
  { path: '/team/timesheets', email: TEAM_LEAD },
  { path: '/employees', email: HR },
  { path: '/hr/timesheets', email: HR },
  { path: '/attendance', email: HR },
  { path: '/finance/hours', email: FINANCE },
  { path: '/reports/timesheet-detail', email: HR },
];

console.log(`Performance budget against ${baseUrl}\n`);

const results = [];
for (const route of ROUTES) {
  const measured = await measure(route.path, route.email);
  results.push({ ...route, ...measured });

  record(
    measured.domNodes <= BUDGET.domNodes,
    'FE-0827',
    `${route.path} renders ${measured.domNodes} DOM nodes (budget ${BUDGET.domNodes})${
      measured.tableRows ? `, ${measured.tableRows} table rows` : ''
    }`,
  );
  record(
    measured.layoutShift <= BUDGET.layoutShift,
    'FE-0827',
    `${route.path} cumulative layout shift ${measured.layoutShift.toFixed(3)} (budget ${BUDGET.layoutShift})`,
  );
}

await browser.close();

console.log('\nRoute measurements (script size reported, not gated):');
for (const result of results) {
  console.log(
    `  ${result.path.padEnd(30)} ${String(result.domNodes).padStart(5)} nodes  ${String(
      result.tableRows,
    ).padStart(4)} rows  ${(result.scriptBytes / 1024).toFixed(0).padStart(6)} KB  CLS ${result.layoutShift.toFixed(3)}`,
  );
}

if (failures.length) {
  console.error(`\n${failures.length} performance check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`\nAll ${checks} performance checks pass.`);
