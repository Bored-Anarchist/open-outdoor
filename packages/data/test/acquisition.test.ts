import { describe, expect, it, vi } from 'vitest';
import {
  AcquisitionSession,
  acquireArcGis,
  acquireBulk,
  acquireFeed,
  acquireRest,
  acquireWfs,
  displayOverlay,
  inspectBulkArchive,
  type ConnectorManifest,
  type AcquisitionPolicy,
} from '../src/index.js';

const now = '2026-09-09T00:00:00.000Z';
const manifest: ConnectorManifest = {
  schemaVersion: '1.0.0',
  connectorVersion: '1.0.0',
  sourceId: 'synthetic-acquisition',
  lifecycle: 'active',
  authorization: 'authorized',
  acquisitionMode: 'automated',
  sourceClass: 'current',
  classification: 'PUBLIC_SYNTHETIC',
  allowedTransports: ['https'],
  allowedHosts: ['example.invalid'],
  secretNames: [],
  rights: {
    rawRetention: 'P1D',
    parsedFields: ['geometry'],
    media: false,
    derivedData: true,
    offlineStorage: true,
    distribution: { public: true, 'private-user': true, 'private-organization': true },
    attribution: ['Synthetic'],
    termsUrl: 'https://example.invalid/terms',
    evidenceReviewedAt: now,
    reviewExpiresAt: null,
  },
  limits: {
    maxPayloadBytes: 1024,
    maxArchiveEntries: 10,
    maxExpandedBytes: 4096,
    maxCompressionRatio: 10,
    maxParserMilliseconds: 1000,
    maxRedirects: 1,
    maxConcurrency: 1,
  },
  requiredFreshnessSeconds: null,
};
const policy: AcquisitionPolicy = {
  contentTypes: ['application/json', 'application/rss+xml'],
  maxRunBytes: 4096,
  maxPages: 10,
  timeoutMs: 2000,
  retries: 2,
  retryDelayMs: 1,
};
const signal = (): AbortSignal => new AbortController().signal;
const response = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', etag: 'v1' },
  });
const sink = () => ({ stage: vi.fn(async () => {}), checkpoint: vi.fn(async () => {}) });
function setup(
  responses: Response[],
  overrides: Partial<ConnectorManifest> = {},
  budget: Partial<AcquisitionPolicy> = {},
) {
  const fetcher = vi.fn(async () => {
    const result = responses.shift();
    if (!result) throw new Error('unexpected fetch');
    return result;
  });
  const wait = vi.fn(async () => {});
  return {
    session: new AcquisitionSession({ ...manifest, ...overrides }, { ...policy, ...budget }, now, {
      fetch: fetcher,
      wait,
    }),
    fetcher,
    wait,
  };
}

describe('WP-402 acquisition adapters', () => {
  it('retries transient failures, carries ETags, and accepts a durable conditional checkpoint', async () => {
    const { session, wait, fetcher } = setup([
      new Response(null, { status: 429, headers: { 'retry-after': '1' } }),
      response({ ok: true }),
      new Response(null, { status: 304 }),
    ]);
    const page = await session.request('https://example.invalid/a', signal());
    expect(page?.checkpoint.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(wait.mock.calls).toHaveLength(1);
    expect(
      await session.request('https://example.invalid/a', signal(), page!.checkpoint),
    ).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([
    'https://evil.invalid/a',
    'http://example.invalid/a',
    'https://a:b@example.invalid/a',
    'https://example.invalid:8443/a',
    'https://example.invalid/a?token=secret',
  ])('rejects unsafe locator %s before contact', async (url) => {
    const { session, fetcher } = setup([]);
    await expect(session.request(url, signal())).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('checks every redirect and rejects cross-host pagination before staging', async () => {
    const redirected = setup([
      new Response(null, { status: 302, headers: { location: 'https://evil.invalid' } }),
    ]);
    await expect(
      redirected.session.request('https://example.invalid/a', signal()),
    ).rejects.toThrow();
    expect(redirected.fetcher).toHaveBeenCalledTimes(1);
    const paged = setup([response({ next: 'https://evil.invalid' })]);
    const target = sink();
    await expect(
      acquireRest(
        paged.session,
        'https://example.invalid/a',
        signal(),
        target,
        () => 'https://evil.invalid',
      ),
    ).rejects.toThrow();
    expect(target.stage).not.toHaveBeenCalled();
  });
  it('follows an allowed redirect with manual redirect handling', async () => {
    const { session, fetcher } = setup([
      new Response(null, { status: 302, headers: { location: '/b' } }),
      response({}),
    ]);
    expect((await session.request('https://example.invalid/a', signal()))?.url).toBe(
      'https://example.invalid/b',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('bounds retries, total pages, payload bytes and content types', async () => {
    const retry = setup(Array.from({ length: 3 }, () => new Response(null, { status: 503 })));
    await expect(retry.session.request('https://example.invalid/a', signal())).rejects.toThrow(
      /retries/,
    );
    expect(retry.fetcher).toHaveBeenCalledTimes(3);
    const large = setup([
      new Response('x'.repeat(1025), { headers: { 'content-type': 'application/json' } }),
    ]);
    await expect(large.session.request('https://example.invalid/a', signal())).rejects.toThrow(
      /payload/,
    );
    const type = setup([new Response('<html/>', { headers: { 'content-type': 'text/html' } })]);
    await expect(type.session.request('https://example.invalid/a', signal())).rejects.toThrow(
      /content type/,
    );
    const pages = setup([response({}), response({})], {}, { maxPages: 1 });
    await pages.session.request('https://example.invalid/a', signal());
    await expect(pages.session.request('https://example.invalid/b', signal())).rejects.toThrow(
      /page budget/,
    );
    const bytes = setup([response({ a: 1 }), response({ a: 2 })], {}, { maxRunBytes: 10 });
    await bytes.session.request('https://example.invalid/a', signal());
    await expect(bytes.session.request('https://example.invalid/b', signal())).rejects.toThrow(
      /byte budget/,
    );
  });
  it('does not checkpoint a failed stage and supports replay from the saved next locator', async () => {
    const { session } = setup([response({}), response({})]);
    const target = sink();
    target.stage.mockRejectedValueOnce(new Error('disk full'));
    await expect(
      acquireRest(session, 'https://example.invalid/a', signal(), target),
    ).rejects.toThrow('disk full');
    expect(target.checkpoint).not.toHaveBeenCalled();
    await acquireRest(session, 'https://example.invalid/a', signal(), target);
    expect(target.checkpoint).toHaveBeenCalledOnce();
  });
  it('blocks disabled/expired sources and cancellation before contact', async () => {
    for (const overrides of [
      { authorization: 'revoked' as const },
      { lifecycle: 'disabled' as const },
      { rights: { ...manifest.rights, reviewExpiresAt: now } },
    ]) {
      const { session, fetcher } = setup([], overrides);
      await expect(session.request('https://example.invalid/a', signal())).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    }
    const { session, fetcher } = setup([]);
    const controller = new AbortController();
    controller.abort();
    await expect(session.request('https://example.invalid/a', controller.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('enforces a real fetch timeout', async () => {
    const session = new AcquisitionSession(manifest, { ...policy, timeoutMs: 10 }, now, {
      fetch: async (_url, init) =>
        new Promise((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new Error('timed out')), {
            once: true,
          }),
        ),
    });
    await expect(session.request('https://example.invalid/a', signal())).rejects.toThrow(
      /timeout|timed out/,
    );
  });
  it('uses complete ArcGIS ID batches and WFS CRS84 paging', async () => {
    const arc = setup([
      response({ objectIds: [3, 1, 2] }),
      response({ features: [{}, {}] }),
      response({ features: [{}] }),
    ]);
    const target = sink();
    await acquireArcGis(arc.session, 'https://example.invalid/query', 2, signal(), target);
    expect(target.stage).toHaveBeenCalledTimes(2);
    const wfs = setup([
      response({ type: 'FeatureCollection', numberMatched: 3, features: [{}, {}] }),
      response({ type: 'FeatureCollection', numberMatched: 3, features: [{}] }),
    ]);
    const wfsTarget = sink();
    await acquireWfs(
      wfs.session,
      'https://example.invalid/wfs',
      'ns:trails',
      2,
      signal(),
      wfsTarget,
    );
    expect(wfsTarget.checkpoint).toHaveBeenCalledTimes(2);
    expect(wfsTarget.stage.mock.calls.length).toBe(2);
  });
  it('quarantines incomplete ArcGIS pages', async () => {
    const { session } = setup([response({ objectIds: [1, 2] }), response({ features: [{}] })]);
    const target = sink();
    await expect(
      acquireArcGis(session, 'https://example.invalid/query', 2, signal(), target),
    ).rejects.toThrow(/incomplete/);
    expect(target.stage).not.toHaveBeenCalled();
  });
  it('fetches bulk files and validates feeds without following embedded links', async () => {
    const bulk = setup([response({}), response({})]);
    const target = sink();
    await acquireBulk(
      bulk.session,
      ['https://example.invalid/a', 'https://example.invalid/b'],
      signal(),
      target,
    );
    expect(target.stage).toHaveBeenCalledTimes(2);
    const feed = setup([
      new Response('<rss><channel><link>https://evil.invalid</link></channel></rss>', {
        headers: { 'content-type': 'application/rss+xml' },
      }),
    ]);
    await acquireFeed(feed.session, 'https://example.invalid/rss', signal(), sink());
    expect(feed.fetcher).toHaveBeenCalledOnce();
    const unsafe = setup([
      new Response('<!DOCTYPE rss><rss/>', { headers: { 'content-type': 'application/rss+xml' } }),
    ]);
    await expect(
      acquireFeed(unsafe.session, 'https://example.invalid/rss', signal(), sink()),
    ).rejects.toThrow();
  });
  it.each(['../file', 'C:/file', 'con.txt', 'dir/file:stream', 'file.', 'a/'.repeat(17) + 'file'])(
    'rejects unsafe bulk path %s',
    (path) => {
      expect(() =>
        inspectBulkArchive(
          [{ path, compressedBytes: 1, expandedBytes: 1, kind: 'file' }],
          manifest,
        ),
      ).toThrow();
    },
  );
  it('keeps local files selected and overlays display-only', () => {
    const { session } = setup([], { acquisitionMode: 'user-export', allowedTransports: ['file'] });
    const bytes = new Uint8Array([1, 2]);
    const copy = session.local({ userSelected: true, bytes, contentType: 'application/json' });
    copy[0] = 9;
    expect(bytes[0]).toBe(1);
    expect(
      displayOverlay(
        { ...manifest, acquisitionMode: 'overlay' },
        'https://example.invalid/tiles',
        now,
      ),
    ).toMatchObject({ queryable: false, kind: 'display-only' });
    expect(() => displayOverlay(manifest, 'https://example.invalid/tiles', now)).toThrow();
  });
});

it('retries network failures without exposing transport diagnostics', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('private transport detail'))
    .mockResolvedValueOnce(response({ ok: true }));
  const session = new AcquisitionSession(manifest, policy, now, {
    fetch: fetcher,
    wait: async () => {},
  });
  expect(await session.request('https://example.invalid/a', signal())).not.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const failed = new AcquisitionSession(manifest, { ...policy, retries: 0 }, now, {
    fetch: async () => {
      throw new Error('private transport detail');
    },
  });
  await expect(failed.request('https://example.invalid/a', signal())).rejects.toThrow(
    'network retries exhausted',
  );
});

it('rejects concurrent requests and releases the session after completion', async () => {
  let release!: (value: Response) => void;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(response({}));
  const session = new AcquisitionSession(manifest, policy, now, { fetch: fetcher });
  const first = session.request('https://example.invalid/a', signal());
  await expect(session.request('https://example.invalid/b', signal())).rejects.toThrow(
    /concurrent/,
  );
  release(response({}));
  await first;
  await expect(session.request('https://example.invalid/b', signal())).resolves.not.toBeNull();
});

it('resumes at the durable next URL after interruption without skipping a page', async () => {
  const staged: string[] = [];
  const saved: (string | null)[] = [];
  const { session } = setup([response({}), response({})]);
  const controller = new AbortController();
  await expect(
    session.pages(
      'https://example.invalid/a',
      controller.signal,
      () => '/b',
      async (page) => {
        staged.push(page.url);
      },
      async (_checkpoint, next) => {
        saved.push(next);
        controller.abort();
      },
    ),
  ).rejects.toThrow();
  expect(staged).toEqual(['https://example.invalid/a']);
  expect(saved).toEqual(['https://example.invalid/b']);
  const resumed = setup([response({})]);
  await resumed.session.pages(
    saved[0]!,
    signal(),
    () => null,
    async (page) => {
      staged.push(page.url);
    },
    async (_checkpoint, next) => {
      saved.push(next);
    },
  );
  expect(staged).toEqual(['https://example.invalid/a', 'https://example.invalid/b']);
  expect(saved[1]).toBeNull();
});

it('rejects mismatched conditional checkpoints and incomplete WFS totals', async () => {
  const { session } = setup([response({})]);
  const page = await session.request('https://example.invalid/a', signal());
  await expect(
    session.request('https://example.invalid/b', signal(), page!.checkpoint),
  ).rejects.toThrow(/checkpoint/);
  const wfs = setup([response({ type: 'FeatureCollection', numberMatched: 3, features: [{}] })]);
  const target = sink();
  await expect(
    acquireWfs(wfs.session, 'https://example.invalid/wfs', 'trails', 2, signal(), target),
  ).rejects.toThrow(/incomplete/);
  expect(target.stage).not.toHaveBeenCalled();
});
