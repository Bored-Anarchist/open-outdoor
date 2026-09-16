import { describe, expect, it } from 'vitest';
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
