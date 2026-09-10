import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
/** Synthetic browser acceptance. No external services or device data. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const root = resolve('apps/browser-fixture');
await build({ root, logLevel: 'warn' });
const server = await preview({ root, logLevel: 'warn', preview: { host: '127.0.0.1', port: 0 } });
const address = server.httpServer.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
let browser;
const errors = [];
const report = { testId: 'T-E2E-001-D03', classification: 'SYNTHETIC_OR_REDACTED', cases: [] };
const output = resolve('dist/design-qa');
await mkdir(output, { recursive: true });
try {
  browser = await chromium.launch(
    process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {},
  );
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const externalRequests = [];
  await page.route('**/*', (route) => {
    if (!route.request().url().startsWith(base)) {
      externalRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  for (const width of [320, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const appearance of ['light', 'dark', 'high-contrast']) {
      await page.goto(base);
      await page.locator('#appearance').selectOption(appearance);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '34px';
      });
      await page.locator('#all-states summary').click();
      assert.equal(await page.locator('#all-states [data-state]').count(), 24);
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${width}/${appearance}: overflow at 200% text`,
      );
      const targets = await page.locator('nav button').evaluateAll((elements) =>
        elements.map((element) => ({
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        })),
      );
      assert(targets.every((target) => target.width >= 44 && target.height >= 44));
      for (const control of await page.locator('nav button').all())
        assert((await control.getAttribute('aria-pressed')) !== null);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '17px';
      });
      await page.locator('#all-states summary').click();
      await page.screenshot({
        path: resolve(output, `${width}-${appearance}.png`),
        fullPage: true,
      });
      report.cases.push(
        `${width}/${appearance}: layout, 200% text, targets, complete field states`,
      );
    }
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(base);
  await page.keyboard.press('Tab');
  assert.equal(
    await page.locator('.skip').evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('#surface').evaluate((element) => element === document.activeElement),
    true,
  );
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Place or trail name').fill('no-match');
  assert.match(await page.locator('#results').innerText(), /Nothing here yet/);
  await page.getByLabel('Place or trail name').fill('Hemlock');
  assert((await page.locator('#results button').count()) > 0);
  await page.locator('#results button').first().click();
  for (const label of [
    'Source',
    'Coverage',
    'Freshness',
    'Restrictions',
    'Uncertainty',
    'Provenance',
  ])
    assert((await page.locator('#selected-detail dt').allTextContents()).includes(label));
  await page.getByLabel('Feature type').selectOption('land');
  assert.equal(await page.locator('#results button').count(), 0);
  await page.getByRole('button', { name: 'Track', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  assert.match(await page.locator('#action-status').innerText(), /unavailable/);
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  assert.match(await page.locator('#surface').innerText(), /Private activity/);
  for (const state of ['closure', 'private-unavailable', 'rights-excluded', 'checkpoint-error']) {
    await page.locator('#field-state').selectOption(state);
    assert.equal(await page.locator(`#field-notice [data-state="${state}"]`).count(), 1);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .locator('nav button')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
    '0s',
  );
  await page.getByText('Buttons and navigation', { exact: true }).click();
  assert.equal(
    await page.getByRole('button', { name: 'Disabled', exact: true }).isDisabled(),
    true,
  );
  assert.equal(await page.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), true);
  assert.equal(
    await page.getByRole('button', { name: 'Saving…', exact: true }).getAttribute('aria-busy'),
    'true',
  );
  report.cases.push(
    'keyboard skip/focus, search/filter/selection/empty, detail provenance, native capability, private origin, field transitions, disabled/busy, reduced motion',
  );
  const accessibilityScans = [];
  for (const appearance of ['light', 'dark', 'high-contrast']) {
    await page.goto(base);
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    await page.locator('#appearance').selectOption(appearance);
    for (const section of ['Explore', 'Search', 'Track', 'Saved']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      await page.evaluate(() => {
        document.querySelectorAll('details').forEach((element) => {
          element.open = true;
        });
      });
      const result = await page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
        }),
      );
      assert.deepEqual(
        result.violations.map((item) => ({
          id: item.id,
          impact: item.impact,
          targets: item.nodes.map((node) => node.target),
        })),
        [],
        appearance + '/' + section,
      );
      accessibilityScans.push({
        appearance,
        section,
        violations: 0,
        rulesPassed: result.passes.length,
        incompleteRules: result.incomplete.map((item) => item.id),
      });
    }
  }
  // Verify the audit actually detects an introduced missing accessible name.
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'audit-negative-control';
    document.body.append(button);
  });
  const negative = await page.evaluate(async () =>
    window.axe.run(document, { runOnly: ['button-name'] }),
  );
  assert(negative.violations.some((item) => item.id === 'button-name'));
  await page.locator('#audit-negative-control').evaluate((element) => element.remove());
  report.accessibilityScans = accessibilityScans;
  report.manualReviewRequired =
    'Native VoiceOver, Dynamic Type, Bold Text, outdoor and device performance remain deferred to Phase 5 end under ADR-049. Axe incomplete checks require manual review.';
  report.cases.push(
    'WP-502: twelve axe WCAG scans with all component states expanded; negative control detects missing button name',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    `WP-501 browser acceptance passed: ${report.cases.length} groups; screenshots/report in dist/design-qa.`,
  );
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
