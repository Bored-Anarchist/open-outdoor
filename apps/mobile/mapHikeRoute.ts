import type { ImportedMapDataset, OutdoorFeature, OutdoorFeatureSummary } from '@open-outdoor/map';
import { hikeRouteDetails, type HikeRouteDetails } from '@open-outdoor/shared/hike-route';

export function mapHikeRoute(
  feature: OutdoorFeatureSummary | null,
  datasets: readonly ImportedMapDataset[],
  detail: { summary: OutdoorFeatureSummary; geometry: OutdoorFeature['geometry'] | null } | null,
  bundle: { sourceSha256: string; hikes: Readonly<Record<string, HikeRouteDetails>> },
  sourceSha256: string,
): HikeRouteDetails | null {
  if (!feature || feature.properties.kind !== 'trail') return null;
  const geometry =
    detail?.summary.id === feature.id
      ? detail.geometry
      : datasets
          .filter((dataset) => dataset.visible)
          .flatMap((dataset) => dataset.collection.features)
          .find((candidate) => candidate.id === feature.id)?.geometry;
  if (geometry?.type === 'LineString' || geometry?.type === 'MultiLineString')
    return hikeRouteDetails(geometry);
  // Private bundled trails also use verified profiles; origin alone does not identify an import.
  return bundle.sourceSha256 === sourceSha256 ? (bundle.hikes[feature.id] ?? null) : null;
}
