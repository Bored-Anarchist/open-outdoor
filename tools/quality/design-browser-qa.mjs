import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const require = createRequire(import.meta.url);
const root = resolve('apps/browser-fixture');
await build({ root, logLevel: 'warn' });
const server = await preview({ root, logLevel: 'warn', preview: { host: '127.0.0.1', port: 0 } });
const address = server.httpServer.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const output = resolve('dist/design-qa');
await mkdir(output, { recursive: true });
const errors = [];
const externalRequests = [];
const report = {
  testId: 'T-E2E-001-D03',
  classification: 'SYNTHETIC_OR_REDACTED',
  cases: [],
  accessibilityScans: [],
};
let browser;
try {
  browser = await chromium.launch(
    process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {},
  );
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    if (!route.request().url().startsWith(base)) {
      externalRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  async function settingsPage(title) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    if (title) await page.locator(`[data-settings-page="${title}"]`).click();
  }
  async function appearance(value) {
    await settingsPage('appearance');
    await page.locator('#appearance').selectOption(value);
    await page.locator('#back').click();
    await page.locator('#back').click();
  }
  async function scan(name) {
    const result = await page.evaluate(async () =>
      window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      }),
    );
    assert.deepEqual(
      result.violations.map((item) => ({
        id: item.id,
        impact: item.impact,
        targets: item.nodes.map((node) => node.target),
      })),
      [],
      name,
    );
    report.accessibilityScans.push({
      name,
      violations: 0,
      rulesPassed: result.passes.length,
      incompleteRules: result.incomplete.map((item) => item.id),
    });
  }
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const value of ['light', 'dark', 'high-contrast']) {
      await page.goto(base);
      await appearance(value);
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      for (const section of ['Explore', 'Search', 'Track', 'Saved']) {
        await page.locator('nav').getByRole('button', { name: section, exact: true }).click();
        assert.equal(
          await page.locator('details.design-tools').count(),
          0,
          'Technical examples stay in Settings',
        );
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '34px';
        });
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${width}/${value}/${section}: overflow at 200% text`,
        );
        const nav = await page.locator('nav').boundingBox();
        assert(
          nav && Math.abs(nav.y + nav.height - 844) < 1,
          `${width}/${value}/${section}: navigation must be flush with viewport bottom ${JSON.stringify(nav)}`,
        );
        const targets = await page.locator('nav button').evaluateAll((elements) =>
          elements.map((element) => ({
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          })),
        );
        assert(targets.every((target) => target.width >= 44 && target.height >= 52));
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '17px';
        });
        await page.screenshot({
          path: resolve(output, `${width}-${value}-${section.toLowerCase()}.png`),
        });
        await scan(`${width}/${value}/${section}`);
      }
      await settingsPage();
      await scan(`${width}/${value}/Settings`);
      await page.screenshot({ path: resolve(output, `${width}-${value}-settings.png`) });
      await page.locator('[data-settings-page="advanced"]').click();
      await page.locator('#all-states summary').click();
      assert.equal(await page.locator('#all-states [data-state]').count(), 24);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '34px';
      });
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'All field states reflow',
      );
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '17px';
        document.querySelectorAll('details').forEach((element) => {
          element.open = true;
        });
      });
      await scan(`${width}/${value}/Components`);
      report.cases.push(
        `${width}/${value}: all tabs, Settings, 200% text, bottom navigation, 24 field states`,
      );
    }
  }
  await page.goto(base);
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  await page.keyboard.press('Tab');
  assert(await page.locator('.skip').evaluate((element) => element === document.activeElement));
  await page.keyboard.press('Enter');
  assert(await page.locator('#surface').evaluate((element) => element === document.activeElement));
  await page.locator('nav').getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Place or trail name').fill('no-match');
  assert.match(await page.locator('#results').innerText(), /Nothing here yet/);
  await page.getByLabel('Place or trail name').fill('Hemlock');
  await page.locator('#results button').first().click();
  for (const label of ['Coverage', 'Freshness', 'Restrictions'])
    assert((await page.locator('#selected-detail dt').allTextContents()).includes(label));
  assert.match(await page.locator('#selected-detail .access-note').innerText(), /Access unknown/);
  await page.getByLabel('Categories', { exact: true }).selectOption('land');
  assert.equal(await page.locator('#results button').count(), 0);
  await settingsPage('maps');
  assert.match(
    await page.locator('#surface').innerText(),
    /Public packages[\s\S]*No public packages[\s\S]*Private data[\s\S]*No private datasets/,
  );
  await page.locator('nav').getByRole('button', { name: 'Search', exact: true }).click();
  assert.equal(await page.getByLabel('Place or trail name').inputValue(), 'Hemlock');
  assert.equal(await page.getByLabel('Categories', { exact: true }).inputValue(), 'land');
  await page.locator('nav').getByRole('button', { name: 'Track', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  assert.match(await page.locator('#action-status').innerText(), /unavailable/);
  await page.locator('nav').getByRole('button', { name: 'Saved', exact: true }).click();
  assert.match(await page.locator('#surface').innerText(), /Saved on your device/);
  await settingsPage('advanced');
  for (const state of ['closure', 'private-unavailable', 'rights-excluded', 'checkpoint-error']) {
    await page.locator('#field-state').selectOption(state);
    assert.equal(await page.locator(`#field-notice [data-state="${state}"]`).count(), 1);
  }
  await page.getByText('Buttons and navigation', { exact: true }).click();
  assert(await page.getByRole('button', { name: 'Disabled', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: 'Saving…', exact: true }).isDisabled());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .locator('nav button')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
    '0s',
  );
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
  report.cases.push(
    'Keyboard focus, retained query/categories, real empty inventory, permission capability, field transitions, disabled/busy, reduced motion and axe negative control',
  );
  report.manualReviewRequired =
    'Native VoiceOver, Dynamic Type, physical recording, outdoor visibility and performance need device review. Browser screenshots use synthetic geography.';
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    `Design acceptance passed: ${report.cases.length} groups and ${report.accessibilityScans.length} WCAG scans.`,
  );
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
