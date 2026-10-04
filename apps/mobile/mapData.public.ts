import mobileMapDataAsset from '../../packages/map/src/assets/base-outdoors.geojson';
import type { OutdoorFeatureIndex } from '@open-outdoor/map';
import type { HikeRouteDetails } from '@open-outdoor/shared/hike-route';

export interface MobileMapSourceSummary {
  readonly id: string;
  readonly label: string;
  readonly featureCount: number;
  readonly status: string;
}

export interface MobileMapDataMetadata {
  readonly schemaVersion: 1;
  readonly classification: string;
  readonly hasPrivateData: boolean;
  readonly sha256: string;
  readonly hikeProfileCount: number;
  readonly label: string;
  readonly featureCount: number;
  readonly acquiredAt: string;
  readonly attribution: string;
  readonly sources: readonly MobileMapSourceSummary[];
}

export { mobileMapDataAsset };
const emptyCatalogSha256 = '299aeb5113c8d42e75f0f937a72927867d0ad25e78d6f41a66c63293d125b959';
// Stock builds contain basemaps only. State catalogs are explicitly installed in Maps.
export const mobileMapDataIndex: OutdoorFeatureIndex = { schemaVersion: 1, features: [] };
export const mobileHikeData = {
  sourceSha256: emptyCatalogSha256,
  attribution: '',
  hikes: {} as Readonly<Record<string, HikeRouteDetails>>,
};
export const mobileMapDataMetadata = {
  schemaVersion: 1,
  classification: 'SOURCE_REDISTRIBUTABLE',
  hasPrivateData: false,
  label: 'Offline basemaps',
  featureCount: 0,
  sha256: emptyCatalogSha256,
  hikeProfileCount: 0,
  acquiredAt: '',
  attribution: '',
  sources: [] as readonly MobileMapSourceSummary[],
} satisfies MobileMapDataMetadata;
