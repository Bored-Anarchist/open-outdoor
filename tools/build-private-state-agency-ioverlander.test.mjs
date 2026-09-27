import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ioverlanderFeature,
  pointInGeometry,
  privateAgencySelection,
  readIoverlander,
} from './build-private-state-agency-ioverlander.mjs';

test('multiple iOverlander packages retain state places once and reject corrupt tiles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-state-packages-'));
  const boundary = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  };
  const place = (guid, longitude, updated) => ({
    guid,
    name: guid,
    category: 'campsite',
    longitude,
    latitude: 2,
    date_verified: updated,
    contributor_id: 'discard-me',
  });
  try {
    for (const [directory, places] of [
      ['tiles_1', [place('shared', 2, '2026-01-01'), place('first', 3, '2026-01-01')]],
      [
        'tiles_2',
        [
          place('shared', 2, '2026-02-01'),
          place('second', 4, '2026-02-01'),
          place('outside', 12, '2026-02-01'),
        ],
      ],
    ]) {
      const path = join(root, 'Example', directory);
      await mkdir(path, { recursive: true });
      const bytes = Buffer.from(JSON.stringify({ places }));
      await writeFile(join(path, 'n1_w1.json'), bytes);
      await writeFile(
        join(path, 'manifest.json'),
        JSON.stringify({
          n1_w1: { size: bytes.length, md5: createHash('md5').update(bytes).digest('hex') },
        }),
      );
    }
    const result = await readIoverlander('Example', boundary, root);
    assert.equal(result.packages.length, 2);
    assert.equal(result.tiles, 2);
    assert.deepEqual(
      result.features.map((feature) => feature.id),
      ['private:first', 'private:second', 'private:shared'],
    );
    assert.equal(result.features.at(-1).properties.sourceUpdated, '2026-02-01');
    assert.equal(JSON.stringify(result).includes('discard-me'), false);
    await writeFile(join(root, 'Example', 'tiles_2', 'n1_w1.json'), '{}');
    await assert.rejects(readIoverlander('Example', boundary, root), /checksum mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('state boundary filtering excludes holes and neighboring tiles', () => {
  const boundary = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ],
  };
  assert.equal(pointInGeometry([2, 2], boundary), true);
  assert.equal(pointInGeometry([5, 5], boundary), false);
  assert.equal(pointInGeometry([12, 5], boundary), false);
});

test('private iOverlander conversion omits contributor identities', () => {
  const feature = ioverlanderFeature({
    guid: 'example-guid',
    id: 42,
    name: 'Camp',
    category: 'campsite',
    longitude: -86,
    latitude: 33,
    deleted: false,
    contributor_id: 'private-person',
    check_ins: [{ comment: 'Open', visited_at: '2026-09-01', contributor_id: 'another-person' }],
  });
  assert.ok(feature);
  assert.equal(feature.geometry.type, 'Point');
  assert.equal(feature.properties.communityCheckIns[0].comment, 'Open');
  assert.equal(JSON.stringify(feature).includes('private-person'), false);
  assert.equal(JSON.stringify(feature).includes('another-person'), false);
});

test('New Jersey private overlay keeps only managed public access visitor parcels', () => {
  const receipt = { state: 'NJ', sourceId: 'registry-nj-forestry-cecb5c0cc2' };
  const base = {
    MANAGED_BY: 'Division of Parks and Forestry',
    ACCESS_TYPE: 'Public Access',
    USE_LABEL: 'State Forest',
  };
  const features = [
    base,
    { ...base, ACCESS_TYPE: 'No Access' },
    { ...base, MANAGED_BY: 'Private' },
    { ...base, USE_LABEL: 'Conservation Easement' },
  ].map((properties) => ({ properties }));
  assert.deepEqual(privateAgencySelection(receipt, features).selected, [features[0]]);
});

test('New Jersey trail, open space, and POI selections exclude closed and nonstate records', () => {
  const cases = [
    {
      sourceId: 'child-nj-forestry-supplement-0-d5700aeef8',
      allowed: { TRL_ACCESS: 'Yes', OWNERSHIP: 'State' },
      rejected: { TRL_ACCESS: 'No', OWNERSHIP: 'State' },
    },
    {
      sourceId: 'child-nj-forestry-supplement-25-8100840e6b',
      allowed: {
        'Land_owner_openspace_pt.PUBLIC_ACCESS': 'Yes',
        'Land_owner_openspace_pt.MANAGED_BY': 'Division of Parks and Forestry',
      },
      rejected: {
        'Land_owner_openspace_pt.PUBLIC_ACCESS': 'No',
        'Land_owner_openspace_pt.MANAGED_BY': 'Division of Parks and Forestry',
      },
    },
    {
      sourceId: 'child-nj-forestry-supplement-31-3e3440a95d',
      allowed: {
        OWNERSHIP: 'State',
        LAND_MANAGER: 'NJ State Parks, Forests and Historic Sites',
        OPNS_STAT: 'na',
      },
      rejected: {
        OWNERSHIP: 'State',
        LAND_MANAGER: 'NJ State Parks, Forests and Historic Sites',
        OPNS_STAT: 'Closed to Public',
      },
    },
  ];
  for (const { sourceId, allowed, rejected } of cases) {
    const features = [allowed, rejected].map((properties) => ({ properties }));
    assert.deepEqual(privateAgencySelection({ state: 'NJ', sourceId }, features).selected, [
      features[0],
    ]);
  }
});
