import { requireOptionalNativeModule } from 'expo';
import type { PinnedBasemapManifest } from '@open-outdoor/storage';

export interface NativeInstalledBasemap {
  readonly uri: string;
  readonly manifest: PinnedBasemapManifest;
  readonly verification: {
    readonly bytes: number;
    readonly sha256: string;
  };
}

interface NativeBasemapPackModule {
  readonly activeBasemapPack: () => Promise<string | null>;
  readonly importBasemapPack: (sourceUri: string, manifestJson: string) => Promise<string>;
  readonly removeActiveBasemapPack: () => Promise<void>;
}

const module = requireOptionalNativeModule<NativeBasemapPackModule>('OpenOutdoorNativeSpikes');

const unavailableMessage =
  'Detailed basemap import is unavailable in this build. The bundled overview remains offline and usable.';

function requiredModule(): NativeBasemapPackModule {
  if (module === null) throw new Error(unavailableMessage);
  return module;
}

function parseInstalled(value: string): NativeInstalledBasemap {
  return JSON.parse(value) as NativeInstalledBasemap;
}

export const basemapPacks = {
  available: module !== null,
  loadError: module === null ? unavailableMessage : null,
  active: async (): Promise<NativeInstalledBasemap | null> => {
    const value = await requiredModule().activeBasemapPack();
    return value === null ? null : parseInstalled(value);
  },
  import: async (
    sourceUri: string,
    manifest: PinnedBasemapManifest,
  ): Promise<NativeInstalledBasemap> =>
    parseInstalled(await requiredModule().importBasemapPack(sourceUri, JSON.stringify(manifest))),
  removeActive: (): Promise<void> => requiredModule().removeActiveBasemapPack(),
};
