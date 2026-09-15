import mobileMapDataAsset from '../../packages/map/src/assets/new-york-outdoors.geojson';
import mobileMapDataIndex from '../../packages/map/src/assets/new-york-outdoors.index.json';
import publicManifest from '../../packages/map/src/assets/new-york-outdoors.manifest.json';

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
  readonly label: string;
  readonly featureCount: number;
  readonly acquiredAt: string;
  readonly attribution: string;
  readonly sources: readonly MobileMapSourceSummary[];
}

export { mobileMapDataAsset, mobileMapDataIndex };
export const mobileMapDataMetadata = {
  schemaVersion: 1,
  classification: publicManifest.classification,
  hasPrivateData: false,
  label: 'DEC public catalog',
  featureCount: publicManifest.featureCount,
  acquiredAt: publicManifest.acquiredAt,
  attribution:
    'NYS ITS Geospatial Services; New York State Department of Environmental Conservation; OPEN-NY',
  sources: [
    {
      id: 'nys-dec',
      label: 'NYS DEC',
      featureCount: publicManifest.featureCount,
      status: 'public offline snapshot',
    },
  ],
} satisfies MobileMapDataMetadata;
