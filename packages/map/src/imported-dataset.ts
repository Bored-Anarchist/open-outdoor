import {
  normalizeOutdoorVisitorDetails,
  outdoorSourceUrl,
} from '@open-outdoor/shared/outdoor-details';
import {
  featureBounds,
  type OutdoorCollection,
  type OutdoorFeature,
  type OutdoorFeatureIndex,
} from './outdoor-map';

export const mapDatasetLimits = {
  maximumBytes: 20 * 1024 * 1024,
  maximumFeatures: 20_000,
  maximumPositions: 200_000,
  maximumDatasets: 5,
  maximumStoreBytes: 50 * 1024 * 1024,
} as const;

export interface ImportedMapDataset {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly collection: OutdoorCollection;
  readonly index: OutdoorFeatureIndex;
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a GeoJSON object.');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, fallback = '', maximum = 500): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, maximum)
    : fallback;
}

/** Validates structure as well as EPSG:4326 coordinates before crossing the native map bridge. */
export function parseMapDataset(input: string, id: string, name: string): ImportedMapDataset {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid dataset identifier.');
  if (new TextEncoder().encode(input).length > mapDatasetLimits.maximumBytes) {
    throw new Error('Dataset exceeds the 20 MiB import limit.');
  }
  let document: Record<string, unknown>;
  try {
    document = object(JSON.parse(input.replace(/^\uFEFF/, '')));
  } catch {
    throw new Error('Choose a valid GeoJSON FeatureCollection (.geojson or .json).');
  }
  if (document.crs !== undefined)
    throw new Error('Export as WGS84 longitude/latitude GeoJSON without a custom CRS.');
  const entries =
    document.type === 'FeatureCollection'
      ? document.features
      : document.type === 'Feature'
        ? [document]
        : null;
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error('Dataset must contain GeoJSON features.');
  if (entries.length > mapDatasetLimits.maximumFeatures)
    throw new Error('Dataset exceeds 20,000 features.');
  let positions = 0;
  const position = (value: unknown): number[] => {
    if (
      !Array.isArray(value) ||
      value.length < 2 ||
      value.length > 3 ||
      !value.every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      Math.abs(value[0] as number) > 180 ||
      Math.abs(value[1] as number) > 90
    )
      throw new Error(
        'Coordinates must be WGS84 [longitude, latitude], optionally with elevation.',
      );
    if (++positions > mapDatasetLimits.maximumPositions)
      throw new Error('Dataset exceeds 200,000 coordinates. Simplify it before importing.');
    return [value[0] as number, value[1] as number];
  };
  const array = (value: unknown, minimum = 1): unknown[] => {
    if (!Array.isArray(value) || value.length < minimum)
      throw new Error('Dataset contains an empty or malformed geometry.');
    return value;
  };
  const line = (value: unknown): number[][] => array(value, 2).map(position);
  const ring = (value: unknown): number[][] => {
    const points = array(value, 4).map(position);
    if (points[0]![0] !== points.at(-1)![0] || points[0]![1] !== points.at(-1)![1])
      throw new Error('Polygon rings must be closed.');
    return points;
  };
  const polygon = (value: unknown): number[][][] => array(value).map(ring);
  const features: OutdoorFeature[] = [];
  const ids = new Set<string>();
  const normalizedIds = new Set<string>();
  for (const [ordinal, entry] of entries.entries()) {
    const feature = object(entry);
    if (feature.type !== 'Feature') throw new Error('Dataset contains an invalid GeoJSON feature.');
    const geometry = object(feature.geometry);
    const properties =
      feature.properties === null || feature.properties === undefined
        ? {}
        : object(feature.properties);
    const sourceId =
      typeof feature.id === 'string' || typeof feature.id === 'number'
        ? String(feature.id)
        : text(properties.id, String(ordinal));
    if (ids.has(sourceId)) throw new Error('Dataset contains duplicate feature identifiers.');
    ids.add(sourceId);
    let geometries: OutdoorFeature['geometry'][];
    switch (geometry.type) {
      case 'Point':
        geometries = [{ type: 'Point', coordinates: position(geometry.coordinates) }];
        break;
      case 'MultiPoint':
        geometries = array(geometry.coordinates).map((value) => ({
          type: 'Point',
          coordinates: position(value),
        }));
        break;
      case 'LineString':
        geometries = [{ type: 'LineString', coordinates: line(geometry.coordinates) }];
        break;
      case 'MultiLineString':
        geometries = [
          { type: 'MultiLineString', coordinates: array(geometry.coordinates).map(line) },
        ];
        break;
      case 'Polygon':
        geometries = [{ type: 'Polygon', coordinates: polygon(geometry.coordinates) }];
        break;
      case 'MultiPolygon':
        geometries = [
          { type: 'MultiPolygon', coordinates: array(geometry.coordinates).map(polygon) },
        ];
        break;
      default:
        throw new Error(
          'Supported geometries: points, lines and polygons, including Multi variants.',
        );
    }
    for (const [part, normalizedGeometry] of geometries.entries()) {
      const featureId =
        sourceId.startsWith(`import:${id}:`) && geometries.length === 1
          ? sourceId
          : `import:${id}:${encodeURIComponent(sourceId)}:${part}`;
      if (normalizedIds.has(featureId))
        throw new Error('Dataset contains colliding feature identifiers.');
      normalizedIds.add(featureId);
      const kind =
        normalizedGeometry.type === 'Point'
          ? 'poi'
          : normalizedGeometry.type.includes('Polygon')
            ? 'land'
            : properties.kind === 'road'
              ? 'road'
              : 'trail';
      const checkIns = Array.isArray(properties.communityCheckIns)
        ? properties.communityCheckIns.slice(0, 100).flatMap((value) => {
            if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
            const item = value as Record<string, unknown>;
            return typeof item.occurredAt === 'string' &&
              Number.isFinite(Date.parse(item.occurredAt))
              ? [{ occurredAt: item.occurredAt, comment: text(item.comment, '', 2_000) }]
              : [];
          })
        : [];
      features.push({
        type: 'Feature',
        id: featureId,
        geometry: normalizedGeometry,
        properties: {
          id: featureId,
          kind,
          name: text(properties.name, text(properties.title, `Feature ${ordinal + 1}`)),
          sourceId:
            properties.sourceId === 'private-ioverlander'
              ? 'private-ioverlander'
              : 'imported-geojson',
          unit: text(properties.unit, text(name)),
          category: text(properties.category, 'other'),
          publicUse: text(
            properties.publicUse,
            'Imported reference; verify current access and conditions.',
          ),
          sourceUpdated: text(properties.sourceUpdated, 'Not supplied'),
          origin: 'private-catalog',
          ...normalizeOutdoorVisitorDetails(properties),
          ...(outdoorSourceUrl(properties.sourceUrl)
            ? { sourceUrl: outdoorSourceUrl(properties.sourceUrl)! }
            : {}),
          communityDescription: text(properties.communityDescription, '', 4_000),
          communityCheckIns: checkIns,
          communityCheckInCount:
            typeof properties.communityCheckInCount === 'number' &&
            Number.isSafeInteger(properties.communityCheckInCount) &&
            properties.communityCheckInCount >= checkIns.length
              ? properties.communityCheckInCount
              : checkIns.length,
        },
      });
      if (features.length > mapDatasetLimits.maximumFeatures)
        throw new Error('Dataset exceeds 20,000 features after expanding MultiPoint geometry.');
    }
  }
  const collection: OutdoorCollection = { type: 'FeatureCollection', features };
  if (new TextEncoder().encode(JSON.stringify(collection)).length > mapDatasetLimits.maximumBytes)
    throw new Error('Normalized dataset exceeds 20 MiB. Split it into smaller files.');
  return {
    id,
    name: text(name, 'Imported dataset', 200),
    visible: true,
    collection,
    index: {
      schemaVersion: 1,
      features: features.map((feature) => ({
        id: feature.id,
        properties: feature.properties,
        bounds: featureBounds(feature),
      })),
    },
  };
}

export function serializeMapDatasets(datasets: readonly ImportedMapDataset[]): string {
  if (datasets.length > mapDatasetLimits.maximumDatasets)
    throw new Error(
      'You can keep up to five imported datasets. Remove one before importing another.',
    );
  const payload = JSON.stringify({
    schemaVersion: 1,
    datasets: datasets.map(({ id, name, visible, collection }) => ({
      id,
      name,
      visible,
      collection,
    })),
  });
  if (new TextEncoder().encode(payload).length > mapDatasetLimits.maximumStoreBytes)
    throw new Error('Imported datasets exceed the combined 50 MiB storage limit.');
  return payload;
}

export function restoreMapDatasets(payload: string | null): ImportedMapDataset[] {
  if (payload === null) return [];
  if (new TextEncoder().encode(payload).length > mapDatasetLimits.maximumStoreBytes)
    throw new Error('Saved datasets exceed the storage limit.');
  const store = object(JSON.parse(payload));
  if (
    store.schemaVersion !== 1 ||
    !Array.isArray(store.datasets) ||
    store.datasets.length > mapDatasetLimits.maximumDatasets
  )
    throw new Error('Unsupported imported dataset storage.');
  const ids = new Set<string>();
  return store.datasets.map((value) => {
    const dataset = object(value);
    if (
      typeof dataset.id !== 'string' ||
      typeof dataset.name !== 'string' ||
      typeof dataset.visible !== 'boolean' ||
      ids.has(dataset.id)
    )
      throw new Error('Invalid saved dataset.');
    ids.add(dataset.id);
    const collection = object(dataset.collection);
    if (!Array.isArray(collection.features)) throw new Error('Invalid saved dataset features.');
    collection.features.forEach((value) => {
      const feature = object(value);
      if (typeof feature.id !== 'string' || !feature.id.startsWith(`import:${dataset.id}:`))
        throw new Error('Invalid saved feature identifier.');
    });
    return {
      ...parseMapDataset(JSON.stringify(collection), dataset.id, dataset.name),
      visible: dataset.visible,
    };
  });
}
