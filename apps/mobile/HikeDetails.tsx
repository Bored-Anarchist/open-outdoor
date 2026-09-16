import { useState } from 'react';
import { View } from 'react-native';
import { hikeSampleIndex, type HikeRouteDetails } from '@open-outdoor/shared/hike-route';
import { ProductText as Text } from './accessibility';
import { ProductButton, usePalette } from './ProductComponents';

export function HikeDetails({
  route,
  selectedSample,
  onSampleSelect,
  onShowRoute,
}: {
  readonly route: HikeRouteDetails;
  readonly selectedSample: number | null;
  readonly onSampleSelect: (index: number) => void;
  readonly onShowRoute: () => void;
}) {
  const palette = usePalette();
  const [metric, setMetric] = useState(false);
  const [width, setWidth] = useState(300);
  const distance = (meters: number) =>
    `${(meters / (metric ? 1000 : 1609.344)).toFixed(1)} ${metric ? 'km' : 'mi'}`;
  const elevation = (meters: number) =>
    `${Math.round(meters * (metric ? 1 : 3.28084)).toLocaleString()} ${metric ? 'm' : 'ft'}`;
  const duration = Math.max(
    1,
    Math.round((route.distanceM / 4000) * 60 + ((route.ascentM ?? 0) / 600) * 60),
  );
  const time =
    duration >= 60 ? `${Math.floor(duration / 60)} h ${duration % 60} min` : `${duration} min`;
  const height = 150;
  const minimum = route.minimumElevationM ?? 0;
  const maximum = route.maximumElevationM ?? 0;
  const range = Math.max(10, maximum - minimum);
  const x = (distanceM: number) =>
    (distanceM / Math.max(1, route.distanceM)) * Math.max(1, width - 12) + 6;
  const y = (elevationM: number) => height - 12 - ((elevationM - minimum) / range) * (height - 24);
  const sampleIndex =
    selectedSample === null ? 0 : Math.max(0, Math.min(route.samples.length - 1, selectedSample));
  const sample = route.samples[sampleIndex];
  const chartAvailable =
    route.elevationSource !== 'unavailable' && route.samples.length >= 2 && route.distanceM > 0;
  const select = (locationX: number) =>
    onSampleSelect(hikeSampleIndex(route, (locationX - 6) / Math.max(1, width - 12)));
  const stats = [
    ['Mapped length', distance(route.distanceM)],
    ['Elevation gain', route.ascentM === undefined ? 'Unavailable' : elevation(route.ascentM)],
    ['Elevation loss', route.descentM === undefined ? 'Unavailable' : elevation(route.descentM)],
    ['Est. walking time', time],
  ];
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontWeight: '700', fontSize: 20 }}>
        Hike overview
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {stats.map(([label, value]) => (
          <View
            key={label}
            style={{
              minWidth: '44%',
              flex: 1,
              padding: 12,
              borderRadius: 12,
              backgroundColor: palette.selected,
            }}
          >
            <Text style={{ color: palette.muted, fontSize: 13 }}>{label}</Text>
            <Text style={{ fontSize: 20, fontWeight: '700' }}>{value}</Text>
          </View>
        ))}
      </View>
      <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
        Elevation profile
      </Text>
      {chartAvailable ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text>Low {elevation(minimum)}</Text>
            <Text>High {elevation(maximum)}</Text>
          </View>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Hike elevation profile"
            accessibilityHint="Drag across the chart to inspect the path. Swipe up or down with a screen reader to move along it."
            accessibilityValue={{
              min: 0,
              max: route.samples.length - 1,
              now: sampleIndex,
              text:
                sample && sample[1] !== null
                  ? `${distance(sample[0])}, elevation ${elevation(sample[1])}`
                  : 'No selected point',
            }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) =>
              onSampleSelect(
                Math.max(
                  0,
                  Math.min(
                    route.samples.length - 1,
                    sampleIndex + (event.nativeEvent.actionName === 'increment' ? 1 : -1),
                  ),
                ),
              )
            }
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => true}
            onResponderGrant={(event) => select(event.nativeEvent.locationX)}
            onResponderMove={(event) => select(event.nativeEvent.locationX)}
            style={{
              height,
              backgroundColor: palette.surface,
              borderBottomWidth: 1,
              borderColor: palette.border,
            }}
          >
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: '100%', height: '100%' }}
            >
              {route.samples.slice(1).map((current, index) => {
                const previous = route.samples[index]!;
                if (previous[1] === null || current[1] === null || previous[4] !== current[4])
                  return null;
                const left = x(previous[0]),
                  right = x(current[0]);
                const top = y(previous[1]),
                  bottom = y(current[1]);
                const length = Math.hypot(right - left, bottom - top);
                return (
                  <View key={index}>
                    <View
                      style={{
                        position: 'absolute',
                        left,
                        top: Math.max(top, bottom),
                        width: Math.max(1, right - left),
                        height: height - Math.max(top, bottom),
                        backgroundColor: palette.accent,
                        opacity: 0.16,
                      }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        left: (left + right) / 2 - length / 2,
                        top: (top + bottom) / 2 - 1.5,
                        width: length,
                        height: 3,
                        backgroundColor: palette.accent,
                        transform: [{ rotate: `${Math.atan2(bottom - top, right - left)}rad` }],
                      }}
                    />
                  </View>
                );
              })}
              {sample && sample[1] !== null ? (
                <>
                  <View
                    style={{
                      position: 'absolute',
                      left: x(sample[0]) - 1,
                      top: 0,
                      height,
                      width: 2,
                      backgroundColor: palette.text,
                      opacity: 0.5,
                    }}
                  />
                  <View
                    style={{
                      position: 'absolute',
                      left: x(sample[0]) - 5,
                      top: y(sample[1]) - 5,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: palette.text,
                      borderWidth: 2,
                      borderColor: palette.surface,
                    }}
                  />
                </>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text>0 {metric ? 'km' : 'mi'}</Text>
            <Text>{distance(route.distanceM)}</Text>
          </View>
          {sample && sample[1] !== null ? (
            <Text>
              At {distance(sample[0])}: {elevation(sample[1])} elevation.{' '}
              {selectedSample !== null
                ? 'This point is marked on the map.'
                : 'Drag the chart to inspect a point on the map.'}
            </Text>
          ) : null}
          <Text style={{ color: palette.muted }}>
            {route.elevationSource === 'terrain-model'
              ? 'Approximate terrain elevations; the trail surface and actual climb may differ.'
              : 'Profile from the elevations supplied in your dataset.'}
          </Text>
        </>
      ) : (
        <Text>
          No complete elevation profile is available for this path. Import a GeoJSON route with
          elevations to show its profile.
        </Text>
      )}
      <Text>
        Mapped path:{' '}
        {route.segmentCount > 1
          ? `${route.segmentCount} separate segments`
          : route.closedLoop
            ? 'Closed loop'
            : 'Open segment'}
        .
      </Text>
      <ProductButton
        label="Show expected path"
        hint="Fit the selected mapped trail and its endpoint markers"
        onPress={onShowRoute}
      />
      <Text style={{ color: palette.muted }}>
        This is the source’s mapped trail, which may be one section of a longer hike. A mapped
        endpoint is not a verified trailhead. Walking time assumes 4 km/h plus one hour per 600 m
        climbed; it excludes stops and conditions.
      </Text>
      <ProductButton
        label={metric ? 'Use miles and feet' : 'Use kilometres and metres'}
        hint="Change units for hike statistics and the elevation chart"
        onPress={() => setMetric(!metric)}
      />
    </View>
  );
}
