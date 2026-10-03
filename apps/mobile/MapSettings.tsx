import { useState } from 'react';
import { Alert, View } from 'react-native';
import { ProductText as Text } from './accessibility';
import { ProductButton, ProductCard } from './ProductComponents';
import { LaptopPackages } from './LaptopPackages';
import type { StatePackagesService } from './useStatePackages';
import type { ImportedMapDatasetsService } from './useImportedMapDatasets';
import {
  mobileMapDataMetadata,
  mobileHikeData as bundledHikes,
} from '@open-outdoor/mobile-map-data';
import worldBasemapManifest from '../../packages/map/src/assets/world-basemap.manifest.json';
import licenses from './map-licenses.json';
import offlineMapLicenses from './offline-map-licenses.json';

export function MapSettings({
  imports,
  statePackages,
  onShowCoverage,
}: {
  imports: ImportedMapDatasetsService;
  statePackages: StatePackagesService;
  onShowCoverage: (bounds: [number, number, number, number]) => void;
}) {
  const [showLicenses, setShowLicenses] = useState(false);
  function showDatasetCoverage(dataset: ImportedMapDatasetsService['datasets'][number]) {
    const bounds: [number, number, number, number] = [180, 90, -180, -90];

    for (const feature of dataset.index.features) {
      bounds[0] = Math.min(bounds[0], feature.bounds[0]);

      bounds[1] = Math.min(bounds[1], feature.bounds[1]);

      bounds[2] = Math.max(bounds[2], feature.bounds[2]);

      bounds[3] = Math.max(bounds[3], feature.bounds[3]);
    }

    onShowCoverage(bounds);
  }
  return (
    <View>
      <ProductCard title="Bundled maps">
        <Text>World overview · US and Canada overview · Always available offline</Text>
        <Text>
          {mobileMapDataMetadata.label} ·{' '}
          {mobileMapDataMetadata.hasPrivateData
            ? 'Public and private bundled data'
            : 'Public bundled data'}{' '}
          · {mobileMapDataMetadata.featureCount.toLocaleString()} features
        </Text>
        {mobileMapDataMetadata.sources.map((source) => (
          <Text key={source.id}>
            {source.label}: {source.featureCount.toLocaleString()} features · {source.status}
          </Text>
        ))}
        {!mobileMapDataMetadata.hasPrivateData ? (
          <Text>No private data bundled in this build.</Text>
        ) : null}
        <ProductButton
          label="Show bundled coverage"
          hint="Open Explore at the bundled New York coverage"
          onPress={() => onShowCoverage([-79.7624, 40.4774, -71.7517, 45.0159])}
        />
      </ProductCard>
      {mobileMapDataMetadata.hasPrivateData ? (
        <ProductCard title="Bundled private packages">
          {mobileMapDataMetadata.sources
            .filter((source) => source.status.startsWith('private'))
            .map((source) => (
              <Text key={source.id}>
                {source.label} · Private · Shown · {source.featureCount.toLocaleString()} features
              </Text>
            ))}
          <Text>Included with this app build. Imported datasets are listed separately below.</Text>
        </ProductCard>
      ) : null}
      <ProductCard title="Installed public packages">
        <Text>Optional state packages installed on this device.</Text>
        {statePackages.ready && statePackages.packages.length === 0 ? (
          <Text>No public state packages installed.</Text>
        ) : null}
        <LaptopPackages service={statePackages} />
        <Text>
          Install a state.sqlite package from Files. Each state works offline as one package, with
          searchable places, trails and land records. Manual import limits do not apply.
        </Text>
        <ProductButton
          label="Install or update a state"
          hint="Choose a supported state package from Files"
          disabled={!statePackages.ready || statePackages.busy}
          busy={statePackages.busy}
          onPress={() => {
            void statePackages.install();
          }}
        />
        <Text accessibilityLiveRegion="polite">{statePackages.status}</Text>
        {statePackages.packages.map((entry) => (
          <View key={entry.state} style={{ gap: 6, marginTop: 12 }}>
            <Text style={{ fontWeight: '700' }}>
              {entry.name} · {entry.visible ? 'Shown' : 'Hidden'} · Public ·{' '}
              {entry.featureCount.toLocaleString()} features
            </Text>
            <Text>
              {(entry.installedBytes / 1048576).toFixed(1)} MiB installed · Packaged{' '}
              {entry.generatedAt.slice(0, 10)}
            </Text>
            {entry.integrityError && (
              <Text>Integrity check failed. Reinstall or remove this state package.</Text>
            )}
            <ProductButton
              label={entry.visible ? `Hide ${entry.name}` : `Show ${entry.name}`}
              hint="Save this state package’s map visibility"
              disabled={statePackages.busy || entry.integrityError}
              onPress={() => {
                void statePackages.change(entry.state, 'visibility');
              }}
            />
            <ProductButton
              label={`Show ${entry.name} coverage`}
              disabled={!entry.visible || statePackages.busy || entry.integrityError}
              hint="Fit the state package’s geographic coverage in the map"
              onPress={() => {
                onShowCoverage(entry.bounds);
              }}
            />
            {entry.canRollback && (
              <ProductButton
                label={`Restore previous ${entry.name} version`}
                hint="Switch to the previously verified state package"
                disabled={statePackages.busy}
                onPress={() => {
                  void statePackages.change(entry.state, 'rollback');
                }}
              />
            )}
            <ProductButton
              label={`Remove ${entry.name}`}
              hint="Remove this reference package while keeping your notes"
              disabled={statePackages.busy}
              onPress={() =>
                Alert.alert(
                  `Remove ${entry.name}?`,
                  'Your place notes and recordings will be kept.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => {
                        void statePackages.change(entry.state, 'remove');
                      },
                    },
                  ],
                )
              }
            />
            <Text>{entry.attribution}</Text>
            <ProductButton
              label={`Source notices for ${entry.name}`}
              hint="Read this package’s source licenses and historical limitations"
              onPress={() => Alert.alert(`${entry.name} source notices`, entry.notices)}
            />
          </View>
        ))}
      </ProductCard>
      <ProductCard title="Private imported datasets">
        {imports.ready && imports.datasets.length === 0 ? (
          <Text>No private datasets imported.</Text>
        ) : null}
        <Text>
          Add a GeoJSON file from Files. Points, lines and areas stay on this phone and work
          offline. Up to five datasets, 20 MiB and 20,000 features per file.
        </Text>

        <ProductButton
          label="Import dataset"

          hint="Choose a GeoJSON dataset from Files and add its features to the map"

          disabled={!imports.ready}

          busy={imports.busy}

          onPress={async () => {
            const dataset = await imports.importDataset();

            if (!dataset) return;

            showDatasetCoverage(dataset);
          }}
        />

        {imports.status ? <Text accessibilityLiveRegion="polite">{imports.status}</Text> : null}

        {!imports.ready && imports.status && !imports.status.startsWith('Install the IPA') ? (
          <ProductButton
            label="Clear unreadable imported datasets"

            hint="Remove only imported reference datasets so you can import your files again"

            destructive

            busy={imports.busy}

            onPress={() =>
              Alert.alert(
                'Clear imported datasets?',

                'Your place notes and recordings will be kept. You will need to import your dataset files again.',

                [
                  { text: 'Cancel', style: 'cancel' },

                  {
                    text: 'Clear datasets',

                    style: 'destructive',

                    onPress: () => {
                      void imports.resetDatasets();
                    },
                  },
                ],
              )
            }
          />
        ) : null}

        {imports.datasets.map((dataset) => (
          <View key={dataset.id} style={{ gap: 4, marginTop: 12 }}>
            <Text>
              {dataset.name} · {dataset.collection.features.length.toLocaleString()} features ·{' '}
              {dataset.visible ? 'Shown' : 'Hidden'} · private on-device
            </Text>

            <ProductButton
              label={dataset.visible ? `Hide ${dataset.name}` : `Show ${dataset.name}`}

              hint="Save whether this dataset appears on the map and in search"

              busy={imports.busy}

              onPress={() => imports.toggleDataset(dataset.id)}
            />

            <ProductButton
              label={`Show coverage of ${dataset.name}`}

              hint="Fit all geographic features from this imported dataset"

              disabled={!dataset.visible || imports.busy}

              onPress={() => showDatasetCoverage(dataset)}
            />

            <ProductButton
              label={`Remove ${dataset.name}`}

              hint="Remove this reference dataset while keeping your place notes and recordings"

              destructive

              busy={imports.busy}

              onPress={() =>
                Alert.alert(
                  'Remove dataset?',

                  `Remove ${dataset.name} from this app? Your place notes and recordings will be kept.`,

                  [
                    { text: 'Cancel', style: 'cancel' },

                    {
                      text: 'Remove',

                      style: 'destructive',

                      onPress: () => {
                        void imports.removeDataset(dataset.id);
                      },
                    },
                  ],
                )
              }
            />
          </View>
        ))}
      </ProductCard>

      <ProductCard title="Map information and licenses">
        <Text>
          No turn instructions, rerouting, or off-route alerts. Mapped places do not establish
          access or camping permission.
        </Text>
        <Text>
          Basemap: {worldBasemapManifest.attribution}. Overlay: {mobileMapDataMetadata.attribution}.
          Hike elevations: {bundledHikes.attribution}. Geometry simplified for display. Public-use
          GIS boundaries are not legal surveys.
        </Text>
        <ProductButton
          label="Map renderer licenses"
          hint="Read the complete map and font license notices"
          expanded={showLicenses}
          onPress={() => setShowLicenses(!showLicenses)}
        />
        {showLicenses ? (
          <Text selectable>
            {licenses.reactNative +
              '\n\n' +
              licenses.native +
              '\n\n' +
              licenses.safeAreaContext +
              '\n\n' +
              offlineMapLicenses.basemap +
              '\n\n' +
              offlineMapLicenses.font}
          </Text>
        ) : null}
      </ProductCard>
    </View>
  );
}
