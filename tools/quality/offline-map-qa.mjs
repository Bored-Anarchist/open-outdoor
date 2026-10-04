import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const python =
  process.env.QA_PYTHON ??
  (process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const bridge = spawn(python, ['tools/quality/offline-map-tile-server.py'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let diagnostics = '';
bridge.stderr.on('data', (chunk) => {
  diagnostics += chunk;
});
let browser, server;
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tile bridge did not start: ${diagnostics}`)),
      45000,
    );
    bridge.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/QA_TILE_SERVER=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    bridge.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Tile bridge exited ${code}: ${diagnostics}`));
    });
    bridge.once('error', reject);
  });
  const requireMobile = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
  server = await createServer({
    root: 'apps/browser-fixture',
    resolve: { alias: { '@protomaps/basemaps': requireMobile.resolve('@protomaps/basemaps') } },
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const tiles = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader'],
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    console.error('Offline QA request failed:', request.url(), request.failure()),
  );
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.hostname, '127.0.0.1', 'Offline map must never request external resources');
    return route.continue();
  });
  await page.goto(`${base}/offline-map-preview.html?tiles=${encodeURIComponent(tiles)}`);
  await page.waitForFunction(() => document.body.dataset.qaReady === 'true', null, {
    timeout: 30000,
  });
  await mkdir('dist/outdoor-map', { recursive: true });
  async function show(
    center,
    zoom,
    category = 'all',
    density = 'automatic',
    installed = true,
    selectedId = null,
  ) {
    return page.evaluate(
      (args) =>
        Promise.race([
          window.offlineQA.show(...args),
          new Promise((_, reject) =>
            setTimeout(() => {
              const { map, errors } = window.offlineQA;
              reject(
                new Error(
                  `Offline map did not settle: ${JSON.stringify({
                    styleLoaded: map.isStyleLoaded(),
                    tilesLoaded: map.areTilesLoaded(),
                    zoom: map.getZoom(),
                    errors,
                  })}`,
                ),
              );
            }, 30000),
          ),
        ]),
      [center, zoom, category, density, installed, selectedId],
    );
  }
  const center = [-73.12345678, 42.87654321];
  await show([-98, 39], 3, 'all', 'automatic', false);
  const stock = await page.evaluate(async () => {
    const { map } = window.offlineQA;
    const style = map.getStyle();
    const catalog = style.sources.outdoors.data;
    const collection = typeof catalog === 'string' ? await (await fetch(catalog)).json() : catalog;
    return {
      catalogFeatures: collection.features.length,
      installedState: Boolean(style.sources['state-NY']),
      worldFeatures: map
        .queryRenderedFeatures()
        .filter((feature) => feature.source === 'offline-world').length,
      outdoorFeatures: map
        .queryRenderedFeatures()
        .filter((feature) => feature.source === 'outdoors').length,
    };
  });
  assert.equal(stock.catalogFeatures, 0, 'Stock app must not bundle a New York catalog');
  assert.equal(stock.installedState, false, 'State catalogs must be installed explicitly');
  assert.equal(stock.outdoorFeatures, 0);
  assert.ok(stock.worldFeatures > 0, 'The offline basemap must work without state packages');
  await page.screenshot({ path: 'dist/outdoor-map/offline-stock-basemap.png' });
  const regional = await show(center, 10);
  assert.equal(regional.useRegionalDetail, true);
  const counts = await page.evaluate(() => {
    const { map } = window.offlineQA;
    const features = map.queryRenderedFeatures();
    return {
      world: features.filter((f) => f.source === 'offline-world').length,
      regional: features.filter((f) => f.source === 'offline-regional').length,
      state: features.filter((f) => f.layer.id === 'state-NY-poi').length,
    };
  });
  assert.equal(counts.world, 0, 'World geometry must not duplicate regional roads or labels');
  assert.ok(counts.regional > 0);
  assert.ok(counts.state > 0);
  await page.screenshot({ path: 'dist/outdoor-map/offline-regional.png' });
  await show(center, 18, 'water', 'automatic', true, 'qa-water');
  const precision = await page.evaluate((center) => {
    const { map } = window.offlineQA;
    const feature = map
      .queryRenderedFeatures({ layers: ['place-marker'] })
      .find((f) => f.properties.id === 'qa-water');
    const expected = map.project(center);
    const actual = map.project(feature.geometry.coordinates);
    return {
      pixels: Math.hypot(actual.x - expected.x, actual.y - expected.y),
      vectorDuplicates: map.queryRenderedFeatures({
        layers: ['state-NY-poi', 'state-NY-selection-point'],
      }).length,
      markers: map.queryRenderedFeatures({ layers: ['place-marker'] }).length,
    };
  }, center);
  assert.ok(
    precision.pixels < 0.25,
    `Original coordinates must survive close zoom: ${precision.pixels}px error`,
  );
  assert.equal(precision.vectorDuplicates, 0);
  assert.equal(precision.markers, 1);
  await page.screenshot({ path: 'dist/outdoor-map/offline-precise-place.png' });
  await show(center, 18, 'campsite');
  assert.equal(
    await page.evaluate(
      () => window.offlineQA.map.queryRenderedFeatures({ layers: ['place-marker'] }).length,
    ),
    0,
  );
  await show(center, 18, 'all', 'automatic', false);
  assert.equal(
    await page.evaluate(() => Boolean(window.offlineQA.map.getSource('state-NY'))),
    false,
  );
  const worldwide = await show([139.7, 35.7], 10, 'all', 'automatic', false);
  assert.equal(worldwide.useRegionalDetail, false);
  assert.ok(
    await page.evaluate(() =>
      window.offlineQA.map.queryRenderedFeatures().some((f) => f.source === 'offline-world'),
    ),
  );
  await page.screenshot({ path: 'dist/outdoor-map/offline-world-fallback.png' });
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.offlineQA.errors), []);
  await writeFile(
    'dist/outdoor-map/offline-visual-report.json',
    JSON.stringify(
      {
        status: 'passed',
        stock,
        regional,
        counts,
        precision,
        worldwide,
        externalRequests: 0,
        nativeDeviceAcceptance: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Bundled offline regional/world archives and exact installed place positions rendered successfully.',
  );
} finally {
  if (diagnostics) console.error(diagnostics);
  await browser?.close();
  await server?.close();
  bridge.kill();
}
