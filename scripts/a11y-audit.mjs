/**
 * Accessibility gate (`FE-0810` – `FE-0814`). Requires a server on :3000.
 *
 * This checks the things a token audit and a responsive audit cannot see:
 * whether a keyboard can actually complete a flow, whether focus goes where it
 * should and comes back, whether the page has a usable structure, and whether
 * anything depends on colour alone.
 *
 * Every assertion here is a *behavioural* one, run against the real rendered
 * page. Nothing is inferred from source.
 */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';
const routeFilter = process.argv.find((arg) => arg.startsWith('--route='))?.slice(8);

const PASSWORD = 'Demo1234!';
const EMPLOYEE = 'nadia.rahman@demo.local';
const TEAM_LEAD = 'imran.hossain@demo.local';
const HR = 'rezaul.haque@demo.local';

const browser = await chromium.launch();
const failures = [];
let checks = 0;

function record(ok, area, detail) {
  checks += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(12)} | ${detail}`);
  if (!ok) failures.push(`${area}: ${detail}`);
}

async function openAs(email, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 15000 });
  await page.waitForTimeout(700);
  return { context, page };
}

async function goto(page, path, wait = 900) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
}

/** Describes whatever currently holds focus, for readable failure output. */
async function focusDescription(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'body';
    const label =
      el.getAttribute('aria-label') ??
      el.textContent?.trim().slice(0, 40) ??
      el.getAttribute('name') ??
      '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${label}"`;
  });
}

/**
 * Tabs forward, skipping Next.js dev-overlay elements.
 *
 * The dev overlay injects its own focusable root as the first tab stop, which
 * is not part of the application and must not be counted against it.
 */
async function tabPastDevTools(page, times = 1) {
  for (let index = 0; index < times; index += 1) {
    await page.keyboard.press('Tab');
    let guard = 0;
    while (guard < 5) {
      const inOverlay = await page.evaluate(() =>
        (document.activeElement?.tagName ?? '').startsWith('NEXTJS-'),
      );
      if (!inOverlay) break;
      await page.keyboard.press('Tab');
      guard += 1;
    }
  }
}

console.log(`Accessibility audit against ${baseUrl}\n`);

/* ========================================================================== */
/* FE-0810 — keyboard-only journeys                                           */
/* ========================================================================== */

if (!routeFilter) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  /* Sign in without touching the mouse. */
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByLabel('Email or employee ID').focus();
  await page.keyboard.type(EMPLOYEE);
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  const signedIn = await page.keyboard
    .press('Enter')
    .then(() =>
      page
        .waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 12000 })
        .then(() => true)
        .catch(() => false),
    );
  record(signedIn, 'FE-0810', 'sign-in completes with the keyboard alone');
  await page.waitForTimeout(900);

  /* The skip link must be the first application tab stop and must work. */
  await page.evaluate(() => window.scrollTo(0, 0));
  await tabPastDevTools(page, 1);
  const firstStop = await focusDescription(page);
  record(
    /skip/i.test(firstStop),
    'FE-0811',
    `the skip link is the first tab stop (found ${firstStop})`,
  );
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const afterSkip = await page.evaluate(() => document.activeElement?.id ?? '');
  record(afterSkip === 'main-content', 'FE-0811', 'the skip link moves focus to main content');

  /* Reach a time entry and open the drawer from the keyboard. */
  await goto(page, '/timesheets/2026-09-01', 1200);
  const addEntry = page.getByRole('button', { name: /^Add time$/ }).first();
  await addEntry.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  const drawerOpen = (await page.getByRole('dialog').count()) > 0;
  record(drawerOpen, 'FE-0810', 'the time-entry drawer opens from the keyboard');

  if (drawerOpen) {
    /* Focus must be inside the drawer, and Tab must not escape it. */
    const insideAfterOpen = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.contains(document.activeElement) ?? false;
    });
    record(insideAfterOpen, 'FE-0811', 'focus moves into the overlay when it opens');

    let escaped = false;
    for (let index = 0; index < 40; index += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return true;
        const active = document.activeElement;
        return (
          dialog.contains(active) || (active?.tagName ?? '').startsWith('NEXTJS-')
        );
      });
      if (!inside) {
        escaped = true;
        break;
      }
    }
    record(!escaped, 'FE-0811', 'Tab is trapped inside the overlay');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    record(
      (await page.getByRole('dialog').count()) === 0,
      'FE-0810',
      'Escape closes the overlay',
    );
    const restored = await page.evaluate(() => {
      const active = document.activeElement;
      return (active?.textContent ?? '').trim().startsWith('Add time');
    });
    record(restored, 'FE-0811', 'focus returns to the control that opened the overlay');
  }

  await context.close();
}

/* ========================================================================== */
/* Per-route structural and semantic checks                                   */
/* ========================================================================== */

const ROUTES = [
  { path: '/dashboard', email: EMPLOYEE, title: 'Dashboard' },
  { path: '/timesheets', email: EMPLOYEE, title: 'My Timesheet' },
  { path: '/timesheets/2026-09-01', email: EMPLOYEE, title: null },
  { path: '/tasks', email: EMPLOYEE, title: 'My Tasks' },
  { path: '/remarks', email: EMPLOYEE, title: 'Remarks' },
  { path: '/requisitions', email: EMPLOYEE, title: 'Requisition' },
  { path: '/requisitions/new', email: EMPLOYEE, title: null },
  { path: '/requisitions/req-1', email: TEAM_LEAD, title: null },
  { path: '/conveyance', email: EMPLOYEE, title: 'Conveyance' },
  { path: '/conveyance/new', email: EMPLOYEE, title: null },
  { path: '/conveyance/cnv-1', email: TEAM_LEAD, title: null },
  { path: '/wfh', email: EMPLOYEE, title: null },
  { path: '/leave', email: EMPLOYEE, title: null },
  { path: '/evaluations', email: EMPLOYEE, title: null },
  { path: '/team', email: TEAM_LEAD, title: null },
  { path: '/team/timesheets', email: TEAM_LEAD, title: null },
  { path: '/projects', email: TEAM_LEAD, title: null },
  { path: '/workload', email: TEAM_LEAD, title: null },
  { path: '/requests', email: TEAM_LEAD, title: null },
  { path: '/reports', email: HR, title: null },
  { path: '/reports/timesheet-detail', email: HR, title: null },
  { path: '/notifications', email: HR, title: null },
  { path: '/hr', email: HR, title: null },
  { path: '/employees', email: HR, title: null },
  { path: '/attendance', email: HR, title: null },
  { path: '/hr/timesheets', email: HR, title: null },
];

const routesToAudit = routeFilter
  ? ROUTES.filter((route) => route.path === routeFilter)
  : ROUTES;

/** One signed-in page per role, reused across that role's routes. */
const sessions = new Map();
for (const email of new Set(routesToAudit.map((route) => route.email))) {
  sessions.set(email, await openAs(email));
}

for (const route of routesToAudit) {
  const { page } = sessions.get(route.email);
  await goto(page, route.path, 1100);

  /* -- FE-0811 structure ---------------------------------------------------- */

  const structure = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => ({
      level: Number(el.tagName.slice(1)),
      text: (el.textContent ?? '').trim().slice(0, 40),
    }));

    // A heading level must not be skipped on the way down; jumping from h1 to
    // h3 leaves a screen-reader user unable to tell what a section belongs to.
    let skipped = null;
    for (let index = 1; index < headings.length; index += 1) {
      const delta = headings[index].level - headings[index - 1].level;
      if (delta > 1) {
        skipped = `h${headings[index - 1].level} → h${headings[index].level} at "${headings[index].text}"`;
        break;
      }
    }

    return {
      h1Count: headings.filter((heading) => heading.level === 1).length,
      skipped,
      hasMain: document.querySelectorAll('main').length === 1,
      hasNav: document.querySelectorAll('nav[aria-label]').length > 0,
      navsUnlabelled: [...document.querySelectorAll('nav')].filter(
        (nav) => !nav.getAttribute('aria-label') && !nav.getAttribute('aria-labelledby'),
      ).length,
      title: document.title,
    };
  });

  record(
    structure.h1Count === 1,
    'FE-0811',
    `${route.path} has exactly one h1 (found ${structure.h1Count})`,
  );
  record(
    structure.skipped === null,
    'FE-0811',
    `${route.path} does not skip a heading level${structure.skipped ? ` — ${structure.skipped}` : ''}`,
  );
  record(
    structure.hasMain && structure.hasNav && structure.navsUnlabelled === 0,
    'FE-0811',
    `${route.path} has one main and only labelled navigation landmarks`,
  );
  record(
    structure.title.length > 0 && structure.title !== 'Create Next App',
    'FE-0811',
    `${route.path} has a page title ("${structure.title.slice(0, 40)}")`,
  );

  /* -- FE-0812 names, labels and semantics ---------------------------------- */

  const semantics = await page.evaluate(() => {
    const accessibleName = (el) => {
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim();
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const parts = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '');
        if (parts.join('').trim()) return parts.join(' ').trim();
      }
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        if (el.id) {
          const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (label?.textContent?.trim()) return label.textContent.trim();
        }
        const wrapping = el.closest('label');
        if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
        if (el.getAttribute('title')?.trim()) return el.getAttribute('title').trim();
      }
      return (el.textContent ?? '').trim();
    };

    const isVisible = (el) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const unnamedControls = [...document.querySelectorAll('button, a[href], [role="button"]')]
      .filter(isVisible)
      .filter((el) => accessibleName(el).length === 0)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)}`);

    const unlabelledFields = [...document.querySelectorAll('input, select, textarea')]
      .filter(isVisible)
      .filter((el) => el.type !== 'hidden')
      .filter((el) => accessibleName(el).length === 0)
      .map((el) => `${el.tagName.toLowerCase()}[name=${el.getAttribute('name') ?? '?'}]`);

    // An icon inside a control must be hidden from the accessible name, or it
    // duplicates or replaces the label it sits beside.
    const exposedIcons = [...document.querySelectorAll('svg')].filter(
      (svg) =>
        !svg.getAttribute('aria-hidden') &&
        !svg.getAttribute('aria-label') &&
        !svg.closest('[aria-hidden="true"]'),
    ).length;

    const tables = [...document.querySelectorAll('table')].filter(isVisible);
    const tablesWithoutCaption = tables.filter(
      (table) => !table.querySelector('caption')?.textContent?.trim(),
    ).length;
    const tablesWithoutHeaderScope = tables.filter(
      (table) =>
        table.querySelector('th') &&
        [...table.querySelectorAll('thead th')].some((th) => !th.getAttribute('scope')),
    ).length;

    return {
      unnamedControls: unnamedControls.slice(0, 3),
      unlabelledFields: unlabelledFields.slice(0, 3),
      exposedIcons,
      tableCount: tables.length,
      tablesWithoutCaption,
      tablesWithoutHeaderScope,
      liveRegions: document.querySelectorAll('[aria-live], [role="status"], [role="alert"]').length,
    };
  });

  record(
    semantics.unnamedControls.length === 0,
    'FE-0812',
    `${route.path} names every control${semantics.unnamedControls.length ? ` — ${semantics.unnamedControls.join('; ')}` : ''}`,
  );
  record(
    semantics.unlabelledFields.length === 0,
    'FE-0812',
    `${route.path} labels every field${semantics.unlabelledFields.length ? ` — ${semantics.unlabelledFields.join('; ')}` : ''}`,
  );
  record(
    semantics.exposedIcons === 0,
    'FE-0812',
    `${route.path} hides decorative icons from assistive technology (${semantics.exposedIcons} exposed)`,
  );
  if (semantics.tableCount > 0) {
    record(
      semantics.tablesWithoutCaption === 0 && semantics.tablesWithoutHeaderScope === 0,
      'FE-0812',
      `${route.path} tables carry a caption and scoped headers`,
    );
  }

  /* -- FE-0813 not colour alone --------------------------------------------- */

  const colourOnly = await page.evaluate(() => {
    // A status must carry text, not only a tone. Every status surface in this
    // product is rendered by StatusIndicator or Badge, both of which include a
    // visible or screen-reader label — this asserts that stays true.
    const statusNodes = [...document.querySelectorAll('[class*="text-missing"], [class*="text-critical"], [class*="text-overtime"], [class*="text-undertime"], [class*="text-complete"]')];
    const withoutText = statusNodes.filter(
      (node) => (node.textContent ?? '').trim().length === 0,
    ).length;

    // A link inside body copy must not be distinguishable by colour alone.
    // Only links that sit *among other text* qualify: one that is the entire
    // content of its parent has no surrounding text to differ from, and is
    // carried by position and shape instead.
    const proseLinks = [...document.querySelectorAll('p a[href], li a[href]')].filter(
      (link) => {
        const parent = link.parentElement;
        if (!parent) return false;
        const parentText = (parent.textContent ?? '').trim();
        const linkText = (link.textContent ?? '').trim();
        return parentText.length > linkText.length + 2;
      },
    );
    const undecorated = proseLinks.filter((link) => {
      const style = getComputedStyle(link);
      return (
        style.textDecorationLine === 'none' &&
        style.borderBottomWidth === '0px' &&
        style.fontWeight === getComputedStyle(link.parentElement).fontWeight
      );
    }).length;

    return { statusNodes: statusNodes.length, withoutText, proseLinks: proseLinks.length, undecorated };
  });

  record(
    colourOnly.withoutText === 0,
    'FE-0813',
    `${route.path} status surfaces carry text, not colour alone (${colourOnly.statusNodes} checked)`,
  );
  record(
    colourOnly.undecorated === 0,
    'FE-0813',
    `${route.path} in-text links are not distinguished by colour alone (${colourOnly.proseLinks} checked)`,
  );

  /* -- FE-0814 zoom, reduced motion, target size ---------------------------- */

  await page.setViewportSize({ width: 640, height: 512 });
  await page.waitForTimeout(400);
  const zoomed = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  record(
    zoomed.scrollWidth <= zoomed.clientWidth + 1,
    'FE-0814',
    `${route.path} reflows at 200% zoom without horizontal scrolling (${zoomed.scrollWidth} vs ${zoomed.clientWidth})`,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
}

/* -- FE-0814 reduced motion and text resizing (once, on a rich screen) ------ */

if (!routeFilter) {
  const { page } = sessions.get(EMPLOYEE);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await goto(page, '/dashboard', 1100);
  const motion = await page.evaluate(() => {
    const animated = [...document.querySelectorAll('*')].filter((el) => {
      const style = getComputedStyle(el);
      return (
        (style.animationName !== 'none' && style.animationDuration !== '0s') ||
        (style.transitionDuration !== '0s' && style.transitionProperty !== 'none')
      );
    });
    const longRunning = animated.filter((el) => {
      const style = getComputedStyle(el);
      const duration = parseFloat(style.animationDuration) || 0;
      const transition = parseFloat(style.transitionDuration) || 0;
      return Math.max(duration, transition) > 0.2;
    });
    return { animated: animated.length, longRunning: longRunning.length };
  });
  record(
    motion.longRunning === 0,
    'FE-0814',
    `reduced motion suppresses long animations (${motion.longRunning} over 200ms of ${motion.animated} animated)`,
  );
  await page.emulateMedia({ reducedMotion: null });

  // Text resized to 200% without zooming the layout (WCAG 1.4.4).
  await goto(page, '/dashboard', 900);
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  await page.waitForTimeout(600);
  const resized = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  record(
    resized.scrollWidth <= resized.clientWidth + 1,
    'FE-0814',
    `text resized to 200% does not force horizontal scrolling (${resized.scrollWidth} vs ${resized.clientWidth})`,
  );
  await page.reload({ waitUntil: 'networkidle' });

  /* -- FE-0812 validation announcement ------------------------------------- */

  await goto(page, '/timesheets/2026-09-01', 1200);
  await page.getByRole('button', { name: /^Add time$/ }).first().click();
  await page.waitForTimeout(800);
  const saveButton = page.getByRole('button', { name: /^Save entry$/ });
  if ((await saveButton.count()) > 0) {
    await saveButton.first().click();
    await page.waitForTimeout(700);
    const announced = await page.evaluate(() => {
      const live = [...document.querySelectorAll('[role="alert"], [aria-live]')];
      return live.some((node) => (node.textContent ?? '').trim().length > 0);
    });
    record(announced, 'FE-0812', 'a validation failure is announced through a live region');
  }
  await page.keyboard.press('Escape');
}

for (const { context } of sessions.values()) await context.close();
await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} accessibility check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`\nAll ${checks} accessibility checks pass.`);
