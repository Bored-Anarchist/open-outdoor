/** Desktop regression profile only; cannot satisfy physical iPhone budgets. */
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { boundedDisplayPoints } from '../packages/shared/src/foreground-task.ts';
import { distribution } from './production-quality-lib.mjs';
const root = resolve('apps/browser-fixture');
await build({ root, logLevel: 'warn' });
const server = await preview({ root, logLevel: 'warn', preview: { host: '127.0.0.1', port: 0 } });
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch(
    process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {},
  );
  const launchMs = [];
  let page;
  for (let i = 0; i < 20; i++) {
    const context = await browser.newContext();
    page = await context.newPage();
    const start = performance.now();
    await page.goto(url);
    await page.getByRole('button', { name: 'Explore', exact: true }).waitFor();
    launchMs.push(performance.now() - start);
    if (i < 19) await context.close();
  }
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const searchMs = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await page.getByLabel('Place or trail name').fill(i % 2 ? 'Hemlock' : 'no-match');
    await page.locator('#result-count').waitFor();
    searchMs.push(performance.now() - start);
  }
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const frameMs = await page.evaluate(
    async () =>
      new Promise((resolve) => {
        const values = [];
        let last;
        function frame(now) {
          if (last !== undefined) values.push(now - last);
          last = now;
          if (values.length < 180) requestAnimationFrame(frame);
          else resolve(values);
        }
        requestAnimationFrame(frame);
      }),
  );
  const scrollMs = await page.evaluate(
    async () =>
      new Promise((resolve) => {
        const values = [];
        let last;
        function frame(now) {
          if (last !== undefined) values.push(now - last);
          last = now;
          window.scrollTo(0, values.length % 2 ? 0 : document.body.scrollHeight);
          if (values.length < 180) requestAnimationFrame(frame);
          else resolve(values);
        }
        requestAnimationFrame(frame);
      }),
  );
  const points = Array.from({ length: 100000 }, (_, i) => [i / 100000, 0]);
  const displayMs = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const bounded = boundedDisplayPoints(points);
    if (bounded.length !== 2048) throw new Error('Display allocation regressed');
    displayMs.push(Math.max(0.000001, performance.now() - start));
  }
  const report = {
    schemaVersion: 1,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    environment: 'desktop-browser-supplemental',
    physicalAcceptance: false,
    fixture: 'WP-501 synthetic browser schematic; three places; 100000 synthetic display points',
    metrics: {
      pageLoadMs: distribution(launchMs),
      fixtureSearchMs: distribution(searchMs),
      schematicFrameMs: distribution(frameMs),
      scrollFrameMs: distribution(scrollMs),
      boundedDisplayMs: distribution(displayMs),
    },
    raw: {
      pageLoadMs: launchMs,
      fixtureSearchMs: searchMs,
      schematicFrameMs: frameMs,
      scrollFrameMs: scrollMs,
      boundedDisplayMs: displayMs,
    },
    residentMemoryMiB: process.memoryUsage().rss / 1024 ** 2,
  };
  await mkdir('dist/production-quality', { recursive: true });
  await writeFile(
    'dist/production-quality/desktop-profile.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    'Desktop-only performance profile written; no iPhone or endurance acceptance claimed.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
