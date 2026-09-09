import { validateConnectorManifest, type Connector, type ConnectorManifest } from './connector.js';
import { IngestionSecurityError } from './ingestion.js';

export const PERMISSION_SOURCES = {
  alltrails: { name: 'AllTrails', url: 'https://www.alltrails.com/', legacy: false },
  'the-dyrt': { name: 'The Dyrt', url: 'https://thedyrt.com/', legacy: false },
  ioverlander: { name: 'iOverlander', url: 'https://ioverlander.com/', legacy: false },
  'poi-factory': { name: 'POI Factory', url: 'https://www.poi-factory.com/', legacy: false },
  freeroam: { name: 'FreeRoam archive', url: 'https://freeroam.app/', legacy: true },
} as const;
export type PermissionSourceId = keyof typeof PERMISSION_SOURCES;
export interface TaxonomyMapping {
  readonly recordType: 'place' | 'trail' | 'condition' | 'restriction';
  readonly category: string;
  readonly rawCategory: string;
  readonly reviewRequired: boolean;
}

// Project-owned interchange keys, not proprietary payload schemas or permission grants.
const categories: Readonly<Record<string, readonly [TaxonomyMapping['recordType'], string]>> = {
  trail: ['trail', 'trail'],
  campground: ['place', 'established-campground'],
  'established-campground': ['place', 'established-campground'],
  'informal-campsite': ['place', 'informal-campsite'],
  'wild-camping': ['place', 'dispersed-campsite'],
  'farm-vineyard-camping': ['place', 'farm-camping'],
  hotel: ['place', 'hotel'],
  hostel: ['place', 'hostel'],
  'fuel-station': ['place', 'fuel'],
  propane: ['place', 'propane'],
  'mechanic-and-parts': ['place', 'vehicle-repair'],
  water: ['place', 'water'],
  'sanitation-dump-station': ['place', 'dump-station'],
  'short-term-parking': ['place', 'parking'],
  'eco-friendly': ['place', 'eco-services'],
  restaurant: ['place', 'restaurant'],
  'tourist-attraction': ['place', 'tourist-information'],
  shopping: ['place', 'shopping'],
  financial: ['place', 'financial-services'],
  wifi: ['place', 'wifi'],
  medical: ['place', 'medical'],
  'pet-services': ['place', 'pet-services'],
  laundromat: ['place', 'laundry'],
  showers: ['place', 'showers'],
  'customs-and-immigration': ['place', 'customs-immigration'],
  checkpoint: ['condition', 'checkpoint'],
  'consulate-embassy': ['place', 'consulate-embassy'],
  'vehicle-insurance': ['place', 'vehicle-insurance'],
  'vehicle-shipping': ['place', 'vehicle-shipping'],
  'vehicle-storage': ['place', 'vehicle-storage'],
  'road-report': ['condition', 'road-condition'],
  warning: ['condition', 'hazard'],
  'overnight-prohibited': ['restriction', 'overnight-prohibition'],
  other: ['place', 'other'],
};
export const SUPPORTED_SHELL_CATEGORIES = Object.freeze(Object.keys(categories));
export function mapShellCategory(rawCategory: string): TaxonomyMapping {
  if (typeof rawCategory !== 'string' || rawCategory.length === 0 || rawCategory.length > 200)
    throw new Error('invalid category');
  const key = rawCategory
    .trim()
    .toLowerCase()
    .replaceAll('&', '')
    .replaceAll('/', '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const mapping = Object.hasOwn(categories, key) ? categories[key] : undefined;
  return {
    recordType: mapping?.[0] ?? 'place',
    category: mapping?.[1] ?? 'unknown',
    rawCategory,
    reviewRequired: !mapping,
  };
}
function source(id: PermissionSourceId) {
  if (!Object.hasOwn(PERMISSION_SOURCES, id)) throw new Error('unknown permission-gated source');
  return PERMISSION_SOURCES[id];
}
export function permissionShellManifest(id: PermissionSourceId): ConnectorManifest {
  const entry = source(id);
  return validateConnectorManifest({
    schemaVersion: '1.0.0',
    connectorVersion: '1.0.0',
    sourceId: id,
    lifecycle: 'disabled',
    authorization: 'permission-required',
    acquisitionMode: 'deep-link-only',
    sourceClass: entry.legacy ? 'legacy' : 'current',
    classification: 'SOURCE_RESTRICTED',
    allowedTransports: ['file'],
    allowedHosts: [],
    secretNames: [],
    rights: {
      rawRetention: null,
      parsedFields: [],
      media: false,
      derivedData: false,
      offlineStorage: false,
      distribution: { public: false, 'private-user': false, 'private-organization': false },
      attribution: [entry.name],
      termsUrl: entry.url,
      evidenceReviewedAt: '2026-09-09T00:00:00.000Z',
      reviewExpiresAt: null,
    },
    limits: {
      maxPayloadBytes: 1024,
      maxArchiveEntries: 1,
      maxExpandedBytes: 1024,
      maxCompressionRatio: 1,
      maxParserMilliseconds: 100,
      maxRedirects: 0,
      maxConcurrency: 1,
    },
    requiredFreshnessSeconds: null,
  });
}
export function shellCapabilities(id: PermissionSourceId) {
  source(id);
  return {
    taxonomySupported: true,
    adapterShellImplemented: true,
    connectorImplemented: false,
    sourceAuthorized: false,
    recordsIncluded: false,
    label: 'Taxonomy and links only; source acquisition disabled',
  } as const;
}
/** A user may open a reviewed source link; this function never contacts it. */
export function shellDeepLink(id: PermissionSourceId, selectedUrl?: string): string {
  const entry = source(id);
  const url = new URL(selectedUrl ?? entry.url);
  if (
    url.origin !== new URL(entry.url).origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new Error(
      'source link must be an uncredentialed same-origin HTTPS URL without query or fragment',
    );
  }
  return url.href;
}
/** Even calling a stage directly cannot turn a shell into a fetcher. */
export function createPermissionShell(id: PermissionSourceId): Connector<never, never, never> {
  const deny = async (): Promise<never> => {
    throw new IngestionSecurityError(
      'rights-denied',
      'permission shell has no acquisition or record implementation',
    );
  };
  return {
    manifest: permissionShellManifest(id),
    discover: deny,
    fetch: deny,
    storeRaw: deny,
    parse: deny,
    normalize: deny,
    validate: deny,
    checkpoint: deny,
    emit: deny,
  };
}
