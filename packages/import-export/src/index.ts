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

interface TrimmedRoute {
  readonly coordinates: readonly Coordinate[];
  readonly timestamps: readonly (string | null)[];
}

function interpolateCoordinate(left: Coordinate, right: Coordinate, fraction: number): Coordinate {
  return [left[0] + (right[0] - left[0]) * fraction, left[1] + (right[1] - left[1]) * fraction];
}

function interpolateTimestamp(
  left: string | null,
  right: string | null,
  fraction: number,
): string | null {
  if (left === null || right === null) return null;
  const start = Date.parse(left);
  const end = Date.parse(right);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return new Date(start + (end - start) * fraction).toISOString();
}

function trimRouteFromStart(route: TrimmedRoute, distanceM: number): TrimmedRoute {
  let remaining = distanceM;
  for (let index = 0; index + 1 < route.coordinates.length; index += 1) {
    const current = route.coordinates[index];
    const next = route.coordinates[index + 1];
    if (current === undefined || next === undefined) break;
    const segmentM = geodesicDistanceM(current, next);
    if (remaining < segmentM) {
      const fraction = segmentM === 0 ? 1 : remaining / segmentM;
      return {
        coordinates: [
          interpolateCoordinate(current, next, fraction),
          ...route.coordinates.slice(index + 1),
        ],
        timestamps: [
          interpolateTimestamp(
            route.timestamps[index] ?? null,
            route.timestamps[index + 1] ?? null,
            fraction,
          ),
          ...route.timestamps.slice(index + 1),
        ],
      };
    }
    remaining -= segmentM;
  }
  return { coordinates: [], timestamps: [] };
}

function trimRoute(route: ImportedRoute, distanceM: number): TrimmedRoute {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    throw new RangeError('endpoint trim distance must be non-negative');
  }
  if (distanceM === 0) {
    return { coordinates: [...route.coordinates], timestamps: [...route.timestamps] };
  }
  const start = trimRouteFromStart(route, distanceM);
  const reversed = trimRouteFromStart(
    { coordinates: [...start.coordinates].reverse(), timestamps: [...start.timestamps].reverse() },
    distanceM,
  );
  const result = {
    coordinates: [...reversed.coordinates].reverse(),
    timestamps: [...reversed.timestamps].reverse(),
  };
  if (result.coordinates.length < 2) {
    throw new RouteFileError(
      'NO_USABLE_GEOMETRY',
      'privacy trim would remove the entire usable route',
    );
  }
  return result;
}

export function trimSensitiveEndpoints(
  coordinates: readonly Coordinate[],
  distanceM: number,
): readonly Coordinate[] {
  return trimRoute(
    {
      name: null,
      coordinates,
      timestamps: coordinates.map(() => null),
      sourceFormat: 'geojson',
      private: true,
    },
    distanceM,
  ).coordinates;
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
  const trimmed = trimRoute(route, options.endpointTrimM);
  const points = trimmed.coordinates
    .map((coordinate, index) => {
      const timestamp = trimmed.timestamps[index];
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
  const coordinates = trimRoute(route, options.endpointTrimM).coordinates;
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
export type SupportedPhotoMime = 'image/jpeg' | 'image/png';

export interface SanitizedPhoto {
  readonly bytes: Uint8Array;
  readonly removedMetadata: true;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      (bytes[offset + 1] ?? 0) * 0x10000 +
      (bytes[offset + 2] ?? 0) * 0x100 +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new RouteFileError('MALFORMED_INPUT', 'JPEG signature is invalid');
  }
  const output: number[] = [0xff, 0xd8];
  let cursor = 2;
  while (cursor < bytes.length) {
    if (bytes[cursor] !== 0xff) {
      throw new RouteFileError('MALFORMED_INPUT', 'JPEG marker is invalid');
    }
    const marker = bytes[cursor + 1];
    if (marker === undefined) throw new RouteFileError('MALFORMED_INPUT', 'JPEG is truncated');
    if (marker === 0xda) {
      output.push(...bytes.slice(cursor));
      return new Uint8Array(output);
    }
    if (marker === 0xd9) {
      output.push(0xff, marker);
      return new Uint8Array(output);
    }
    const length = ((bytes[cursor + 2] ?? 0) << 8) | (bytes[cursor + 3] ?? 0);
    if (length < 2 || cursor + 2 + length > bytes.length) {
      throw new RouteFileError('MALFORMED_INPUT', 'JPEG segment is truncated');
    }
    const end = cursor + 2 + length;
    const metadata = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!metadata) output.push(...bytes.slice(cursor, end));
    cursor = end;
  }
  throw new RouteFileError('MALFORMED_INPUT', 'JPEG has no image data');
}

function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) {
    throw new RouteFileError('MALFORMED_INPUT', 'PNG signature is invalid');
  }
  const output: number[] = [...signature];
  const metadataChunks = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  let cursor = 8;
  let foundEnd = false;
  while (cursor + 12 <= bytes.length) {
    const length = readUint32(bytes, cursor);
    const end = cursor + 12 + length;
    if (end > bytes.length) throw new RouteFileError('MALFORMED_INPUT', 'PNG chunk is truncated');
    const type = String.fromCharCode(...bytes.slice(cursor + 4, cursor + 8));
    if (!metadataChunks.has(type)) output.push(...bytes.slice(cursor, end));
    cursor = end;
    if (type === 'IEND') {
      foundEnd = true;
      break;
    }
  }
  if (!foundEnd) throw new RouteFileError('MALFORMED_INPUT', 'PNG has no IEND chunk');
  return new Uint8Array(output);
}

export function removePhotoMetadata(
  bytes: Uint8Array,
  mime: SupportedPhotoMime,
  maximumBytes = 100 * 1024 * 1024,
): SanitizedPhoto {
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    throw new RouteFileError('INPUT_LIMIT_EXCEEDED', 'photo exceeds the configured byte limit');
  }
  return {
    bytes: mime === 'image/jpeg' ? stripJpegMetadata(bytes) : stripPngMetadata(bytes),
    removedMetadata: true,
  };
}
