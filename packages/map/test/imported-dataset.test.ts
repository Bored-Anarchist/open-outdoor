import { describe, expect, it } from 'vitest';
import { hikeRouteDetails } from '@open-outdoor/shared/hike-route';
import {
  parseMapDataset,
  restoreMapDatasets,
  serializeMapDatasets,
  mapDatasetLimits,
} from '../src/imported-dataset';
import { createOutdoorPlaceCollection, searchOutdoorFeatureIndex } from '../src/outdoor-map';
const id = 'a'.repeat(64);
const collection = (features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features });
const feature = (
  geometry: unknown,
  properties: Record<string, unknown> = {},
  featureId?: string,
) => ({ type: 'Feature', ...(featureId ? { id: featureId } : {}), properties, geometry });
const point = { type: 'Point', coordinates: [-74, 42] };

describe('on-device GeoJSON map datasets', () => {
  it('imports points with private provenance, searchable names, categories and safe descriptions', () => {
    const dataset = parseMapDataset(
      collection([
        feature(
          point,
          {
            name: 'Synthetic campsite',
            category: 'wild_campsite',
            origin: 'public-catalog',
            sourceId: 'private-ioverlander',
            communityDescription: 'Synthetic community note',
            contributor: 'must be discarded',
            communityCheckIns: [
              {
                occurredAt: '2026-09-01T10:00:00Z',
                comment: 'Synthetic check-in',
                username: 'discarded',
              },
            ],
          },
          'place-1',
        ),
      ]),
      id,
      'sample.geojson',
    );
    expect(dataset.index.features[0]?.bounds).toEqual([-74, 42, -74, 42]);
    expect(searchOutdoorFeatureIndex(dataset.index, 'campsite')).toHaveLength(1);
    expect(createOutdoorPlaceCollection(dataset.index, 'wild_campsite').features).toHaveLength(1);
    expect(dataset.collection.features[0]?.properties.origin).toBe('private-catalog');
    expect(dataset.collection.features[0]?.properties.communityCheckIns).toEqual([
      { occurredAt: '2026-09-01T10:00:00Z', comment: 'Synthetic check-in' },
    ]);
    expect(JSON.stringify(dataset)).not.toContain('discarded');
    expect(createOutdoorPlaceCollection(dataset.index).features[0]?.properties).not.toHaveProperty(
      'communityDescription',
    );
  });

  it('restores visitor information and source links without sending long details to the renderer', () => {
    const dataset = parseMapDataset(
      collection([
        feature(
          point,
          {
            name: 'Synthetic visitor site',
            description: '<p>Quiet campground.</p>',
            amenities: ['Water'],
            openingHours: ['Summer only'],
            fees: ['USD 10 per night'],
            directionsInfo: 'Take the signed access road.',
            sourceUrl: 'https://example.com/site',
            username: 'discarded',
          },
          'visitor-1',
        ),
      ]),
      id,
      'visitors.geojson',
    );
    expect(restoreMapDatasets(serializeMapDatasets([dataset]))).toEqual([dataset]);
    expect(dataset.index.features[0]?.properties).toMatchObject({
      description: 'Quiet campground.',
      amenities: ['Water'],
      openingHours: ['Summer only'],
      fees: ['USD 10 per night'],
      directionsInfo: 'Take the signed access road.',
      sourceUrl: 'https://example.com/site',
    });
    const rendered = createOutdoorPlaceCollection(dataset.index).features[0]?.properties;
    for (const field of ['description', 'amenities', 'openingHours', 'fees', 'directionsInfo'])
      expect(rendered).not.toHaveProperty(field);
    expect(JSON.stringify(dataset)).not.toContain('discarded');
    const invalidLink = parseMapDataset(
      collection([feature(point, { sourceUrl: 'javascript:alert(1)' })]),
      id,
      'test',
    );
    expect(invalidLink.index.features[0]?.properties).not.toHaveProperty('sourceUrl');
  });

  it('preserves feature IDs, visibility and journals after serializing and restarting, including MultiPoints', () => {
    const dataset = parseMapDataset(
      collection([
        feature(
          {
            type: 'MultiPoint',
            coordinates: [
              [-74, 42],
              [-73, 43],
            ],
          },
          { name: 'Two places' },
          'place:1',
        ),
        feature(
          {
            type: 'LineString',
            coordinates: [
              [-74, 42],
              [-73, 43],
            ],
          },
          { name: 'Trail' },
        ),
      ]),
      id,
      'test.geojson',
    );
    const hidden = { ...dataset, visible: false };
    expect(restoreMapDatasets(serializeMapDatasets([hidden]))).toEqual([hidden]);
    expect(
      restoreMapDatasets(serializeMapDatasets(restoreMapDatasets(serializeMapDatasets([hidden])))),
    ).toEqual([hidden]);
  });

  it('renders areas and lines with geometry-derived kinds rather than trusting imported kind fields', () => {
    const dataset = parseMapDataset(
      collection([
        feature(
          {
            type: 'Polygon',
            coordinates: [
              [
                [-74, 42],
                [-73, 42],
                [-73, 43],
                [-74, 42],
              ],
            ],
          },
          { kind: 'poi' },
        ),
        feature(
          {
            type: 'MultiLineString',
            coordinates: [
              [
                [-74, 42],
                [-73, 43],
              ],
            ],
          },
          { kind: 'road' },
        ),
        feature({
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-74, 42],
                [-73, 42],
                [-73, 43],
                [-74, 42],
              ],
            ],
          ],
        }),
      ]),
      id,
      'areas.json',
    );
    expect(dataset.collection.features.map((f) => f.properties.kind)).toEqual([
      'land',
      'road',
      'land',
    ]);
    expect(dataset.index.features[0]?.bounds).toEqual([-74, 42, -73, 43]);
  });

  it.each([
    { type: 'Point', coordinates: [200, 42] },
    { type: 'Point', coordinates: [42, 'bad'] },
    { type: 'Point', coordinates: [] },
    { type: 'LineString', coordinates: [[-74, 42]] },
    {
      type: 'Polygon',
      coordinates: [
        [
          [-74, 42],
          [-73, 42],
          [-73, 43],
          [-74, 43],
        ],
      ],
    },
    { type: 'MultiPolygon', coordinates: [] },
    { type: 'GeometryCollection', geometries: [] },
    null,
  ])(
    'rejects malformed or unsupported geometry without accepting a partial dataset: %j',
    (geometry) => {
      expect(() =>
        parseMapDataset(collection([feature(point), feature(geometry)]), id, 'bad.json'),
      ).toThrow();
    },
  );

  it('rejects duplicate identities and CRS overrides and accepts UTF-8 BOMs', () => {
    expect(() =>
      parseMapDataset(
        collection([feature(point, {}, 'same'), feature(point, {}, 'same')]),
        id,
        'bad.json',
      ),
    ).toThrow(/duplicate/);
    expect(() =>
      parseMapDataset(
        JSON.stringify({ type: 'FeatureCollection', features: [feature(point)], crs: {} }),
        id,
        'bad.json',
      ),
    ).toThrow(/WGS84/);
    expect(
      parseMapDataset('\uFEFF' + collection([feature(point)]), id, 'bom.geojson').collection
        .features,
    ).toHaveLength(1);
    expect(() => parseMapDataset('{', id, 'bad.json')).toThrow(/valid GeoJSON/);
  });

  it('enforces byte and feature limits and rejects corrupt or newer stores', () => {
    expect(() =>
      parseMapDataset(' '.repeat(mapDatasetLimits.maximumBytes + 1), id, 'large.json'),
    ).toThrow(/20 MiB/);
    expect(() =>
      parseMapDataset(
        collection(Array(mapDatasetLimits.maximumFeatures + 1).fill(feature(point))),
        id,
        'large.json',
      ),
    ).toThrow(/20,000/);
    const dataset = parseMapDataset(collection([feature(point)]), id, 'test.json');
    expect(() => serializeMapDatasets(Array(6).fill(dataset))).toThrow(/five/);
    expect(() => restoreMapDatasets(serializeMapDatasets([dataset, dataset]))).toThrow(
      /Invalid saved/,
    );
    expect(() => restoreMapDatasets('{"schemaVersion":2,"datasets":[]}')).toThrow(/Unsupported/);
    expect(() => restoreMapDatasets('{"schemaVersion":1,"datasets":[{}]}')).toThrow();
    expect(restoreMapDatasets(null)).toEqual([]);
  });
});

describe('imported hike elevations', () => {
  it('retains coordinate elevations through save and restore for offline planning', () => {
    const coordinates = [
      [-74, 42, 100],
      [-73.999, 42, 150],
      [-73.998, 42, 120],
    ];
    const imported = parseMapDataset(
      collection([feature({ type: 'LineString', coordinates }, { name: 'Synthetic hike' })]),
      id,
      'hike.geojson',
    );
    const restored = restoreMapDatasets(serializeMapDatasets([imported]))[0]!;
    expect(restored.collection.features[0]!.geometry.coordinates).toEqual(coordinates);
    const geometry = restored.collection.features[0]!.geometry;
    if (geometry.type !== 'LineString') throw Error('Expected a line');
    expect(hikeRouteDetails(geometry).elevationSource).toBe('dataset');
  });
});
