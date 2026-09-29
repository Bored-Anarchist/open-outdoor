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
  assert.equal(feeds.filter((feed) => feed.sourceType === 'arcgis-layer').length, 99);
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

test('the 107 pinned roles allow only explicitly approved private validation', async () => {
  const feeds = await loadStateAgencyFeedCatalog();
  const provisional = feeds.filter((feed) => feed.provisionalPrivateValidation);
  assert.equal(provisional.length, 107);
  assert.ok(provisional.every((feed) => feed.origin === 'registry'));
  const feed = provisional.find((item) => item.sourceType === 'arcgis-layer');
  assert.ok(feed);
  const approval = {
    ...approvalFor(feed),
    publisherGrant: false,
    provisionalPrivateValidation: true,
    evidenceUrl: feed.url,
  };
  assert.doesNotThrow(() => assertPrivateAcquisitionApproved(feed, approval));
  assert.throws(() =>
    assertPrivateAcquisitionApproved(feed, { ...approval, publicDistribution: true }),
  );
  assert.throws(() =>
    assertPrivateAcquisitionApproved(feed, { ...approval, sourceUrl: 'https://example.org/other' }),
  );
  assert.throws(() =>
    assertPrivateAcquisitionApproved(feed, { ...approval, provisionalPrivateValidation: false }),
  );
  const outside = feeds.find(
    (item) =>
      item.rightsStatus === 'Unconfirmed' &&
      !item.provisionalPrivateValidation &&
      item.sourceType === 'arcgis-layer',
  );
  assert.ok(outside);
  assert.throws(() =>
    assertPrivateAcquisitionApproved(outside, {
      ...approvalFor(outside),
      publisherGrant: false,
      provisionalPrivateValidation: true,
      evidenceUrl: outside.url,
    }),
  );
});

test('NJDEP local validation stays private while Michigan copying remains gated', async () => {
  const feeds = await loadStateAgencyFeedCatalog();
  const permissionRoles = feeds.filter((feed) => feed.rightsStatus === 'Permission required');
  assert.equal(permissionRoles.length, 5);
  const nj = permissionRoles.find(
    (feed) => feed.state === 'NJ' && feed.sourceType === 'arcgis-layer',
  );
  const mi = permissionRoles.find((feed) => feed.state === 'MI');
  assert.ok(nj?.permissionRequiredPrivateValidation);
  assert.equal(mi?.permissionRequiredPrivateValidation, false);
  const approval = {
    ...approvalFor(nj),
    publisherGrant: false,
    permissionRequiredPrivateValidation: true,
    evidenceUrl: nj.url,
  };
  assert.doesNotThrow(() => assertPrivateAcquisitionApproved(nj, approval));
  assert.throws(() =>
    assertPrivateAcquisitionApproved(nj, { ...approval, publicDistribution: true }),
  );
  assert.throws(() =>
    assertPrivateAcquisitionApproved(
      { ...mi, sourceType: 'arcgis-layer' },
      { ...approval, sourceId: mi.id, sourceUrl: mi.url },
    ),
  );
});

test('restricted OPRHP polygon reference is exact, private and never converted', () => {
  const source = {
    id: 'nys-oprhp-parks',
    sourceType: 'arcgis-layer',
    rightsStatus: 'Restricted',
    mode: 'reference-only',
    url: 'https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NYS_Park_Polygons/FeatureServer/0',
  };
  const approval = {
    ...approvalFor(source),
    publisherGrant: false,
    referenceOnlyPrivateValidation: true,
  };
  assert.doesNotThrow(() => assertPrivateAcquisitionApproved(source, approval));
  for (const patch of [
    { mode: 'durable' },
    { id: 'other' },
    { url: source.url.replace('/0', '/1') },
  ])
    assert.throws(
      () =>
        assertPrivateAcquisitionApproved(
          { ...source, ...patch },
          { ...approval, sourceId: patch.id ?? source.id, sourceUrl: patch.url ?? source.url },
        ),
      /publisher grant required/,
    );
  assert.throws(
    () => assertPrivateAcquisitionApproved(source, { ...approval, publicDistribution: true }),
    /public output prohibited/,
  );
});

test('approved ArcGIS layer acquisition requires complete ID-based GeoJSON pages', async () => {
  const feeds = await loadStateAgencyFeedCatalog();
  const feed = feeds.find(
    (item) => item.sourceType === 'arcgis-layer' && item.rightsStatus === 'Supported',
  );
  assert.ok(feed);
  const calls = [];
  const fetchImpl = async (_url, options) => {
    if (!options.body) return { ok: true, json: async () => ({ maxRecordCount: 2000 }) };
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
  calls.length = 0;
  const filtered = {
    ...feed,
    where: "PlanName='CAMDEN STATE FOREST'",
    fields: ['OBJECTID', 'PlanName'],
  };
  await acquireApprovedArcgisLayer(filtered, approvalFor(filtered), fetchImpl);
  assert.equal(calls[0].get('where'), filtered.where);
  assert.equal(calls[1].get('outFields'), 'OBJECTID,PlanName');
  await assert.rejects(
    () =>
      acquireApprovedArcgisLayer(feed, approvalFor(feed), async (_url, options) => {
        if (!options.body) return { ok: true, json: async () => ({ maxRecordCount: 1000 }) };
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
