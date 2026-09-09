export type BasemapJson =
  | string
  | number
  | boolean
  | null
  | readonly BasemapJson[]
  | { readonly [key: string]: BasemapJson };

export interface BasemapChecksumProvider {
  readonly sha256: (bytes: Uint8Array) => string;
}

export interface PinnedOsmExtract {
  readonly locator: string;
  readonly sha256: string;
  readonly sourceTimestamp: string;
  readonly boundary: readonly [west: number, south: number, east: number, north: number];
  readonly provider: string;
  readonly licenseId: string;
  readonly attribution: readonly string[];
  readonly offlineRedistributionAllowed: boolean;
}

export interface PinnedTileCompiler {
  readonly name: string;
  readonly version: string;
  readonly executableSha256: string;
}

export interface BasemapDetailArea {
  readonly id: string;
  readonly bounds: readonly [west: number, south: number, east: number, north: number];
  readonly minimumZoom: number;
  readonly maximumZoom: number;
}

export interface BasemapProfile {
  readonly id: string;
  readonly regionId: 'us-ny';
  readonly schemaVersion: number;
  readonly styleVersion: number;
  readonly statewideMinimumZoom: number;
  readonly statewideMaximumZoom: number;
  readonly highDetailAreas: readonly BasemapDetailArea[];
  readonly layers: readonly string[];
}

export interface LicensedLocalAsset {
  readonly id: string;
  readonly path: string;
  readonly licenseId: string;
  readonly attribution: string;
}

export interface LocalBasemapStyle {
  readonly document: BasemapJson;
  readonly sprites: readonly LicensedLocalAsset[];
  readonly fonts: readonly LicensedLocalAsset[];
}

export interface BuildNewYorkBasemapInput {
  readonly extract: PinnedOsmExtract;
  readonly extractBytes: Uint8Array;
  readonly compiler: PinnedTileCompiler;
  readonly compilerExecutableBytes: Uint8Array;
  readonly compile: (extractBytes: Uint8Array, profile: BasemapProfile) => Uint8Array;
  readonly profile: BasemapProfile;
  readonly style: LocalBasemapStyle;
  readonly checksum: BasemapChecksumProvider;
}

export interface NewYorkBasemapManifest {
  readonly formatVersion: '1.0.0';
  readonly regionId: 'us-ny';
  readonly extract: Omit<PinnedOsmExtract, 'offlineRedistributionAllowed'>;
  readonly compiler: PinnedTileCompiler;
  readonly profile: BasemapProfile;
  readonly archive: {
    readonly format: 'mbtiles';
    readonly byteLength: number;
    readonly sha256: string;
  };
  readonly style: {
    readonly sha256: string;
    readonly sprites: readonly LicensedLocalAsset[];
    readonly fonts: readonly LicensedLocalAsset[];
  };
  readonly attribution: readonly string[];
}

const SHA256 = /^[0-9a-f]{64}$/;
const REQUIRED_LAYERS = ['background', 'land', 'water', 'road', 'trail', 'place'] as const;
const NEW_YORK_BOUNDS = [-79.7624, 40.4774, -71.7517, 45.0159] as const;
const BASEMAP_LIMIT_BYTES = 1.5 * 1024 ** 3;

function validUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function validBounds(bounds: readonly [number, number, number, number]): boolean {
  const [west, south, east, north] = bounds;
  return west >= -180 && east <= 180 && south >= -90 && north <= 90 && west < east && south < north;
}

function containsBounds(
  outer: readonly [number, number, number, number],
  inner: readonly [number, number, number, number],
): boolean {
  return (
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  );
}

function stableValue(value: BasemapJson): BasemapJson {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function styleBytes(style: LocalBasemapStyle): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(stableValue(style as unknown as BasemapJson)));
}

function assertLocal(value: BasemapJson, path = 'style'): void {
  if (typeof value === 'string' && /^(?:https?|mapbox):/i.test(value)) {
    throw new Error(`${path} contains a network resource: ${value}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertLocal(item, `${path}[${index}]`));
  } else if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => assertLocal(item, `${path}.${key}`));
  }
}

function assertAssets(kind: string, assets: readonly LicensedLocalAsset[]): void {
  if (assets.length === 0) throw new Error(`basemap ${kind} assets are required`);
  const ids = new Set<string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) throw new Error(`duplicate basemap asset id: ${asset.id}`);
    ids.add(asset.id);
    if (
      asset.id.trim() === '' ||
      asset.path.trim() === '' ||
      /^(?:https?|mapbox):/i.test(asset.path) ||
      asset.licenseId.trim() === '' ||
      asset.attribution.trim() === ''
    ) {
      throw new Error(`basemap ${kind} asset metadata is incomplete: ${asset.id}`);
    }
  }
}

function assertProfile(profile: BasemapProfile): void {
  if (profile.id.trim() === '' || profile.regionId !== 'us-ny') {
    throw new Error('basemap profile must identify the New York region');
  }
  if (
    !Number.isSafeInteger(profile.schemaVersion) ||
    !Number.isSafeInteger(profile.styleVersion) ||
    profile.schemaVersion < 1 ||
    profile.styleVersion < 1
  ) {
    throw new Error('basemap schema and style versions must be positive integers');
  }
  if (
    !Number.isSafeInteger(profile.statewideMinimumZoom) ||
    !Number.isSafeInteger(profile.statewideMaximumZoom) ||
    profile.statewideMinimumZoom < 0 ||
    profile.statewideMaximumZoom < 14
  ) {
    throw new Error('New York statewide basemap coverage must extend through zoom 14');
  }
  for (const layer of REQUIRED_LAYERS) {
    if (!profile.layers.includes(layer)) throw new Error(`basemap layer is required: ${layer}`);
  }
  for (const area of profile.highDetailAreas) {
    if (
      area.id.trim() === '' ||
      !validBounds(area.bounds) ||
      !containsBounds(NEW_YORK_BOUNDS, area.bounds) ||
      area.minimumZoom > 15 ||
      area.maximumZoom < 16 ||
      area.minimumZoom > area.maximumZoom
    ) {
      throw new Error(`invalid zoom 15-16 high-detail area: ${area.id}`);
    }
  }
}

export function buildNewYorkBasemap(input: BuildNewYorkBasemapInput): NewYorkBasemapManifest {
  const extractUrl = new URL(input.extract.locator);
  if (
    extractUrl.protocol !== 'https:' ||
    extractUrl.hostname.toLowerCase() === 'tile.openstreetmap.org'
  ) {
    throw new Error('basemap extract must use an authorized HTTPS extract, never OSM tile servers');
  }
  if (
    !SHA256.test(input.extract.sha256) ||
    input.checksum.sha256(input.extractBytes) !== input.extract.sha256
  ) {
    throw new Error('basemap extract checksum does not match the pinned source');
  }
  if (
    !validUtc(input.extract.sourceTimestamp) ||
    !validBounds(input.extract.boundary) ||
    !containsBounds(input.extract.boundary, NEW_YORK_BOUNDS) ||
    input.extract.provider.trim() === '' ||
    input.extract.licenseId.trim() === '' ||
    input.extract.attribution.length === 0 ||
    input.extract.attribution.some((item) => item.trim() === '') ||
    !input.extract.offlineRedistributionAllowed
  ) {
    throw new Error(
      'basemap extract rights, boundary, timestamp, and attribution must be complete',
    );
  }
  if (
    input.compiler.name.trim() === '' ||
    input.compiler.version.trim() === '' ||
    !SHA256.test(input.compiler.executableSha256)
  ) {
    throw new Error('basemap compiler must have a pinned version and executable checksum');
  }
  if (input.checksum.sha256(input.compilerExecutableBytes) !== input.compiler.executableSha256) {
    throw new Error('basemap compiler executable checksum does not match its pin');
  }
  assertProfile(input.profile);
  assertLocal(input.style.document);
  assertAssets('sprite', input.style.sprites);
  assertAssets('font', input.style.fonts);
  const tileArchiveBytes = input.compile(input.extractBytes.slice(), input.profile);
  if (!(tileArchiveBytes instanceof Uint8Array) || tileArchiveBytes.byteLength === 0) {
    throw new Error('basemap compiler produced an empty or invalid tile archive');
  }
  if (tileArchiveBytes.byteLength > BASEMAP_LIMIT_BYTES) {
    throw new Error('basemap tile archive exceeds the 1.5 GiB component ceiling');
  }
  const archiveSha256 = input.checksum.sha256(tileArchiveBytes);
  if (!SHA256.test(archiveSha256))
    throw new Error('basemap checksum provider returned invalid SHA-256');
  const attribution = [
    ...new Set([
      ...input.extract.attribution,
      ...input.style.sprites.map(({ attribution: item }) => item),
      ...input.style.fonts.map(({ attribution: item }) => item),
    ]),
  ].sort();
  const publishedExtract: NewYorkBasemapManifest['extract'] = {
    locator: input.extract.locator,
    sha256: input.extract.sha256,
    sourceTimestamp: input.extract.sourceTimestamp,
    boundary: input.extract.boundary,
    provider: input.extract.provider,
    licenseId: input.extract.licenseId,
    attribution: input.extract.attribution,
  };
  return {
    formatVersion: '1.0.0',
    regionId: 'us-ny',
    extract: publishedExtract,
    compiler: { ...input.compiler },
    profile: {
      ...input.profile,
      highDetailAreas: [...input.profile.highDetailAreas].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
      layers: [...input.profile.layers].sort(),
    },
    archive: {
      format: 'mbtiles',
      byteLength: tileArchiveBytes.byteLength,
      sha256: archiveSha256,
    },
    style: {
      sha256: input.checksum.sha256(styleBytes(input.style)),
      sprites: [...input.style.sprites].sort((left, right) => left.id.localeCompare(right.id)),
      fonts: [...input.style.fonts].sort((left, right) => left.id.localeCompare(right.id)),
    },
    attribution,
  };
}

export function assertReproducibleBasemap(
  first: NewYorkBasemapManifest,
  second: NewYorkBasemapManifest,
): void {
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('basemap reproduction mismatch');
  }
}
