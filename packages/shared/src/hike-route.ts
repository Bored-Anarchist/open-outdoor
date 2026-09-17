/** Offline planning geometry; distances never bridge separate mapped segments. */
export interface HikeGeometry {
  readonly type: 'LineString' | 'MultiLineString';
  readonly coordinates: readonly number[][] | readonly number[][][];
}
/** [distance along mapped segments (m), elevation (m) or null, lon, lat, segment]. */
export type HikeProfileSample = readonly [number, number | null, number, number, number];
export interface HikeRouteDetails {
  readonly distanceM: number;
  readonly segmentCount: number;
  readonly closedLoop: boolean;
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly samples: readonly HikeProfileSample[];
  readonly elevationSource: 'dataset' | 'terrain-model' | 'recorded' | 'unavailable';
  readonly ascentM?: number;
  readonly descentM?: number;
  readonly minimumElevationM?: number;
  readonly maximumElevationM?: number;
}

export function hikeDistanceM(left: readonly number[], right: readonly number[]): number {
  const radians = Math.PI / 180;
  const latitude = ((right[1] ?? 0) - (left[1] ?? 0)) * radians;
  const longitude = ((right[0] ?? 0) - (left[0] ?? 0)) * radians;
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos((left[1] ?? 0) * radians) *
      Math.cos((right[1] ?? 0) * radians) *
      Math.sin(longitude / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

/** Missing elevations remain missing; disconnected parts never add climbing between parts. */
export function withHikeElevations(
  route: HikeRouteDetails,
  elevations: readonly (number | null)[],
  source: 'dataset' | 'terrain-model',
): HikeRouteDetails {
  const samples: HikeProfileSample[] = route.samples.map((sample, i) => [
    sample[0],
    typeof elevations[i] === 'number' &&
    Number.isFinite(elevations[i]) &&
    Math.abs(elevations[i]!) <= 100_000
      ? Math.round(elevations[i]! * 10) / 10
      : null,
    sample[2],
    sample[3],
    sample[4],
  ]);
  const complete = samples.length >= 2 && samples.every((sample) => sample[1] !== null);
  let ascentM = 0;
  let descentM = 0;
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1]!;
    const current = samples[i]!;
    if (previous[4] !== current[4] || previous[1] === null || current[1] === null) continue;
    const difference = current[1] - previous[1];
    ascentM += Math.max(0, difference);
    descentM += Math.max(0, -difference);
  }
  const {
    ascentM: _ascent,
    descentM: _descent,
    minimumElevationM: _min,
    maximumElevationM: _max,
    ...base
  } = route;
  return {
    ...base,
    samples,
    elevationSource: complete ? source : 'unavailable',
    ...(complete
      ? {
          ascentM: Math.round(ascentM),
          descentM: Math.round(descentM),
          minimumElevationM: Math.min(...samples.map((sample) => sample[1]!)),
          maximumElevationM: Math.max(...samples.map((sample) => sample[1]!)),
        }
      : {}),
  };
}

export function hikeRouteDetails(geometry: HikeGeometry): HikeRouteDetails {
  const parts = (
    geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
  ) as readonly (readonly (readonly number[])[])[];
  if (
    !parts.length ||
    parts.some(
      (part) =>
        part.length < 2 ||
        part.some(
          (point) =>
            point.length < 2 ||
            !point.every(Number.isFinite) ||
            Math.abs(point[0]!) > 180 ||
            Math.abs(point[1]!) > 90,
        ),
    )
  ) {
    throw new RangeError('A hike needs valid WGS84 line geometry.');
  }
  const lengths = parts.map((part) =>
    part.slice(1).reduce((total, point, i) => total + hikeDistanceM(part[i]!, point), 0),
  );
  const distanceM = lengths.reduce((a, b) => a + b, 0);
  const start = parts[0]![0]!;
  const end = parts.at(-1)!.at(-1)!;
  const samples: HikeProfileSample[] = [];
  // Preserve every supplied altitude on short imports, including sharp or unevenly spaced climbs.
  if (
    parts.reduce((count, part) => count + part.length, 0) <= 128 &&
    parts.every((part) => part.every((point) => point[2] !== undefined))
  ) {
    let along = 0;
    parts.forEach((part, segment) =>
      part.forEach((point, i) => {
        if (i > 0) along += hikeDistanceM(part[i - 1]!, point);
        samples.push([Math.round(along * 10) / 10, point[2]!, point[0]!, point[1]!, segment]);
      }),
    );
    return withHikeElevations(
      {
        distanceM: Math.round(distanceM),
        segmentCount: parts.length,
        closedLoop: parts.length === 1 && distanceM >= 40 && hikeDistanceM(start, end) <= 20,
        start: [start[0]!, start[1]!],
        end: [end[0]!, end[1]!],
        samples,
        elevationSource: 'unavailable',
      },
      samples.map((sample) => sample[1]),
      'dataset',
    );
  }
  let offset = 0;
  const remaining = Math.max(0, 128 - parts.length * 2);
  parts.forEach((part, segment) => {
    const length = lengths[segment]!;
    // Every displayed part gets endpoints; very fragmented features retain geometry but omit the chart.
    const count =
      2 +
      Math.min(
        Math.max(0, Math.ceil(length / 100) - 1),
        Math.floor((remaining * length) / Math.max(1, distanceM)),
      );
    let edge = 1;
    let before = 0;
    let edgeLength = hikeDistanceM(part[0]!, part[1]!);
    if (parts.length <= 64)
      for (let i = 0; i < count; i++) {
        const target = (length * i) / (count - 1);
        while (edge < part.length - 1 && before + edgeLength < target) {
          before += edgeLength;
          edge++;
          edgeLength = hikeDistanceM(part[edge - 1]!, part[edge]!);
        }
        const left = part[edge - 1]!;
        const right = part[edge]!;
        const ratio = edgeLength > 0 ? Math.max(0, Math.min(1, (target - before) / edgeLength)) : 0;
        // Take the short longitude arc, including routes crossing the antimeridian.
        const longitudeDelta = ((right[0]! - left[0]! + 540) % 360) - 180;
        const longitude = ((left[0]! + longitudeDelta * ratio + 540) % 360) - 180;
        const latitude = left[1]! + (right[1]! - left[1]!) * ratio;
        const elevation =
          left[2] !== undefined && right[2] !== undefined
            ? left[2] + (right[2] - left[2]) * ratio
            : null;
        samples.push([
          Math.round((offset + target) * 10) / 10,
          elevation,
          Math.round(longitude * 1e6) / 1e6,
          Math.round(latitude * 1e6) / 1e6,
          segment,
        ]);
      }
    offset += length;
  });
  return withHikeElevations(
    {
      distanceM: Math.round(distanceM),
      segmentCount: parts.length,
      closedLoop: parts.length === 1 && distanceM >= 40 && hikeDistanceM(start, end) <= 20,
      start: [start[0]!, start[1]!],
      end: [end[0]!, end[1]!],
      samples,
      elevationSource: 'unavailable',
    },
    samples.map((sample) => sample[1]),
    'dataset',
  );
}

/** Locate the nearest displayed profile point without assuming uniformly spaced samples. */
export function hikeSampleIndex(route: HikeRouteDetails, fraction: number): number {
  const target = Math.max(0, Math.min(1, fraction)) * route.distanceM;
  let best = 0;
  route.samples.forEach((sample, i) => {
    if (Math.abs(sample[0] - target) < Math.abs((route.samples[best]?.[0] ?? 0) - target)) best = i;
  });
  return best;
}
