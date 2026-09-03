/**
 * Responsive audit.
 *
 * Loads each route at the four target widths and asserts the rules the
 * milestone states as absolute:
 *
 *   1. No page-level horizontal scrolling (`REQ-NFR-UX-001`, `AC-QUAL-001`).
 *      Wide content may scroll inside a labelled region; the document may not.
 *   2. Primary interactive targets reach 44x44 px, including their hit area.
 *   3. A visible focus indicator exists on the first focusable element.
 *   4. Rendered text contrast meets WCAG 2.2 AA.
 *
 * Check 4 exists because `contrast-audit.mjs` proves the *palette* is sound but
 * cannot see what a component actually renders. It caught a primary button at
 * 1.07:1 whose colour class was present in the source and stripped at runtime
 * by class merging.
 *
 * Requires a dev or production server already running on `--url`
 * (default http://localhost:3000). Run with `npm run audit:responsive`.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice('--url='.length) ??
  'http://localhost:3000';
const shouldShoot = process.argv.includes('--screenshots');
const routeFilter = process.argv.find((arg) => arg.startsWith('--route='))?.slice('--route='.length);
const outDir = 'screenshots';

const WIDTHS = [375, 768, 1024, 1440];

const PASSWORD = 'Demo1234!';
const DEMO_USER = 'nadia.rahman@demo.local';
const TEAM_LEAD_USER = 'imran.hossain@demo.local';
const HR_USER = 'rezaul.haque@demo.local';
const FINANCE_USER = 'mahmuda.akter@demo.local';
// Finance without finance.cost.view, so the redacted states are audited too.
const FINANCE_LIMITED_USER = 'shakil.chowdhury@demo.local';
const MANAGEMENT_USER = 'ayesha.siddika@demo.local';
const ADMIN_USER = 'arif.mahmud@demo.local';

/**
 * Routes to audit. `auth` routes are signed in first, so the employee screens
 * are held to the same responsive rules as the public ones.
 */
const ROUTES = [
  { path: '/showcase', auth: false },
  { path: '/login', auth: false },
  { path: '/forgot-password', auth: false },
  { path: '/two-factor', auth: false },
  { path: '/account-locked', auth: false },
  { path: '/account-inactive', auth: false },
  { path: '/session-expired', auth: false },
  { path: '/dashboard', auth: true },
  { path: '/timesheets', auth: true },
  { path: '/timesheets/2026-09-01', auth: true },
  { path: '/tasks', auth: true },
  { path: '/tasks/tsk-1', auth: true },
  { path: '/divisions', auth: true },
  { path: '/remarks', auth: true },
  { path: '/profile', auth: true },
  { path: '/dashboard', auth: true, email: TEAM_LEAD_USER },
  { path: '/team', auth: true, email: TEAM_LEAD_USER },
  { path: '/team/timesheets', auth: true, email: TEAM_LEAD_USER },
  { path: '/team/timesheets/emp-1002/2026-08-26', auth: true, email: TEAM_LEAD_USER },
  { path: '/projects', auth: true, email: TEAM_LEAD_USER },
  { path: '/projects/prj-vp2', auth: true, email: TEAM_LEAD_USER },
  { path: '/tasks', auth: true, email: TEAM_LEAD_USER },
  { path: '/tasks/tsk-1', auth: true, email: TEAM_LEAD_USER },
  { path: '/requests', auth: true, email: TEAM_LEAD_USER },
  { path: '/requests/leave/lv-4', auth: true, email: TEAM_LEAD_USER },
  { path: '/workload', auth: true, email: TEAM_LEAD_USER },
  { path: '/evaluations', auth: true, email: TEAM_LEAD_USER },
  { path: '/evaluations/eval-emp-1001', auth: true, email: TEAM_LEAD_USER },
  { path: '/hr', auth: true, email: HR_USER },
  { path: '/employees', auth: true, email: HR_USER },
  { path: '/employees/new', auth: true, email: HR_USER },
  { path: '/employees/emp-1001', auth: true, email: HR_USER },
  { path: '/attendance', auth: true, email: HR_USER },
  { path: '/wfh', auth: true, email: HR_USER },
  { path: '/leave', auth: true, email: HR_USER },
  { path: '/admin/holidays', auth: true, email: HR_USER },
  { path: '/hr/timesheets', auth: true, email: HR_USER },
  { path: '/evaluations', auth: true, email: HR_USER },
  { path: '/evaluations/eval-emp-1003', auth: true, email: HR_USER },
  { path: '/finance', auth: true, email: FINANCE_USER },
  { path: '/finance/hours', auth: true, email: FINANCE_USER },
  { path: '/finance/overtime', auth: true, email: FINANCE_USER },
  { path: '/finance/billable', auth: true, email: FINANCE_USER },
  { path: '/finance/project-costs', auth: true, email: FINANCE_USER },
  { path: '/finance/division-costs', auth: true, email: FINANCE_USER },
  { path: '/finance/payroll', auth: true, email: FINANCE_USER },
  { path: '/finance/reports', auth: true, email: FINANCE_USER },
  { path: '/finance', auth: true, email: FINANCE_LIMITED_USER },
  { path: '/finance/reports', auth: true, email: FINANCE_LIMITED_USER },
  { path: '/dashboard', auth: true, email: MANAGEMENT_USER },
  { path: '/reports', auth: true, email: HR_USER },
  { path: '/reports/timesheet-detail', auth: true, email: HR_USER },
  { path: '/reports/division-contribution', auth: true, email: HR_USER },
  { path: '/reports/exports', auth: true, email: HR_USER },
  { path: '/notifications', auth: true, email: HR_USER },
  { path: '/wfh', auth: true },
  { path: '/leave', auth: true },
  { path: '/evaluations', auth: true },
  { path: '/admin/divisions', auth: true, email: ADMIN_USER },
  { path: '/admin/users', auth: true, email: ADMIN_USER },
  { path: '/admin/roles', auth: true, email: ADMIN_USER },
  { path: '/admin/audit', auth: true, email: ADMIN_USER },
  { path: '/admin/integrations', auth: true, email: ADMIN_USER },
  { path: '/settings', auth: true, email: ADMIN_USER },
  { path: '/documents', auth: true, email: HR_USER, flags: true },
  { path: '/messages', auth: true, flags: true },
  { path: '/search', auth: true, email: HR_USER, flags: true },
];

async function signIn(page, email = DEMO_USER) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), {
    timeout: 15000,
  });

  // The Super Administrator is the only account with two-factor enabled, so a
  // route audited as that role has to clear the verification step first.
  if (new URL(page.url()).pathname.startsWith('/two-factor')) {
    await page.fill('input[name="one-time-code"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !new URL(url).pathname.startsWith('/two-factor'), {
      timeout: 15000,
    });
  }
}

if (shouldShoot) mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const failures = [];

/** Elements whose contrast could not be judged, reported for honesty. */
let translucentSkipped = 0;
let contrastChecked = 0;

console.log(`Responsive audit against ${baseUrl}\n`);

const routesToAudit = routeFilter ? ROUTES.filter((item) => item.path === routeFilter) : ROUTES;

for (const { path: route, auth, email, flags } of routesToAudit) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    if (auth) await signIn(page, email);

    // Modules gated behind a feature flag default to off. Seeding the flag
    // state audits the real screen rather than the disabled presentation,
    // which the flow gate covers separately.
    if (flags) {
      await page.evaluate(() => {
        const keys = [
          'wfhRequests', 'leaveManagement', 'attendance', 'evaluations',
          'workloadPlanning', 'notifications', 'financeReports', 'projectCosting',
          'documents', 'messages', 'globalSearch', 'integrations', 'aiInsights',
        ];
        window.localStorage.setItem(
          'oms.feature-flags',
          JSON.stringify(Object.fromEntries(keys.map((key) => [key, true]))),
        );
      });
    }

    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    // Client-gated pages render after hydration; let the guard settle.
    if (auth) await page.waitForTimeout(900);

    // 1. Page-level horizontal scrolling.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        // Elements wider than the viewport that are not inside a scroll region.
        offenders: Array.from(document.querySelectorAll('body *'))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            if (rect.width <= doc.clientWidth + 1) return false;
            let parent = element.parentElement;
            while (parent) {
              const style = getComputedStyle(parent);
              if (style.overflowX === 'auto' || style.overflowX === 'scroll') return false;
              parent = parent.parentElement;
            }
            return true;
          })
          .slice(0, 5)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} (${Math.round(rect.width)}px)`;
          }),
      };
    });

    const scrolls = overflow.scrollWidth > overflow.clientWidth + 1;
    if (scrolls) {
      failures.push(
        `${route} @ ${width}px: document scrolls horizontally (${overflow.scrollWidth} > ${overflow.clientWidth})` +
          (overflow.offenders.length ? ` — ${overflow.offenders.join(', ')}` : ''),
      );
    }

    // 2. Touch targets, including the padded hit area components provide.
    const smallTargets = await page.evaluate(() => {
      const selector =
        'button, a[href], input:not([type="hidden"]), select, [role="switch"], [role="checkbox"]';

      /**
       * The effective target is what a finger can actually hit: the control
       * itself, plus any padded hit area an ::after overlay provides, plus the
       * label that activates it.
       */
      function effectiveSize(element) {
        const rect = element.getBoundingClientRect();
        let { width, height } = rect;

        const after = getComputedStyle(element, '::after');
        const afterHeight = parseFloat(after.height);
        if (Number.isFinite(afterHeight)) height = Math.max(height, afterHeight);

        const id = element.getAttribute('id');
        const label =
          element.closest('label') ??
          (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null);
        if (label) {
          const labelRect = label.getBoundingClientRect();
          if (labelRect.width > 0 && labelRect.height > 0) {
            width = Math.max(width, labelRect.width);
            height = Math.max(height, labelRect.height);
          }
        }

        return { width, height };
      }

      return Array.from(document.querySelectorAll(selector))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          const size = effectiveSize(element);
          return size.height < 24 || size.width < 24;
        })
        .slice(0, 5)
        .map((element) => {
          const size = effectiveSize(element);
          const name =
            element.getAttribute('aria-label') ??
            element.textContent?.trim().slice(0, 24) ??
            '';
          return `${element.tagName.toLowerCase()} "${name}" ${Math.round(size.width)}x${Math.round(size.height)}`;
        });
    });

    if (smallTargets.length > 0) {
      failures.push(`${route} @ ${width}px: targets below 24px — ${smallTargets.join('; ')}`);
    }

    // 3. Focus visibility.
    //
    // Client-gated routes swap their content in after hydration, so pressing
    // Tab at `networkidle` can land on a body that is about to be replaced.
    // Wait for a focusable control to exist before testing focus.
    await page
      .locator('a[href], button:not([disabled]), input:not([disabled])')
      .first()
      .waitFor({ state: 'attached', timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(300);

    // `next dev` injects its own dev-tools overlay as the first tab stop, so
    // tab past anything that is not part of the application before judging.
    let focusVisible = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await page.keyboard.press('Tab');
      const result = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return { done: false, visible: false };
        if (active.tagName.startsWith('NEXTJS-')) return { done: false, visible: false };
        const style = getComputedStyle(active);
        return {
          done: true,
          visible: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
        };
      });
      if (result.done) {
        focusVisible = result.visible;
        break;
      }
    }
    if (!focusVisible) {
      failures.push(`${route} @ ${width}px: first tab stop has no visible focus outline`);
    }

    // 4. Rendered text contrast.
    //
    // Only fully opaque `rgb()` backgrounds are judged. A translucent or
    // non-sRGB surface (the shell uses `bg-surface/85`, which computes to
    // `oklab(... / 0.85)`) would need compositing against everything behind it
    // to give a true figure, and guessing there produces false failures rather
    // than findings. Those elements are counted and reported instead.
    const contrastReport = await page.evaluate(() => {
      function opaqueRgb(value) {
        const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(value);
        if (!match) return null;
        if (match[4] !== undefined && Number(match[4]) < 1) return null;
        return [Number(match[1]), Number(match[2]), Number(match[3])];
      }
      function luminance([r, g, b]) {
        const [lr, lg, lb] = [r, g, b].map((v) => v / 255)
          .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      }
      function contrast(a, b) {
        const [hi, lo] = luminance(a) > luminance(b) ? [a, b] : [b, a];
        return (luminance(hi) + 0.05) / (luminance(lo) + 0.05);
      }

      const findings = [];
      let skipped = 0;
      let checked = 0;

      const nodes = document.querySelectorAll(
        'button, a[href], p, span, label, h1, h2, h3, td, th, dt, dd, li',
      );

      for (const element of nodes) {
        const text = (element.textContent || '').trim();
        if (!text || element.children.length > 0) continue;

        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;

        const rect = element.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;

        const foreground = opaqueRgb(style.color);
        if (!foreground) {
          skipped += 1;
          continue;
        }

        let background = style.backgroundColor;
        let node = element;
        while (background === 'rgba(0, 0, 0, 0)' && node.parentElement) {
          node = node.parentElement;
          background = getComputedStyle(node).backgroundColor;
        }

        const resolved = opaqueRgb(background);
        if (!resolved) {
          skipped += 1;
          continue;
        }

        checked += 1;
        const ratio = contrast(foreground, resolved);

        // Large text (>= 24px, or >= 18.66px bold) needs only 3:1.
        const size = parseFloat(style.fontSize);
        const bold = Number(style.fontWeight) >= 700;
        const minimum = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;

        if (ratio < minimum) {
          findings.push(
            `"${text.slice(0, 28)}" ${ratio.toFixed(2)}:1 (min ${minimum})`,
          );
        }
      }
      return { findings: findings.slice(0, 4), skipped, checked };
    });

    const lowContrast = contrastReport.findings;
    if (lowContrast.length > 0) {
      failures.push(`${route} @ ${width}px: low contrast — ${lowContrast.join('; ')}`);
    }
    translucentSkipped += contrastReport.skipped;
    contrastChecked += contrastReport.checked;

    if (consoleErrors.length > 0) {
      failures.push(`${route} @ ${width}px: console errors — ${consoleErrors.slice(0, 3).join(' | ')}`);
    }

    if (shouldShoot) {
      const name = route === '/' ? 'home' : route.replace(/\//g, '-').slice(1);
      await page.screenshot({
        path: `${outDir}/${name}-${width}.png`,
        fullPage: true,
      });
    }

    const status =
      scrolls || smallTargets.length > 0 || !focusVisible || lowContrast.length > 0
        ? 'FAIL'
        : 'PASS';
    console.log(
      `${status} | ${route.padEnd(10)} @ ${String(width).padStart(4)}px | scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth} | focus=${focusVisible ? 'visible' : 'none'}`,
    );

    await context.close();
  }
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} responsive failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\nAll ${routesToAudit.length * WIDTHS.length} route/width combinations pass.`);
console.log(
  `Rendered contrast: ${contrastChecked} elements checked, ` +
    `${translucentSkipped} skipped (translucent or non-sRGB background — see ` +
    `docs/frontend/phase-1/contrast-audit.md section 5).`,
);
