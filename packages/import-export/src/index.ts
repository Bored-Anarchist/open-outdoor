import { assertCoordinate, type Coordinate } from '@open-outdoor/shared';
import { geodesicDistanceM } from '@open-outdoor/tracking';

export const DEFAULT_IMPORT_LIMITS = {
  maximumBytes: 50 * 1024 * 1024,
  maximumPoints: 2_000_000,
} as const;

export interface ImportedRoute {
  readonly name: string | null;
  readonly coordinates: readonly Coordinate[];
  readonly timestamps: readonly (string | null)[];
  readonly sourceFormat: 'gpx' | 'geojson';
  readonly private: true;
}

export interface ExportPrivacyOptions {
  readonly endpointTrimM: number;
  readonly includeTimestamps: boolean;
  readonly includeName: boolean;
  readonly includePhotoMetadata: boolean;
}

export const privacyFirstExportOptions: ExportPrivacyOptions = {
  endpointTrimM: 200,
  includeTimestamps: false,
  includeName: false,
  includePhotoMetadata: false,
};

export class RouteFileError extends Error {
  constructor(
    readonly code:
      | 'FORMAT_UNSUPPORTED'
      | 'INPUT_LIMIT_EXCEEDED'
      | 'MALFORMED_INPUT'
      | 'NO_USABLE_GEOMETRY'
      | 'UNSAFE_XML',
    message: string,
  ) {
    super(message);
    this.name = 'RouteFileError';
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function enforceInput(value: string, maximumBytes: number): void {
  if (byteLength(value) > maximumBytes) {
    throw new RouteFileError(
      'INPUT_LIMIT_EXCEEDED',
      'route file exceeds the configured byte limit',
    );
  }
  if (value.includes('\0')) {
    throw new RouteFileError('MALFORMED_INPUT', 'route file contains a null byte');
  }
}

function xmlDecode(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

export function importGpx(
  input: string,
  limits: Partial<typeof DEFAULT_IMPORT_LIMITS> = {},
): ImportedRoute {
  const maximumBytes = limits.maximumBytes ?? DEFAULT_IMPORT_LIMITS.maximumBytes;
  const maximumPoints = limits.maximumPoints ?? DEFAULT_IMPORT_LIMITS.maximumPoints;
  enforceInput(input, maximumBytes);
  if (/<!DOCTYPE|<!ENTITY|<script\b|<\?xml-stylesheet/i.test(input)) {
    throw new RouteFileError('UNSAFE_XML', 'active or entity-bearing XML is not accepted');
  }
  if (!/<gpx(?:\s|>)/i.test(input)) {
    throw new RouteFileError('MALFORMED_INPUT', 'input is not a GPX document');
  }

  const coordinates: Coordinate[] = [];
  const timestamps: (string | null)[] = [];
  const pointPattern = /<(?:trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:trkpt|rtept)>/gi;
  let match: RegExpExecArray | null;
  while ((match = pointPattern.exec(input)) !== null) {
    if (coordinates.length >= maximumPoints) {
      throw new RouteFileError('INPUT_LIMIT_EXCEEDED', 'route exceeds the configured point limit');
    }
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const latitude = Number(/\blat=["']([^"']+)["']/i.exec(attributes)?.[1]);
    const longitude = Number(/\blon=["']([^"']+)["']/i.exec(attributes)?.[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new RouteFileError('MALFORMED_INPUT', 'GPX point has invalid coordinates');
    }
    const coordinate: Coordinate = [longitude, latitude];
    assertCoordinate(coordinate);
    coordinates.push(coordinate);
    const time = /<time>([^<]+)<\/time>/i.exec(body)?.[1]?.trim() ?? null;
    timestamps.push(time !== null && Number.isFinite(Date.parse(time)) ? time : null);
  }
  if (coordinates.length < 2) {
    throw new RouteFileError('NO_USABLE_GEOMETRY', 'GPX route needs at least two points');
  }
  const nameMatch = /<name>([^<]*)<\/name>/i.exec(input)?.[1];
  return {
    name: nameMatch === undefined ? null : xmlDecode(nameMatch.trim()),
    coordinates,
    timestamps,
    sourceFormat: 'gpx',
    private: true,
  };
}

function asCoordinate(value: unknown): Coordinate {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    throw new RouteFileError('MALFORMED_INPUT', 'GeoJSON coordinate is invalid');
  }
  return assertCoordinate([value[0], value[1]]);
}

export function importGeoJson(
  input: string,
  limits: Partial<typeof DEFAULT_IMPORT_LIMITS> = {},
): ImportedRoute {
  const maximumBytes = limits.maximumBytes ?? DEFAULT_IMPORT_LIMITS.maximumBytes;
  const maximumPoints = limits.maximumPoints ?? DEFAULT_IMPORT_LIMITS.maximumPoints;
  enforceInput(input, maximumBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new RouteFileError('MALFORMED_INPUT', 'GeoJSON is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new RouteFileError('MALFORMED_INPUT', 'GeoJSON root is invalid');
  }
  const record = parsed as Record<string, unknown>;
  const feature =
    record.type === 'FeatureCollection' && Array.isArray(record.features)
      ? (record.features[0] as Record<string, unknown> | undefined)
      : record.type === 'Feature'
        ? record
        : { type: 'Feature', geometry: record, properties: {} };
  const geometry = feature?.geometry as Record<string, unknown> | undefined;
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    throw new RouteFileError('FORMAT_UNSUPPORTED', 'only GeoJSON LineString routes are supported');
  }
  if (geometry.coordinates.length > maximumPoints) {
    throw new RouteFileError('INPUT_LIMIT_EXCEEDED', 'route exceeds the configured point limit');
  }
  const coordinates = geometry.coordinates.map(asCoordinate);
  if (coordinates.length < 2) {
    throw new RouteFileError('NO_USABLE_GEOMETRY', 'GeoJSON route needs at least two points');
  }
  const properties = (feature?.properties ?? {}) as Record<string, unknown>;
  return {
    name: typeof properties.name === 'string' ? properties.name : null,
    coordinates,
    timestamps: coordinates.map(() => null),
    sourceFormat: 'geojson',
    private: true,
  };
}

function trimFromStart(
  coordinates: readonly Coordinate[],
  distanceM: number,
): readonly Coordinate[] {
  let remaining = distanceM;
  let index = 0;
  while (index + 1 < coordinates.length && remaining > 0) {
    const current = coordinates[index];
    const next = coordinates[index + 1];
    if (current === undefined || next === undefined) break;
    remaining -= geodesicDistanceM(current, next);
    index += 1;
  }
  return coordinates.slice(index);
}

export function trimSensitiveEndpoints(
  coordinates: readonly Coordinate[],
  distanceM: number,
): readonly Coordinate[] {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    throw new RangeError('endpoint trim distance must be non-negative');
  }
  if (distanceM === 0) return [...coordinates];
  const startTrimmed = trimFromStart(coordinates, distanceM);
  const bothTrimmed = [...trimFromStart([...startTrimmed].reverse(), distanceM)].reverse();
  if (bothTrimmed.length < 2) {
    throw new RouteFileError(
      'NO_USABLE_GEOMETRY',
      'privacy trim would remove the entire usable route',
    );
  }
  return bothTrimmed;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function exportGpx(
  route: ImportedRoute,
  options: ExportPrivacyOptions = privacyFirstExportOptions,
): string {
  const coordinates = trimSensitiveEndpoints(route.coordinates, options.endpointTrimM);
  const offset = route.coordinates.indexOf(coordinates[0] as Coordinate);
  const points = coordinates
    .map((coordinate, index) => {
      const timestamp = route.timestamps[offset + index];
      const time =
        options.includeTimestamps && timestamp !== null && timestamp !== undefined
          ? `<time>${escapeXml(timestamp)}</time>`
          : '';
      return `<trkpt lat="${coordinate[1]}" lon="${coordinate[0]}">${time}</trkpt>`;
    })
    .join('');
  const name =
    options.includeName && route.name !== null ? `<name>${escapeXml(route.name)}</name>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Open Outdoor"><trk>${name}<trkseg>${points}</trkseg></trk></gpx>`;
}

export function exportGeoJson(
  route: ImportedRoute,
  options: ExportPrivacyOptions = privacyFirstExportOptions,
): string {
  const coordinates = trimSensitiveEndpoints(route.coordinates, options.endpointTrimM);
  return JSON.stringify({
    type: 'Feature',
    properties: options.includeName && route.name !== null ? { name: route.name } : {},
    geometry: { type: 'LineString', coordinates },
  });
}

export function photoExportPolicy(options: ExportPrivacyOptions = privacyFirstExportOptions): {
  readonly includeExif: boolean;
  readonly warning: string | null;
} {
  return options.includePhotoMetadata
    ? {
        includeExif: true,
        warning: 'Photo metadata can reveal time, device, and precise location.',
      }
    : { includeExif: false, warning: null };
}
