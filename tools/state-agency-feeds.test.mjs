import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acquireApprovedDownload,
  acquireApprovedArcgisLayer,
  assertPrivateAcquisitionApproved,
  discoverArcgisChildLayers,
  loadStateAgencyFeedCatalog,
} from './state-agency-feeds.mjs';

const approvalFor = (feed) => ({
  sourceId: feed.id,
  sourceUrl: feed.url,
  collect: true,
  privateStorage: true,
  publicDistribution: false,
  publisherGrant: true,
  evidenceUrl: 'https://example.org/agency-written-grant',
  reviewedAt: '2026-09-26T00:00:00.000Z',
  expiresAt: '2030-01-01T00:00:00.000Z',
});

test('service-root metadata exposes child layers without querying feature records', async () => {
  const feeds = await loadStateAgencyFeedCatalog();
  const service = feeds.find((item) => item.sourceType === 'arcgis-service');
  assert.ok(service);
  const children = await discoverArcgisChildLayers(service, async (url) => {
    assert.equal(url, `${service.url}?f=pjson`);
    return {
      ok: true,
      json: async () => ({
        layers: [
          { id: 0, name: 'Facilities' },
          { id: 1, name: 'Trails' },
        ],
      }),
    };
  });
  assert.equal(children.length, 2);
  assert.equal(children[0].sourceType, 'arcgis-layer');
  assert.equal(children[0].url, `${service.url}/0`);
  assert.throws(() => assertPrivateAcquisitionApproved(children[0], undefined));
});

test('direct downloads also require private approval and a bounded response', async () => {
  const feeds = await loadStateAgencyFeedCatalog();
  const feed = feeds.find(
    (item) => item.sourceType === 'download-file' && item.rightsStatus === 'Unconfirmed',
  );
  assert.ok(feed);
  const approval = approvalFor(feed);
  await assert.rejects(
    () =>
      acquireApprovedDownload(feed, { ...approval, publisherGrant: false }, async () => {
        throw new Error('fetch must not run');
      }),
    /publisher grant required/,
  );
  const bytes = await acquireApprovedDownload(feed, approval, async () => ({
    ok: true,
    headers: { get: () => '4' },
    arrayBuffer: async () => Uint8Array.of(1, 2, 3, 4).buffer,
  }));
  assert.deepEqual([...bytes], [1, 2, 3, 4]);
});

test('every registered and selected source has a fail-closed feed definition', async () => {
  const feeds = await loadStateAgencyFeedCatalog();
  assert.equal(feeds.length, 231);
  assert.equal(feeds.filter((feed) => feed.origin === 'registry').length, 212);
  assert.equal(feeds.filter((feed) => feed.origin === 'selected-plan').length, 19);
  assert.equal(feeds.filter((feed) => feed.sourceType === 'arcgis-layer').length, 79);
  assert.equal(new Set(feeds.map((feed) => feed.id)).size, feeds.length);
  for (const feed of feeds) {
    assert.throws(() => assertPrivateAcquisitionApproved(feed, undefined));
  }
});

test('unconfirmed sources need an explicit publisher grant and private-only approval', async () => {
  const feeds = await loadStateAgencyFeedCatalog();
  const feed = feeds.find(
    (item) => item.sourceType === 'arcgis-layer' && item.rightsStatus === 'Unconfirmed',
  );
  assert.ok(feed);
  const approval = approvalFor(feed);
  assert.throws(() =>
    assertPrivateAcquisitionApproved(feed, { ...approval, publisherGrant: false }),
  );
  assert.throws(() =>
    assertPrivateAcquisitionApproved(feed, { ...approval, publicDistribution: true }),
  );
  assert.throws(() =>
    assertPrivateAcquisitionApproved(feed, { ...approval, expiresAt: '2020-01-01T00:00:00.000Z' }),
  );
  assert.doesNotThrow(() => assertPrivateAcquisitionApproved(feed, approval));
});

test('approved ArcGIS layer acquisition requires complete ID-based GeoJSON pages', async () => {
  const feeds = await loadStateAgencyFeedCatalog();
  const feed = feeds.find(
    (item) => item.sourceType === 'arcgis-layer' && item.rightsStatus === 'Supported',
  );
  assert.ok(feed);
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = new URLSearchParams(options.body);
    calls.push(body);
    const result =
      body.get('returnIdsOnly') === 'true'
        ? { objectIds: [2, 1, 2] }
        : {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                id: 1,
                geometry: { type: 'Point', coordinates: [-72, 41] },
                properties: { name: 'One' },
              },
              {
                type: 'Feature',
                id: 2,
                geometry: { type: 'Point', coordinates: [-72, 42] },
                properties: { name: 'Two' },
              },
            ],
          };
    return { ok: true, json: async () => result };
  };
  const result = await acquireApprovedArcgisLayer(feed, approvalFor(feed), fetchImpl);
  assert.equal(result.features.length, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].get('objectIds'), '1,2');
  assert.equal(calls[1].get('outFields'), '*');
  await assert.rejects(
    () =>
      acquireApprovedArcgisLayer(feed, approvalFor(feed), async (_url, options) => {
        const body = new URLSearchParams(options.body);
        return {
          ok: true,
          json: async () =>
            body.get('returnIdsOnly') === 'true'
              ? { objectIds: [1, 2] }
              : { type: 'FeatureCollection', features: [{ type: 'Feature', id: 1 }] },
        };
      }),
    /returned feature IDs do not match requested page/,
  );
});
