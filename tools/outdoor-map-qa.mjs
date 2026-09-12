import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const mapManifest = JSON.parse(
  await readFile('packages/map/src/assets/new-york-outdoors.manifest.json', 'utf8'),
);
const server = await createServer({
  root: 'apps/browser-fixture',
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
await server.listen();
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}`;
let browser;
async function render(mode, screenshot, allowConnectedBasemap) {
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
      if (
        allowConnectedBasemap &&
        new URL(route.request().url()).hostname === 'tiles.openfreemap.org'
      ) {
        return route.continue();
      }
      return route.abort();
    }
    return route.continue();
  });
  page.on('requestfailed', (r) => console.log('request failed', r.url(), r.failure()?.errorText));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(base + '/outdoor-map-preview.html' + mode, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForFunction(() => document.body.dataset.mapReady === 'true', null, {
    timeout: 45000,
  });
  await page.waitForFunction(() => Number(document.body.dataset.visibleFeatures) > 0);
  await page.waitForFunction(() => Number(document.body.dataset.visibleCamping) > 0);
  assert.equal(await page.evaluate(() => document.body.dataset.mapError), undefined);
  if (allowConnectedBasemap) {
    await page.waitForFunction(() => Number(document.body.dataset.basemapFeatures) > 0);
    assert.ok(external.length > 0);
    assert.ok(external.every((url) => new URL(url).hostname === 'tiles.openfreemap.org'));
  } else {
    assert.equal(external.length, 0);
  }
  assert.deepEqual(errors, []);
  await mkdir('dist/outdoor-map', { recursive: true });
  await page.screenshot({ path: 'dist/outdoor-map/' + screenshot, fullPage: true });
  await page.close();
  return { requests: external.length, errors };
}
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const connected = await render('', 'new-york-preview.png', true);
  const offline = await render('?offline=1', 'new-york-overlay-offline.png', false);
  await writeFile(
    'dist/outdoor-map/visual-report.json',
    JSON.stringify(
      {
        status: 'passed',
        renderer: 'MapLibre GL JS software WebGL',
        connectedBasemapRequests: connected.requests,
        connectedErrors: connected.errors,
        offlineExternalRequests: offline.requests,
        offlineErrors: offline.errors,
        sourceFeatures: mapManifest.featureCount,
        nativeDeviceAcceptance: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Full basemap plus stored overlays rendered; offline overlay fallback also passed.');
} finally {
  await browser?.close();
  await server.close();
}
