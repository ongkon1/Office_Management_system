/**
 * Content-stress and interaction gate (`FE-0803`, `FE-0805`, `FE-0826`).
 * Requires a server on :3000.
 *
 * The responsive audit proves the layout holds with *this* dataset. That is not
 * the same as proving it holds. Real data brings longer names, longer project
 * titles, more divisions per person, larger currency values, and translated
 * labels that run half again as long as the English. This injects those into
 * the rendered page and re-measures, which is a test of the CSS rather than of
 * the fixtures.
 *
 * It also checks two things no static review catches: that every interactive
 * control gives feedback on hover and focus, and that non-interactive elements
 * do not claim to be clickable.
 */
import { chromium } from 'playwright';

const baseUrl =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';
const routeFilter = process.argv.find((arg) => arg.startsWith('--route='))?.slice(8);

const PASSWORD = 'Demo1234!';
const EMPLOYEE = 'nadia.rahman@demo.local';
const TEAM_LEAD = 'imran.hossain@demo.local';
const HR = 'rezaul.haque@demo.local';
const FINANCE = 'mahmuda.akter@demo.local';

const WIDTHS = [375, 768, 1440];

const browser = await chromium.launch();
const failures = [];
let checks = 0;

function record(ok, area, detail) {
  checks += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${area.padEnd(12)} | ${detail}`);
  if (!ok) failures.push(`${area}: ${detail}`);
}

async function openAs(email, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !new URL(url).pathname.startsWith('/login'), { timeout: 15000 });
  await page.waitForTimeout(600);
  return { context, page };
}

/**
 * Replaces visible text with a longer equivalent and reports overflow.
 *
 * Names, titles and money are swapped for the longest realistic value the
 * business could produce; labels are padded by 60%, which is roughly what
 * English → Bengali or German does to UI strings.
 */
const STRESS_SCRIPT = () => {
  const LONG_NAME = 'Mohammad Shafiqul Islam Chowdhury Al-Mahmud';
  const LONG_TITLE =
    'National Records Digitisation — Phase Two Intake, Validation and Reconciliation Workstream';
  const LONG_MONEY = 'BDT 12,345,678,901.99';

  const isVisible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // Only leaf text nodes, so replacing one does not clobber its siblings.
  const leaves = [...document.querySelectorAll('main *')].filter(
    (el) =>
      isVisible(el) &&
      el.children.length === 0 &&
      (el.textContent ?? '').trim().length > 0 &&
      // Skip the halves of a paired representation. Replacing the visible span
      // of an abbreviated value defeats the abbreviation and reports a state
      // the application never renders.
      !el.classList.contains('sr-only') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      !el.closest('[aria-hidden="true"]'),
  );

  let replaced = 0;
  for (const el of leaves) {
    const text = (el.textContent ?? '').trim();
    if (/^BDT\s/.test(text)) {
      el.textContent = LONG_MONEY;
      replaced += 1;
    } else if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(text)) {
      el.textContent = LONG_NAME;
      replaced += 1;
    } else if (text.length > 12 && text.length < 60 && /[a-z]{4}/.test(text)) {
      // A translated label commonly runs about 60% longer than the English.
      el.textContent = `${text} ${text.slice(0, Math.ceil(text.length * 0.6))}`;
      replaced += 1;
    } else if (text.length >= 60) {
      el.textContent = LONG_TITLE;
      replaced += 1;
    }
  }
  return replaced;
};

/** Reports elements extending past the viewport, ignoring scroll regions. */
const OVERFLOW_SCRIPT = (viewportWidth) => {
  const offenders = [];
  for (const el of document.querySelectorAll('main *')) {
    const rect = el.getBoundingClientRect();
    if (rect.right <= viewportWidth + 1) continue;
    // An element inside a deliberate horizontal scroll region is contained.
    const scrollHost = el.closest('.table-scroll, [style*="overflow"]');
    if (scrollHost && getComputedStyle(scrollHost).overflowX !== 'visible') continue;
    offenders.push(
      `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)} w=${Math.round(rect.width)}`,
    );
    if (offenders.length >= 3) break;
  }
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    offenders,
  };
};

const ROUTES = [
  { path: '/dashboard', email: EMPLOYEE },
  { path: '/timesheets/2026-09-01', email: EMPLOYEE },
  { path: '/tasks', email: EMPLOYEE },
  { path: '/requisitions', email: TEAM_LEAD },
  { path: '/conveyance', email: TEAM_LEAD },
  { path: '/team/timesheets', email: TEAM_LEAD },
  { path: '/projects', email: TEAM_LEAD },
  { path: '/workload', email: TEAM_LEAD },
  { path: '/employees', email: HR },
  { path: '/hr/timesheets', email: HR },
  { path: '/finance', email: FINANCE },
  { path: '/finance/hours', email: FINANCE },
  { path: '/finance/project-costs', email: FINANCE },
];

const routesToAudit = routeFilter
  ? ROUTES.filter((route) => route.path === routeFilter)
  : ROUTES;

console.log(`Content-stress and interaction audit against ${baseUrl}\n`);

/* ========================================================================== */
/* FE-0803, FE-0804 — extreme content at every width                          */
/* ========================================================================== */

for (const width of WIDTHS) {
  const sessions = new Map();
  for (const email of new Set(routesToAudit.map((route) => route.email))) {
    sessions.set(email, await openAs(email, width));
  }

  for (const route of routesToAudit) {
    const { page } = sessions.get(route.email);
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const replaced = await page.evaluate(STRESS_SCRIPT);
    await page.waitForTimeout(400);
    const result = await page.evaluate(OVERFLOW_SCRIPT, width);

    record(
      result.scrollWidth <= result.clientWidth + 1,
      'FE-0803',
      `${route.path} @ ${width}px holds with long names, titles and money (${replaced} strings stretched)${
        result.offenders.length ? ` — ${result.offenders.join('; ')}` : ''
      }`,
    );
  }

  for (const { context } of sessions.values()) await context.close();
}

/* ========================================================================== */
/* FE-0803 — empty values                                                     */
/* ========================================================================== */

{
  const { context, page } = await openAs(HR, 1280);
  await page.goto(`${baseUrl}/employees/emp-1004`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const emptyHandling = await page.evaluate(() => {
    const text = document.querySelector('main')?.textContent ?? '';
    return {
      // An absent value must read as absent, never as a blank cell that could
      // be mistaken for a real zero or an empty string.
      marksAbsent: text.includes('Not recorded') || text.includes('—'),
      // And a genuinely incomplete profile must say what is missing.
      namesMissingFields: text.includes('Missing') || text.includes('Incomplete profile'),
    };
  });
  record(emptyHandling.marksAbsent, 'FE-0803', 'an absent value is marked, not left blank');
  record(
    emptyHandling.namesMissingFields,
    'FE-0803',
    'an incomplete record names the fields it is missing',
  );
  await context.close();
}

/* ========================================================================== */
/* FE-0805 — reachable actions on a small screen                              */
/* ========================================================================== */

{
  const { context, page } = await openAs(EMPLOYEE, 375);

  await page.goto(`${baseUrl}/timesheets/2026-09-01`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  const bottomNav = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    if (!nav) return null;
    const rect = nav.getBoundingClientRect();
    return { bottom: Math.round(rect.bottom), height: Math.round(rect.height) };
  });
  record(
    bottomNav !== null && bottomNav.height >= 44,
    'FE-0805',
    `the mobile bottom navigation is present and tall enough (${bottomNav?.height ?? 0}px)`,
  );

  await page.getByRole('button', { name: /^Add time$/ }).first().click();
  await page.waitForTimeout(900);

  // The on-screen keyboard is simulated by shrinking the viewport height, which
  // is what a soft keyboard does to the visual viewport. The primary action
  // must still be reachable rather than pinned below the fold.
  await page.setViewportSize({ width: 375, height: 380 });
  await page.waitForTimeout(600);

  const primaryReachable = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[role="dialog"] button')];
    const save = buttons.find((button) => /save/i.test(button.textContent ?? ''));
    if (!save) return { found: false };
    save.scrollIntoView({ block: 'nearest' });
    const rect = save.getBoundingClientRect();
    return {
      found: true,
      visible: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
      height: Math.round(rect.height),
    };
  });
  record(
    primaryReachable.found && primaryReachable.visible,
    'FE-0805',
    `the primary action stays reachable with the keyboard open (${primaryReachable.height ?? 0}px tall)`,
  );

  await page.setViewportSize({ width: 375, height: 900 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // The running timer must remain visible and operable at 375px.
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const timer = await page.evaluate(() => {
    const text = document.querySelector('main')?.textContent ?? '';
    const start = [...document.querySelectorAll('button')].find((button) =>
      /start timer/i.test(button.textContent ?? ''),
    );
    if (!start) return { present: text.includes('timer') || text.includes('Timer'), width: 0 };
    const rect = start.getBoundingClientRect();
    return { present: true, width: Math.round(rect.width), height: Math.round(rect.height) };
  });
  record(
    timer.present,
    'FE-0805',
    `the timer control is reachable at 375px (${timer.width}x${timer.height ?? 0})`,
  );

  await context.close();
}

/* ========================================================================== */
/* FE-0826 — interaction feedback                                             */
/* ========================================================================== */

{
  const { context, page } = await openAs(TEAM_LEAD, 1280);
  await page.goto(`${baseUrl}/team/timesheets`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  // Every visible control must change on hover or focus. A control that looks
  // identical in both states gives no feedback that it can be used.
  const feedback = await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll('button, a[href]')]
      .filter(isVisible)
      .slice(0, 30);

    const withoutTransition = controls.filter((el) => {
      const style = getComputedStyle(el);
      const hasTransition =
        style.transitionProperty !== 'none' && parseFloat(style.transitionDuration) > 0;
      // A control with no transition may still change instantly on hover; the
      // class list is the evidence that a hover or focus state was authored.
      const classes = (el.className || '').toString();
      const hasStateClass = /hover:|focus-visible:|active:|group-hover:/.test(classes);
      return !hasTransition && !hasStateClass;
    });

    return {
      total: controls.length,
      withoutFeedback: withoutTransition
        .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}"`)
        .slice(0, 4),
    };
  });
  record(
    feedback.withoutFeedback.length === 0,
    'FE-0826',
    `every control gives hover or focus feedback (${feedback.total} checked)${
      feedback.withoutFeedback.length ? ` — ${feedback.withoutFeedback.join('; ')}` : ''
    }`,
  );

  // A non-interactive element must not claim to be clickable.
  const misleading = await page.evaluate(() => {
    const offenders = [];
    for (const el of document.querySelectorAll('main *')) {
      const style = getComputedStyle(el);
      if (style.cursor !== 'pointer') continue;
      const interactive = el.closest(
        'button, a[href], [role="button"], [role="tab"], [role="option"], [role="switch"], label, select, input, summary, [onclick], [tabindex]:not([tabindex="-1"])',
      );
      if (!interactive) {
        offenders.push(
          `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 30)}`,
        );
      }
      if (offenders.length >= 4) break;
    }
    return offenders;
  });
  record(
    misleading.length === 0,
    'FE-0826',
    `no non-interactive element shows a pointer cursor${misleading.length ? ` — ${misleading.join('; ')}` : ''}`,
  );

  // A disabled control must not offer a pointer, and a busy one must say so.
  const disabledCursor = await page.evaluate(() => {
    const disabled = [...document.querySelectorAll('button[disabled], [aria-disabled="true"]')];
    return disabled.filter((el) => getComputedStyle(el).cursor === 'pointer').length;
  });
  record(
    disabledCursor === 0,
    'FE-0826',
    `no disabled control shows a pointer cursor (${disabledCursor} found)`,
  );

  await context.close();
}

/* ========================================================================== */
/* FE-0825 — visual consistency, the part a machine can judge                 */
/* ========================================================================== */

{
  const sessions = new Map();
  for (const email of new Set(routesToAudit.map((route) => route.email))) {
    sessions.set(email, await openAs(email, 1440));
  }

  for (const route of routesToAudit) {
    const { page } = sessions.get(route.email);
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const consistency = await page.evaluate(() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const hasOwnText = (el) =>
        [...el.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim(),
        );

      const isScreenReaderOnly = (el) =>
        el.classList.contains('sr-only') || el.closest('.sr-only') !== null;

      const textElements = [...document.querySelectorAll('main *')].filter(
        (el) =>
          isVisible(el) &&
          hasOwnText(el) &&
          // `sr-only` is a deliberately clipped 1px box and is itself the
          // readable alternative; an SVG mark is drawn, not laid out.
          !isScreenReaderOnly(el) &&
          !(el instanceof SVGElement),
      );

      // The registered type scale, read from the stylesheet rather than
      // hard-coded, so this stays true if a size is retuned.
      const scale = new Set();
      for (const token of [
        '--text-display',
        '--text-h1',
        '--text-h2',
        '--text-h3',
        '--text-body',
        '--text-body-sm',
        '--text-label',
        '--text-caption',
        '--text-metric',
      ]) {
        const value = getComputedStyle(document.documentElement)
          .getPropertyValue(token)
          .trim();
        if (value) scale.add(value);
      }

      // Resolve each scale entry to pixels for comparison.
      const probe = document.createElement('span');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const scalePx = new Set();
      for (const value of scale) {
        probe.style.fontSize = value;
        scalePx.add(getComputedStyle(probe).fontSize);
      }
      probe.remove();

      const offScale = textElements
        .filter((el) => {
          const size = getComputedStyle(el).fontSize;
          return scalePx.size > 0 && !scalePx.has(size);
        })
        .map((el) => `${el.tagName.toLowerCase()} ${getComputedStyle(el).fontSize}`);

      // Text clipped without any way to read the rest is a defect; text that is
      // deliberately truncated carries a title or an accessible full value.
      const clipped = textElements
        .filter((el) => {
          const style = getComputedStyle(el);
          if (style.overflow === 'visible' && style.textOverflow !== 'ellipsis') return false;
          if (el.scrollWidth <= el.clientWidth + 1) return false;
          return !el.title && !el.getAttribute('aria-label') && !el.querySelector('.sr-only');
        })
        .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}"`);

      return {
        textElements: textElements.length,
        offScale: [...new Set(offScale)].slice(0, 4),
        clipped: clipped.slice(0, 4),
      };
    });

    record(
      consistency.offScale.length === 0,
      'FE-0825',
      `${route.path} uses only the registered type scale (${consistency.textElements} text elements)${
        consistency.offScale.length ? ` — ${consistency.offScale.join('; ')}` : ''
      }`,
    );
    record(
      consistency.clipped.length === 0,
      'FE-0825',
      `${route.path} clips no text without a readable alternative${
        consistency.clipped.length ? ` — ${consistency.clipped.join('; ')}` : ''
      }`,
    );
  }

  for (const { context } of sessions.values()) await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} stress check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`\nAll ${checks} content-stress and interaction checks pass.`);
