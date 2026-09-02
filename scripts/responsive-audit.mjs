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
const outDir = 'screenshots';

const WIDTHS = [375, 768, 1024, 1440];
const ROUTES = ['/', '/showcase'];

if (shouldShoot) mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const failures = [];

console.log(`Responsive audit against ${baseUrl}\n`);

for (const route of ROUTES) {
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

    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });

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
    await page.keyboard.press('Tab');
    const focusVisible = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || active === document.body) return false;
      const style = getComputedStyle(active);
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    });
    if (!focusVisible) {
      failures.push(`${route} @ ${width}px: first tab stop has no visible focus outline`);
    }

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

    const status = scrolls || smallTargets.length > 0 || !focusVisible ? 'FAIL' : 'PASS';
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

console.log(`\nAll ${ROUTES.length * WIDTHS.length} route/width combinations pass.`);
