import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { ProductText as Text } from './accessibility';
import {
  ProductButton,
  ProductCard,
  ProductDisclosure,
  ProductHeader,
  ProductMetric,
  ProductRow,
  usePalette,
} from './ProductComponents';
import { LaptopPackages } from './LaptopPackages';
import type { StatePackagesService } from './useStatePackages';
import type { ImportedMapDatasetsService } from './useImportedMapDatasets';
import type { ImportedMapDataset } from '@open-outdoor/map';
import {
  mobileMapDataMetadata,
  mobileHikeData as bundledHikes,
} from '@open-outdoor/mobile-map-data';
import worldBasemapManifest from '../../packages/map/src/assets/world-basemap.manifest.json';
import licenses from './map-licenses.json';
import offlineMapLicenses from './offline-map-licenses.json';

function InventoryRow({
  title,
  subtitle,
  visible,
  disabled,
  onOpen,
  onToggle,
  privateData = false,
}: {
  title: string;
  subtitle: string;
  visible: boolean;
  disabled: boolean;
  privateData?: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const p = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: p.surface,
        borderRadius: 14,
        paddingRight: 16,
        gap: 8,
      }}
    >
      <View style={{ flex: 1 }}>
        <ProductRow
          title={title}
          subtitle={`${visible ? 'Shown' : 'Hidden'} · ${subtitle}`}
          icon={privateData ? 'private' : 'folder'}
          onPress={onOpen}
        />
      </View>
      <Switch
        accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${title}`}
        accessibilityHint="Changes map and search visibility"
        value={visible}
        disabled={disabled}
        onValueChange={onToggle}
        trackColor={{ false: p.border, true: p.accent }}
        thumbColor={visible ? p.onAccent : p.surface}
        style={{ minHeight: 52, minWidth: 52 }}
      />
    </View>
  );
}

export function MapSettings({
  imports,
  statePackages,
  onShowCoverage,
  onBack,
}: {
  imports: ImportedMapDatasetsService;
  statePackages: StatePackagesService;
  onShowCoverage: (bounds: [number, number, number, number]) => void;
  onBack?: () => void;
}) {
  const p = usePalette();
  const [page, setPage] = useState<
    'index' | 'bundled' | 'public' | 'private' | 'add' | 'import' | 'laptop'
  >('index');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<ImportedMapDataset | null>(null);
  const entry = statePackages.packages.find((item) => item.state === selectedId);
  const dataset = imports.datasets.find((item) => item.id === selectedId);
  const title =
    page === 'index'
      ? 'Maps'
      : page === 'public'
        ? (entry?.name ?? 'Package removed')
        : page === 'private'
          ? (dataset?.name ?? 'Dataset removed')
          : {
              bundled: 'Bundled maps',
              add: 'Add a map',
              import: 'Review import',
              laptop: 'Connect to laptop',
            }[page];
  function showDatasetCoverage(value: ImportedMapDataset) {
    const bounds: [number, number, number, number] = [180, 90, -180, -90];
    for (const feature of value.index.features) {
      bounds[0] = Math.min(bounds[0], feature.bounds[0]);
      bounds[1] = Math.min(bounds[1], feature.bounds[1]);
      bounds[2] = Math.max(bounds[2], feature.bounds[2]);
      bounds[3] = Math.max(bounds[3], feature.bounds[3]);
    }
    onShowCoverage(bounds);
  }
  const remove = (name: string, run: () => Promise<unknown>) =>
    Alert.alert(`Remove ${name}?`, 'Your notes and recordings will be kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void run().then(() => setPage('index'));
        },
      },
    ]);
  const group = (label: string) => (
    <Text
      accessibilityRole="header"
      style={{ color: p.muted, fontSize: 14, fontWeight: '700', marginTop: 12 }}
    >
      {label}
    </Text>
  );
  return (
    <View style={{ gap: 12 }}>
      <ProductHeader
        title={title}
        onBack={() => {
          if (page === 'index') onBack?.();
          else {
            setDraft(null);
            setPage(page === 'import' ? 'add' : 'index');
          }
        }}
      />
      {page === 'index' ? (
        <>
          {group('Bundled')}
          <ProductRow
            title="World + regional map"
            subtitle="Always available offline"
            onPress={() => setPage('bundled')}
          />
          {group('Public packages')}
          {statePackages.ready && !statePackages.packages.length ? (
            <Text style={{ color: p.muted }}>No public packages</Text>
          ) : null}
          {statePackages.packages.map((item) => (
            <InventoryRow
              key={item.state}
              title={item.name}
              subtitle={`${(item.installedBytes / 1048576).toFixed(1)} MiB${item.integrityError ? ' · Integrity error' : ''}`}
              visible={item.visible}
              disabled={statePackages.busy || !!item.integrityError}
              onOpen={() => {
                setSelectedId(item.state);
                setPage('public');
              }}
              onToggle={() => {
                void statePackages.change(item.state, 'visibility');
              }}
            />
          ))}
          {group('Private data')}
          {mobileMapDataMetadata.hasPrivateData ? (
            <ProductRow
              title="Bundled private sources"
              subtitle="Included in this build"
              icon="private"
              onPress={() => setPage('bundled')}
            />
          ) : null}
          {imports.ready && !imports.datasets.length ? (
            <Text style={{ color: p.muted }}>No private datasets</Text>
          ) : null}
          {imports.datasets.map((item) => (
            <InventoryRow
              key={item.id}
              title={item.name}
              subtitle={`${item.collection.features.length.toLocaleString()} features`}
              visible={item.visible}
              privateData
              disabled={imports.busy}
              onOpen={() => {
                setSelectedId(item.id);
                setPage('private');
              }}
              onToggle={() => {
                void imports.toggleDataset(item.id);
              }}
            />
          ))}
          {statePackages.status ? (
            <Text accessibilityLiveRegion="polite">{statePackages.status}</Text>
          ) : null}
          {imports.status ? <Text accessibilityLiveRegion="polite">{imports.status}</Text> : null}
          {!imports.ready && imports.status && !imports.status.startsWith('Install the IPA') ? (
            <ProductButton
              label="Reset unreadable datasets…"
              hint="Confirm before clearing imported references; keep notes and recordings"
              destructive
              busy={imports.busy}
              onPress={() =>
                Alert.alert(
                  'Clear imported datasets?',
                  'Notes and recordings are kept. Import your dataset files again.',
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
          <View style={{ marginTop: 20 }}>
            <ProductButton
              label="Add a map"
              hint="Install from Files or laptop, or import a private dataset"
              primary
              onPress={() => setPage('add')}
            />
          </View>
        </>
      ) : null}
      {page === 'bundled' ? (
        <>
          <ProductCard title={mobileMapDataMetadata.label}>
            <Text>World overview · US and Canada overview</Text>
            <Text>
              {mobileMapDataMetadata.featureCount.toLocaleString()} features · Always shown
            </Text>
            <ProductButton
              label="Coverage"
              hint="Show the bundled New York coverage on Explore"
              onPress={() => onShowCoverage([-79.7624, 40.4774, -71.7517, 45.0159])}
            />
          </ProductCard>
          <ProductDisclosure title="Sources">
            {mobileMapDataMetadata.sources.map((source) => (
              <Text key={source.id}>
                {source.label} · {source.featureCount.toLocaleString()} features · {source.status}
              </Text>
            ))}
            {!mobileMapDataMetadata.hasPrivateData ? (
              <Text>No private data bundled in this build.</Text>
            ) : null}
          </ProductDisclosure>
        </>
      ) : null}
      {page === 'public' && entry ? (
        <>
          <Text style={{ color: p.accent }}>Public</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <ProductMetric label="Features" value={entry.featureCount.toLocaleString()} />
            <ProductMetric
              label="Storage"
              value={`${(entry.installedBytes / 1048576).toFixed(1)} MiB`}
            />
          </View>
          {entry.integrityError ? (
            <Text accessibilityRole="alert" style={{ color: p.danger }}>
              Integrity check failed. Reinstall or remove this package.
            </Text>
          ) : null}
          <ProductRow
            title="Show on map"
            subtitle={entry.visible ? 'Shown in map and search' : 'Hidden from map and search'}
            checked={entry.visible}
            disabled={statePackages.busy || !!entry.integrityError}
            onPress={() => statePackages.change(entry.state, 'visibility')}
          />
          <ProductRow
            title="Coverage"
            subtitle="Open on Explore"
            icon="explore"
            disabled={!entry.visible || statePackages.busy || !!entry.integrityError}
            onPress={() => onShowCoverage(entry.bounds)}
          />
          <ProductDisclosure title="Sources">
            <Text>{entry.attribution}</Text>
            <Text>Packaged {entry.generatedAt.slice(0, 10)}</Text>
            <Text selectable>{entry.notices}</Text>
          </ProductDisclosure>
          {entry.canRollback ? (
            <ProductButton
              label="Restore previous…"
              hint="Confirm the previous verified package"
              disabled={statePackages.busy}
              onPress={() =>
                Alert.alert(
                  'Restore previous package?',
                  `Replace ${entry.name} with its previous verified snapshot. Notes and recordings are kept.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Restore previous',
                      onPress: () => {
                        void statePackages.change(entry.state, 'rollback');
                      },
                    },
                  ],
                )
              }
            />
          ) : null}
          <ProductButton
            label="Remove package…"
            hint="Confirm removal; keep private notes and recordings"
            destructive
            disabled={statePackages.busy}
            onPress={() => remove(entry.name, () => statePackages.change(entry.state, 'remove'))}
          />
          <Text accessibilityLiveRegion="polite">{statePackages.status}</Text>
        </>
      ) : null}
      {page === 'private' && dataset ? (
        <>
          <Text style={{ color: p.accent }}>Private on this device</Text>
          <ProductMetric
            label="Features"
            value={dataset.collection.features.length.toLocaleString()}
          />
          <ProductRow
            title="Show on map"
            subtitle={dataset.visible ? 'Shown in map and search' : 'Hidden from map and search'}
            checked={dataset.visible}
            disabled={imports.busy}
            onPress={() => imports.toggleDataset(dataset.id)}
          />
          <ProductRow
            title="Coverage"
            subtitle="Open on Explore"
            icon="explore"
            disabled={!dataset.visible || imports.busy}
            onPress={() => showDatasetCoverage(dataset)}
          />
          <ProductDisclosure title="File details">
            <Text>GeoJSON · {dataset.name}</Text>
            <Text>Stored privately on this device. This label does not grant sharing rights.</Text>
          </ProductDisclosure>
          <ProductButton
            label="Remove dataset…"
            hint="Confirm removal; keep private notes and recordings"
            destructive
            disabled={imports.busy}
            onPress={() => remove(dataset.name, () => imports.removeDataset(dataset.id))}
          />
          <Text accessibilityLiveRegion="polite">{imports.status}</Text>
        </>
      ) : null}
      {page === 'add' ? (
        <>
          <ProductRow
            title="From Files"
            subtitle="Install a public state package"
            disabled={!statePackages.ready || statePackages.busy}
            onPress={() => statePackages.install()}
          />
          <ProductRow
            title="From laptop"
            subtitle="Use the same Wi-Fi"
            onPress={() => setPage('laptop')}
          />
          <ProductRow
            title="Import GeoJSON"
            subtitle="Private on this device"
            icon="private"
            disabled={!imports.ready || imports.busy}
            onPress={async () => {
              const value = await imports.prepareDataset();
              if (value) {
                setDraft(value);
                setPage('import');
              }
            }}
          />
          <Text accessibilityLiveRegion="polite">{statePackages.status || imports.status}</Text>
          <ProductDisclosure title="Import limits">
            <Text>
              Up to 5 private datasets, 20 MiB and 20,000 features per file. Public state packages
              use separate limits.
            </Text>
          </ProductDisclosure>
        </>
      ) : null}
      {page === 'import' && draft ? (
        <>
          <Text style={{ color: p.accent }}>Private</Text>
          <Text style={{ fontSize: 23 }}>{draft.name}</Text>
          <ProductMetric
            label="Features"
            value={draft.collection.features.length.toLocaleString()}
          />
          <Text>Points, lines and areas checked.</Text>
          <ProductDisclosure title="Limits">
            <Text>5 datasets · 20 MiB · 20,000 features per file</Text>
          </ProductDisclosure>
          <ProductButton
            label="Import dataset"
            hint="Save this checked dataset privately"
            primary
            busy={imports.busy}
            onPress={async () => {
              const saved = await imports.commitDataset(draft);
              if (saved) {
                setDraft(null);
                setPage('index');
              }
            }}
          />
          <Text accessibilityLiveRegion="polite">{imports.status}</Text>
        </>
      ) : null}
      {page === 'laptop' ? <LaptopPackages service={statePackages} embedded /> : null}
    </View>
  );
}

export function MapNotices() {
  return (
    <View style={{ gap: 16 }}>
      <ProductCard title="Open Outdoor">
        <Text>Offline maps and private hikes</Text>
      </ProductCard>
      <ProductDisclosure title="Map sources">
        <Text>
          Basemap: {worldBasemapManifest.attribution}. Overlay: {mobileMapDataMetadata.attribution}.
          Hike elevations: {bundledHikes.attribution}. Geometry simplified for display. Public-use
          GIS boundaries are not legal surveys.
        </Text>
      </ProductDisclosure>
      <ProductDisclosure title="Licenses">
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
      </ProductDisclosure>
      <ProductDisclosure title="Map limits" icon="warning">
        <Text>No turn instructions, rerouting, or off-route alerts.</Text>
        <Text>Mapped places do not establish access or camping permission.</Text>
      </ProductDisclosure>
    </View>
  );
}
