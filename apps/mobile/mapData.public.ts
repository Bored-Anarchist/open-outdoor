import mobileMapDataAsset from '../../packages/map/src/assets/new-york-outdoors.geojson';
import mobileMapDataIndex from '../../packages/map/src/assets/new-york-outdoors.index.json';
import publicManifest from '../../packages/map/src/assets/new-york-outdoors.manifest.json';
import mobileHikeData from '../../packages/map/src/assets/new-york-hikes.json';

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

export { mobileMapDataAsset, mobileMapDataIndex, mobileHikeData };
export const mobileMapDataMetadata = {
  schemaVersion: 1,
  classification: publicManifest.classification,
  hasPrivateData: false,
  label: 'NYS boundary + NPS + USFS + BLM public catalog',
  featureCount: publicManifest.featureCount,
  sha256: publicManifest.sha256,
  hikeProfileCount: Object.keys(mobileHikeData.hikes).length,
  acquiredAt: publicManifest.acquiredAt,
  attribution:
    'NYS ITS Geospatial Services; National Park Service; USDA Forest Service; Bureau of Land Management',
  sources: publicManifest.catalogSources,
} satisfies MobileMapDataMetadata;
