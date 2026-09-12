import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = await createServer({
  root: 'apps/browser-fixture',
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
await server.listen();
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const page = await browser.newPage({
    viewport: { width: 1150, height: 880 },
    deviceScaleFactor: 1,
  });
  const external = [];
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('pageerror', e.message);
  });
  await page.route('**/*', (route) => {
    if (!route.request().url().startsWith(base)) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  page.on('requestfailed', (r) => console.log('request failed', r.url(), r.failure()?.errorText));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(base + '/outdoor-map-preview.html', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForFunction(() => document.body.dataset.mapReady === 'true', null, {
    timeout: 45000,
  });
  await page.waitForFunction(() => Number(document.body.dataset.visibleFeatures) > 0);
  assert.equal(await page.evaluate(() => document.body.dataset.mapError), undefined);
  assert.equal(external.length, 0);
  assert.deepEqual(errors, []);
  await mkdir('dist/outdoor-map', { recursive: true });
  await page.screenshot({ path: 'dist/outdoor-map/new-york-preview.png', fullPage: true });
  await writeFile(
    'dist/outdoor-map/visual-report.json',
    JSON.stringify(
      {
        status: 'passed',
        renderer: 'MapLibre GL JS software WebGL',
        externalRequests: 0,
        errors,
        sourceFeatures: 9895,
        nativeDeviceAcceptance: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Real map rendered with zero external requests; screenshot in dist/outdoor-map/new-york-preview.png',
  );
} finally {
  await browser?.close();
  await server.close();
}
