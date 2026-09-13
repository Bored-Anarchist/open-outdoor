import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const mapManifest = JSON.parse(
  await readFile('packages/map/src/assets/new-york-outdoors.manifest.json', 'utf8'),
);
const mapIndex = JSON.parse(
  await readFile('packages/map/src/assets/new-york-outdoors.index.json', 'utf8'),
);
const campingCategories = new Set([
  'PRIMITIVE CAMPSITE',
  'CAMPSITE',
  'ACCESSIBLE CAMPSITE',
  'CAMPGROUND',
  'LEAN-TO',
]);
const campingAnchor = mapIndex.features.find(
  (feature) =>
    feature.properties.kind === 'poi' && campingCategories.has(feature.properties.category),
);
assert(campingAnchor, 'A campsite anchor is required for zoom acceptance');
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
  const external = [];
  const errors = [];
  async function openPage() {
    const nextPage = await browser.newPage({
      viewport: { width: 1150, height: 880 },
      deviceScaleFactor: 1,
    });
    nextPage.on('pageerror', (e) => {
      errors.push(e.message);
      console.log('pageerror', e.message);
    });
    await nextPage.route('**/*', (route) => {
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
    nextPage.on('requestfailed', (r) =>
      console.log('request failed', r.url(), r.failure()?.errorText),
    );
    nextPage.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    return nextPage;
  }
  let page = await openPage();
  await page.goto(base + '/outdoor-map-preview.html' + mode, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForFunction(() => document.body.dataset.mapReady === 'true', null, {
    timeout: 45000,
  });
  await page.waitForFunction(() => Number(document.body.dataset.visibleFeatures) > 0);
  await page.waitForFunction(() => Number(document.body.dataset.visibleCamping) > 0);
  assert.equal(await page.getByLabel('Show on map').inputValue(), 'all');
  assert.equal(await page.getByLabel('Marker detail').inputValue(), 'automatic');
  assert.equal(await page.evaluate(() => document.body.dataset.mapError), undefined);
  const zoomStages = [];
  if (allowConnectedBasemap) {
    const center = [campingAnchor.bounds[0], campingAnchor.bounds[1]];
    async function inspectZoom(zoom) {
      await page.evaluate(
        ({ center, zoom }) =>
          new Promise((resolve) => {
            const map = window.__outdoorMap;
            map.once('idle', resolve);
            map.jumpTo({ center, zoom });
          }),
        { center, zoom },
      );
      return page.evaluate(() => ({
        zoom: Number(document.body.dataset.mapZoom),
        band: document.body.dataset.zoomBand,
        clusters: Number(document.body.dataset.visibleClusters),
        icons: Number(document.body.dataset.visiblePlaceIcons),
        labels: Number(document.body.dataset.visiblePlaceLabels),
      }));
    }
    const overview = await inspectZoom(8);
    assert.equal(overview.band, 'clusters');
    assert.ok(overview.clusters > 0);
    assert.equal(overview.icons, 0);
    assert.equal(overview.labels, 0);
    zoomStages.push(overview);

    const local = await inspectZoom(13);
    assert.equal(local.band, 'icons');
    assert.equal(local.clusters, 0);
    assert.ok(local.icons > 0);
    assert.equal(local.labels, 0);
    zoomStages.push(local);

    const site = await inspectZoom(15);
    assert.equal(site.band, 'labels');
    assert.equal(site.clusters, 0);
    assert.ok(site.icons > 0);
    assert.ok(site.labels > 0);
    zoomStages.push(site);

    await page.getByLabel('Show on map').selectOption('camping');
    await page.waitForFunction(
      () =>
        document.body.dataset.placeFilter === 'camping' &&
        document.body.dataset.renderedPlaceRevision === document.body.dataset.placeRevision &&
        Number(document.body.dataset.visiblePlaceIcons) > 0 &&
        Number(document.body.dataset.visiblePlaceLabels) > 0,
    );
    await page.getByLabel('Marker detail').selectOption('fewer');
    await page.waitForFunction(
      () =>
        document.body.dataset.markerDensity === 'fewer' &&
        document.body.dataset.renderedPlaceRevision === document.body.dataset.placeRevision &&
        Number(document.body.dataset.visiblePlaceIcons) > 0,
    );
    assert.equal(Number(await page.evaluate(() => document.body.dataset.visiblePlaceLabels)), 0);
    assert.match(await page.locator('#zoom-readout').innerText(), /Local view/);

    // Reopen the fixture for visual evidence after exercising source replacement.
    // Chromium software WebGL can briefly clear the canvas during that replacement.
    await page.close();
    page = await openPage();
    await page.goto(base + '/outdoor-map-preview.html' + mode, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForFunction(() => document.body.dataset.mapReady === 'true', null, {
      timeout: 45000,
    });
    await page.waitForFunction(
      () =>
        document.body.dataset.renderedPlaceRevision === document.body.dataset.placeRevision &&
        Number(document.body.dataset.visibleClusters) > 0,
    );
    assert.equal(await page.getByLabel('Show on map').inputValue(), 'all');
    assert.equal(await page.getByLabel('Marker detail').inputValue(), 'automatic');
    assert.match(await page.locator('#zoom-readout').innerText(), /Area view/);
  }
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
  return { requests: external.length, errors, zoomStages };
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
        zoomStages: connected.zoomStages,
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
