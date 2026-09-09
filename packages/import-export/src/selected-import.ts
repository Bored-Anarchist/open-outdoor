import { assertCoordinate, type Coordinate } from '@open-outdoor/shared';
import { importGeoJson, RouteFileError, type ImportedRoute } from './index.js';
import { importFit } from './fit.js';

export interface ImportLimits {
  readonly maximumBytes: number;
  readonly maximumPoints: number;
}
export const importLimits: ImportLimits = {
  maximumBytes: 50 * 1024 * 1024,
  maximumPoints: 2_000_000,
};
export type ImportFormat = 'gpx' | 'geojson' | 'kml' | 'csv' | 'fit';
export type ExportProvider = 'generic' | 'alltrails' | 'ioverlander' | 'garmin' | 'strava';
export interface ImportProvenance {
  readonly provider: ExportProvider;
  readonly sourceFileName: string;
  readonly importedAt: string;
  readonly sourceFormat: ImportFormat;
  readonly parserVersion: '1.0.0';
  readonly acquisitionMode: 'user-export';
  readonly classification: 'PRIVATE_USER';
  readonly lawfulUserSelection: true;
}
export interface PrivateImport {
  readonly private: true;
  readonly provenance: ImportProvenance;
  readonly routes: readonly ImportedRoute[];
  readonly places: readonly { readonly name: string | null; readonly coordinate: Coordinate }[];
}

function malformed(message: string): never {
  throw new RouteFileError('MALFORMED_INPUT', message);
}
export function checkImportLimits(bytes: number, limits: ImportLimits): void {
  if (
    !Number.isSafeInteger(limits.maximumBytes) ||
    limits.maximumBytes <= 0 ||
    !Number.isSafeInteger(limits.maximumPoints) ||
    limits.maximumPoints <= 0
  )
    malformed('invalid import limits');
  if (bytes > limits.maximumBytes)
    throw new RouteFileError('INPUT_LIMIT_EXCEEDED', 'import byte limit exceeded');
}

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  text: string;
  children: XmlNode[];
}
function decodeXml(text: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(text)) malformed('invalid XML entity');
  return text.replace(/&([^;]*);/g, (_all, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (named[entity] !== undefined) return named[entity];
    const number = /^#x[0-9a-f]+$/i.test(entity)
      ? parseInt(entity.slice(2), 16)
      : /^#\d+$/.test(entity)
        ? Number(entity.slice(1))
        : NaN;
    if (
      !Number.isInteger(number) ||
      number <= 0 ||
      number > 0x10ffff ||
      (number >= 0xd800 && number <= 0xdfff)
    )
      malformed('invalid XML entity');
    return String.fromCodePoint(number);
  });
}

/** Small bounded XML tree reader; no DTDs, entity expansion, network access, or HTML. */
function parseXml(text: string, limits: ImportLimits): XmlNode {
  checkImportLimits(new TextEncoder().encode(text).length, limits);
  if (/<!DOCTYPE|<!ENTITY|<script\b|<\?xml-stylesheet|\0/i.test(text))
    throw new RouteFileError('UNSAFE_XML', 'unsafe XML');
  const root: XmlNode = { name: '#document', attributes: {}, text: '', children: [] };
  const stack = [root];
  const names: string[] = [];
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?xml\s[^?]*\?>|<[^>]*>|[^<]+/g;
  let end = 0;
  let nodes = 0;
  for (const token of text.matchAll(tokens)) {
    if (token.index !== end) malformed('malformed XML token');
    const value = token[0];
    end += value.length;
    const parent = stack[stack.length - 1]!;
    if (value.startsWith('<!--') || value.startsWith('<?xml')) continue;
    if (value.startsWith('<![CDATA[')) {
      parent.text += value.slice(9, -3);
      continue;
    }
    if (value.startsWith('</')) {
      if (value !== `</${names.pop()}>` || stack.length === 1) malformed('mismatched XML element');
      stack.pop();
      continue;
    }
    if (!value.startsWith('<')) {
      parent.text += decodeXml(value);
      continue;
    }
    const match = /^<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>$/.exec(value);
    if (!match || stack.length > 64 || ++nodes > limits.maximumPoints * 16 + 100)
      malformed('invalid or excessively nested XML');
    const name = match[1]!;
    const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const attr of match[2]!.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)) {
      if (attributes[attr[1]!] !== undefined) malformed('duplicate XML attribute');
      attributes[attr[1]!] = decodeXml(attr[3]!);
    }
    const node: XmlNode = { name: name.split(':').pop()!, attributes, text: '', children: [] };
    parent.children.push(node);
    if (match[3] !== '/') {
      stack.push(node);
      names.push(name);
    }
  }
  if (end !== text.length || stack.length !== 1 || root.children.length !== 1 || root.text.trim())
    malformed('incomplete XML document');
  return root.children[0]!;
}

function descendants(node: XmlNode, name: string): XmlNode[] {
  return node.children.flatMap((child) => [
    ...(child.name === name ? [child] : []),
    ...descendants(child, name),
  ]);
}
function number(value: string | undefined): number {
  if (value === undefined || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))
    malformed('invalid coordinate number');
  const result = Number(value);
  if (!Number.isFinite(result)) malformed('non-finite coordinate');
  return result;
}
function coordinate(lon: string | undefined, lat: string | undefined): Coordinate {
  try {
    return assertCoordinate([number(lon), number(lat)]);
  } catch {
    return malformed('invalid coordinate');
  }
}
function route(
  name: string | null,
  coordinates: Coordinate[],
  timestamps: (string | null)[],
  sourceFormat: ImportFormat,
): ImportedRoute {
  if (coordinates.length < 2)
    throw new RouteFileError('NO_USABLE_GEOMETRY', 'route requires two points');
  return { name, coordinates, timestamps, sourceFormat, private: true };
}

export function importKml(
  input: string,
  limits: ImportLimits = importLimits,
): Pick<PrivateImport, 'routes' | 'places'> {
  const root = parseXml(input, limits);
  if (root.name !== 'kml') malformed('expected KML document');
  if (
    ['Polygon', 'LinearRing', 'Track', 'MultiTrack', 'Model'].some(
      (name) => descendants(root, name).length > 0,
    )
  )
    throw new RouteFileError('FORMAT_UNSUPPORTED', 'unsupported KML geometry');
  if (descendants(root, 'NetworkLink').length || descendants(root, 'Link').length)
    throw new RouteFileError('UNSAFE_XML', 'KML links are not imported');
  const routes: ImportedRoute[] = [];
  const places: { name: string | null; coordinate: Coordinate }[] = [];
  let points = 0;
  for (const placemark of descendants(root, 'Placemark')) {
    const name = placemark.children.find((child) => child.name === 'name')?.text.trim() || null;
    for (const geometry of [
      ...descendants(placemark, 'LineString'),
      ...descendants(placemark, 'Point'),
    ]) {
      const values = geometry.children.find((child) => child.name === 'coordinates')?.text.trim();
      if (!values) malformed('KML geometry has no coordinates');
      const coordinates = values.split(/\s+/).map((tuple) => {
        if (++points > limits.maximumPoints)
          throw new RouteFileError('INPUT_LIMIT_EXCEEDED', 'point limit exceeded');
        const parts = tuple.split(',');
        if (parts.length < 2 || parts.length > 3) malformed('invalid KML tuple');
        if (parts[2] !== undefined) number(parts[2]);
        return coordinate(parts[0], parts[1]);
      });
      if (geometry.name === 'Point') {
        if (coordinates.length !== 1) malformed('KML Point requires one position');
        places.push({ name, coordinate: coordinates[0]! });
      } else
        routes.push(
          route(
            name,
            coordinates,
            coordinates.map(() => null),
            'kml',
          ),
        );
    }
  }
  if (!routes.length && !places.length)
    throw new RouteFileError('NO_USABLE_GEOMETRY', 'no supported KML geometry');
  return { routes, places };
}

export interface CsvMapping {
  readonly longitude: string;
  readonly latitude: string;
  readonly name?: string;
  readonly timestamp?: string;
  readonly geometry: 'route' | 'places';
}
export const genericCsvMapping: CsvMapping = {
  longitude: 'longitude',
  latitude: 'latitude',
  name: 'name',
  timestamp: 'timestamp',
  geometry: 'route',
};

function csvRows(input: string, maximumRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i <= input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === undefined) malformed('unterminated CSV quote');
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      if (field || closed) malformed('unexpected CSV quote');
      quoted = true;
      continue;
    }
    if (ch === ',' || ch === '\n' || ch === '\r' || ch === undefined) {
      row.push(field);
      field = '';
      closed = false;
      if (row.length > 256) malformed('too many CSV columns');
      if (ch !== ',') {
        if (row.some((value) => value !== '')) rows.push(row);
        if (rows.length > maximumRows)
          throw new RouteFileError('INPUT_LIMIT_EXCEEDED', 'CSV row limit exceeded');
        row = [];
        if (ch === '\r' && input[i + 1] === '\n') i++;
      }
    } else {
      if (closed) malformed('text after CSV quote');
      field += ch;
    }
  }
  return rows;
}

export function importCsv(
  input: string,
  mapping: CsvMapping = genericCsvMapping,
  limits: ImportLimits = importLimits,
): Pick<PrivateImport, 'routes' | 'places'> {
  checkImportLimits(new TextEncoder().encode(input).length, limits);
  if (input.includes('\0')) malformed('null byte in CSV');
  const rows = csvRows(input.replace(/^\uFEFF/, ''), limits.maximumPoints + 1);
  const headers = rows.shift()?.map((value) => value.trim()) ?? [];
  if (
    new Set(headers).size !== headers.length ||
    !headers.includes(mapping.longitude) ||
    !headers.includes(mapping.latitude)
  )
    malformed('CSV columns do not match mapping');
  if (mapping.geometry !== 'route' && mapping.geometry !== 'places')
    malformed('invalid CSV geometry mapping');
  const coordinates: Coordinate[] = [];
  const timestamps: (string | null)[] = [];
  const places: { name: string | null; coordinate: Coordinate }[] = [];
  let name: string | null = null;
  for (const row of rows) {
    if (row.length !== headers.length) malformed('CSV row width mismatch');
    const get = (key: string | undefined): string | undefined =>
      key === undefined ? undefined : row[headers.indexOf(key)];
    const point = coordinate(get(mapping.longitude), get(mapping.latitude));
    const label = get(mapping.name)?.trim() || null;
    name ??= label;
    const time = get(mapping.timestamp)?.trim() || null;
    if (time !== null && !Number.isFinite(Date.parse(time))) malformed('invalid CSV timestamp');
    coordinates.push(point);
    timestamps.push(time);
    if (mapping.geometry === 'places') places.push({ name: label, coordinate: point });
  }
  if (!coordinates.length) throw new RouteFileError('NO_USABLE_GEOMETRY', 'empty CSV');
  return {
    routes: mapping.geometry === 'route' ? [route(name, coordinates, timestamps, 'csv')] : [],
    places,
  };
}

/** Parsing is pure: selected files are staged as private data; no service is contacted. */
export function importSelectedFile(
  selection: {
    readonly userSelected: true;
    readonly lawfullyObtained: true;
    readonly fileName: string;
    readonly format: ImportFormat;
    readonly provider?: ExportProvider;
    readonly importedAt: string;
    readonly bytes: Uint8Array;
    readonly csvMapping?: CsvMapping;
  },
  limits: ImportLimits = importLimits,
): PrivateImport {
  checkImportLimits(selection.bytes.length, limits);
  if (selection.userSelected !== true || selection.lawfullyObtained !== true)
    malformed('lawful user file selection is required');
  if (
    !selection.fileName ||
    /[\\/\x00-\x1f]/.test(selection.fileName) ||
    !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(selection.importedAt) ||
    !Number.isFinite(Date.parse(selection.importedAt))
  )
    malformed('invalid import provenance');
  const provider = selection.provider ?? 'generic';
  if (!['generic', 'alltrails', 'ioverlander', 'garmin', 'strava'].includes(provider))
    malformed('unknown export provider');
  let content: Pick<PrivateImport, 'routes' | 'places'>;
  if (selection.format === 'fit')
    content = { routes: [importFit(selection.bytes, limits)], places: [] };
  else {
    let input: string;
    try {
      input = new TextDecoder('utf-8', { fatal: true }).decode(selection.bytes);
    } catch {
      return malformed('invalid UTF-8');
    }
    if (selection.format === 'kml') content = importKml(input, limits);
    else if (selection.format === 'csv') {
      if (provider === 'ioverlander' && !selection.csvMapping)
        malformed('account CSV requires an explicit reviewed column mapping');
      content = importCsv(input, selection.csvMapping, limits);
    } else if (selection.format === 'gpx') {
      // Validate structure before the legacy route parser; selected imports also support waypoints.
      const tree = parseXml(input, limits);
      if (tree.name !== 'gpx') malformed('expected GPX');
      const places = descendants(tree, 'wpt').map((point) => ({
        name: point.children.find((child) => child.name === 'name')?.text ?? null,
        coordinate: coordinate(point.attributes.lon, point.attributes.lat),
      }));
      const segments = [
        ...descendants(tree, 'trk').flatMap((track) =>
          descendants(track, 'trkseg').map((segment) => ({
            segment,
            name: track.children.find((child) => child.name === 'name')?.text.trim() || null,
          })),
        ),
        ...descendants(tree, 'rte').map((segment) => ({
          segment,
          name: segment.children.find((child) => child.name === 'name')?.text.trim() || null,
        })),
      ];
      const routes = segments.map(({ segment, name }) => {
        const points = segment.children.filter(
          (point) => point.name === 'trkpt' || point.name === 'rtept',
        );
        return route(
          name,
          points.map((point) => coordinate(point.attributes.lon, point.attributes.lat)),
          points.map((point) => {
            const time = point.children.find((child) => child.name === 'time')?.text.trim() ?? null;
            if (time !== null && !Number.isFinite(Date.parse(time)))
              malformed('invalid GPX timestamp');
            return time;
          }),
          'gpx',
        );
      });
      content = { routes, places };
    } else if (selection.format === 'geojson') {
      let document: { type?: string; features?: unknown[] };
      try {
        document = JSON.parse(input) as typeof document;
      } catch {
        return malformed('invalid GeoJSON');
      }
      if (!document || typeof document !== 'object') malformed('invalid GeoJSON root');
      const features = document.type === 'FeatureCollection' ? document.features : [document];
      if (!Array.isArray(features)) malformed('invalid feature collection');
      const routes: ImportedRoute[] = [];
      const places: { name: string | null; coordinate: Coordinate }[] = [];
      for (const value of features) {
        if (!value || typeof value !== 'object') malformed('invalid feature');
        const feature = value as {
          type?: string;
          geometry?: { type?: string; coordinates?: unknown };
          properties?: { name?: unknown };
        };
        const geometry =
          feature.type === 'Feature' ? feature.geometry : (value as typeof feature.geometry);
        if (geometry?.type === 'Point') {
          const coords = geometry.coordinates;
          if (
            !Array.isArray(coords) ||
            typeof coords[0] !== 'number' ||
            typeof coords[1] !== 'number'
          )
            malformed('invalid point');
          places.push({
            name: typeof feature.properties?.name === 'string' ? feature.properties.name : null,
            coordinate: coordinate(String(coords[0]), String(coords[1])),
          });
        } else if (geometry?.type === 'LineString')
          routes.push(importGeoJson(JSON.stringify(value), limits));
        else throw new RouteFileError('FORMAT_UNSUPPORTED', 'unsupported GeoJSON geometry');
      }
      content = { routes, places };
    } else throw new RouteFileError('FORMAT_UNSUPPORTED', 'unsupported selected format');
  }
  const count =
    content.places.length + content.routes.reduce((sum, item) => sum + item.coordinates.length, 0);
  if (count > limits.maximumPoints)
    throw new RouteFileError('INPUT_LIMIT_EXCEEDED', 'combined import point limit exceeded');
  if (!count) throw new RouteFileError('NO_USABLE_GEOMETRY', 'no supported geometry');
  return {
    ...content,
    private: true,
    provenance: {
      provider,
      sourceFileName: selection.fileName,
      importedAt: selection.importedAt,
      sourceFormat: selection.format,
      parserVersion: '1.0.0',
      acquisitionMode: 'user-export',
      classification: 'PRIVATE_USER',
      lawfulUserSelection: true,
    },
  };
}

export interface PrivateImportSink {
  readonly classification: 'PRIVATE_USER';
  /** Atomically insert a new batch; never replace an existing user database or catalog. */
  readonly insertBatch: (batch: PrivateImport & { readonly sourceSha256: string }) => Promise<void>;
}
export async function stageSelectedFile(
  selection: Parameters<typeof importSelectedFile>[0],
  sink: PrivateImportSink,
  limits: ImportLimits = importLimits,
): Promise<PrivateImport & { readonly sourceSha256: string }> {
  if (sink.classification !== 'PRIVATE_USER')
    malformed('imports require a private user destination');
  const bytes = selection.bytes.slice();
  const parsed = importSelectedFile({ ...selection, bytes }, limits);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const sourceSha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const batch = { ...parsed, sourceSha256 };
  await sink.insertBatch(structuredClone(batch));
  return batch;
}
