export interface OfflineBasemapArchiveManifest {
  readonly format: 'pmtiles';
  readonly bytes: number;
  readonly sha256: string;
}

export interface OfflineBasemapSourceManifest {
  readonly schemaVersion: number;
  readonly regionId: string;
  readonly minimumZoom: number;
  readonly maximumZoom: number;
  readonly archive: OfflineBasemapArchiveManifest;
}

export interface OfflineBasemapSourceCandidate {
  readonly uri: string;
  readonly manifest: OfflineBasemapSourceManifest;
}

export interface InstalledOfflineBasemapSourceCandidate extends OfflineBasemapSourceCandidate {
  /** Results produced by the platform verifier after reading the installed file. */
  readonly verification: {
    readonly bytes: number;
    readonly sha256: string;
  };
}

export type InstalledBasemapRejection =
  | 'not-local'
  | 'invalid-manifest'
  | 'incompatible-region'
  | 'incompatible-schema'
  | 'byte-length-mismatch'
  | 'checksum-mismatch';

export interface ResolvedOfflineBasemapSource extends OfflineBasemapSourceCandidate {
  readonly kind: 'installed' | 'overview';
  /** Present only when an installed candidate was rejected in favor of the overview. */
  readonly installedRejection?: InstalledBasemapRejection;
}

const LOCAL_FILE_URI = /^file:\/\/\/.+/i;
const SHA256 = /^[a-f0-9]{64}$/i;

export function isLocalFileUri(uri: string): boolean {
  return LOCAL_FILE_URI.test(uri) && !/[\r\n]/.test(uri);
}

function manifestProblem(manifest: OfflineBasemapSourceManifest): string | null {
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) {
    return 'schema version';
  }
  if (!manifest.regionId.trim()) return 'region';
  if (
    !Number.isInteger(manifest.minimumZoom) ||
    !Number.isInteger(manifest.maximumZoom) ||
    manifest.minimumZoom < 0 ||
    manifest.maximumZoom > 22 ||
    manifest.minimumZoom > manifest.maximumZoom
  ) {
    return 'zoom range';
  }
  if (manifest.archive.format !== 'pmtiles') return 'archive format';
  if (!Number.isSafeInteger(manifest.archive.bytes) || manifest.archive.bytes <= 0) {
    return 'archive byte length';
  }
  if (!SHA256.test(manifest.archive.sha256)) return 'archive checksum';
  return null;
}

function installedRejection(
  overview: OfflineBasemapSourceCandidate,
  installed: InstalledOfflineBasemapSourceCandidate,
): InstalledBasemapRejection | null {
  if (!isLocalFileUri(installed.uri)) return 'not-local';
  if (manifestProblem(installed.manifest)) return 'invalid-manifest';
  if (installed.manifest.regionId !== overview.manifest.regionId) return 'incompatible-region';
  if (installed.manifest.schemaVersion !== overview.manifest.schemaVersion) {
    return 'incompatible-schema';
  }
  if (
    installed.verification.bytes !== installed.manifest.archive.bytes ||
    !Number.isSafeInteger(installed.verification.bytes)
  ) {
    return 'byte-length-mismatch';
  }
  if (
    !SHA256.test(installed.verification.sha256) ||
    installed.verification.sha256.toLocaleLowerCase() !==
      installed.manifest.archive.sha256.toLocaleLowerCase()
  ) {
    return 'checksum-mismatch';
  }
  return null;
}

/**
 * Resolves an offline-only basemap without ever returning an HTTP resource.
 * Installed packs must be independently verified by the platform before they
 * can replace the bundled, build-verified overview.
 */
export function resolveOfflineBasemapSource(input: {
  readonly overview: OfflineBasemapSourceCandidate;
  readonly installed?: InstalledOfflineBasemapSourceCandidate | null;
}): ResolvedOfflineBasemapSource {
  if (!isLocalFileUri(input.overview.uri)) {
    throw new Error('bundled overview basemap must use a local file URL');
  }
  const overviewProblem = manifestProblem(input.overview.manifest);
  if (overviewProblem) throw new Error(`invalid bundled overview basemap ${overviewProblem}`);

  if (!input.installed) return { ...input.overview, kind: 'overview' };
  const rejection = installedRejection(input.overview, input.installed);
  return rejection
    ? { ...input.overview, kind: 'overview', installedRejection: rejection }
    : { ...input.installed, kind: 'installed' };
}
