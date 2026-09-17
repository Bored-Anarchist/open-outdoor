import { describe, expect, it } from 'vitest';
import {
  hikeDistanceM,
  hikeRouteDetails,
  hikeSampleIndex,
  withHikeElevations,
} from '../src/hike-route';

describe('offline hike planning geometry', () => {
  it('calculates geodesic length and a genuine elevation profile with endpoints', () => {
    const hike = hikeRouteDetails({
      type: 'LineString',
      coordinates: [
        [0, 0, 10],
        [0.01, 0, 110],
        [0.02, 0, 60],
      ],
    });
    expect(hike.distanceM).toBeCloseTo(2224, -1);
    expect(hike.start).toEqual([0, 0]);
    expect(hike.end).toEqual([0.02, 0]);
    expect(hike.ascentM).toBeGreaterThan(90);
    expect(hike.descentM).toBeGreaterThan(40);
    expect(hike.samples[0]?.[1]).toBe(10);
    expect(hike.samples.at(-1)?.[1]).toBe(60);
    expect(hike.elevationSource).toBe('dataset');
    expect(hike.closedLoop).toBe(false);
  });
  it('never bridges gaps or counts the elevation jump between separate segments as climbing', () => {
    const hike = hikeRouteDetails({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0, 10],
          [0.01, 0, 20],
        ],
        [
          [1, 0, 1000],
          [1.01, 0, 1010],
        ],
      ],
    });
    expect(hike.distanceM).toBeCloseTo(2224, -1);
    expect(hike.ascentM).toBe(20);
    expect(hike.segmentCount).toBe(2);
    expect(hike.closedLoop).toBe(false);
    expect(new Set(hike.samples.map((sample) => sample[4])).size).toBe(2);
  });
  it('does not invent elevations or a flat chart for two-dimensional or partially elevated routes', () => {
    const hike = hikeRouteDetails({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0.01, 0],
      ],
    });
    expect(hike.elevationSource).toBe('unavailable');
    expect(hike.ascentM).toBeUndefined();
    expect(hike.samples.every((sample) => sample[1] === null)).toBe(true);
    const partial = withHikeElevations(hike, [10, Number.NaN], 'terrain-model');
    expect(partial.elevationSource).toBe('unavailable');
    expect(partial.minimumElevationM).toBeUndefined();
  });
  it('bounds long profiles and scrubs by distance rather than vertex index', () => {
    const hike = hikeRouteDetails({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0.0001, 0],
        [10, 0],
      ],
    });
    expect(hike.samples.length).toBeLessThanOrEqual(128);
    expect(hikeSampleIndex(hike, -1)).toBe(0);
    expect(hikeSampleIndex(hike, 2)).toBe(hike.samples.length - 1);
    expect(hike.samples[hikeSampleIndex(hike, 0.5)]![0]).toBeCloseTo(hike.distanceM / 2, -4);
  });
  it('recognizes a mapped loop and handles the short arc across the antimeridian', () => {
    expect(
      hikeRouteDetails({
        type: 'LineString',
        coordinates: [
          [0, 0],
          [0.01, 0],
          [0, 0],
        ],
      }).closedLoop,
    ).toBe(true);
    expect(hikeDistanceM([179.99, 0], [-179.99, 0])).toBeCloseTo(2224, -1);
    const crossing = hikeRouteDetails({
      type: 'LineString',
      coordinates: [
        [179.99, 0, 10],
        [-179.99, 0, 20],
      ],
    });
    expect(crossing.samples.every((sample) => Math.abs(sample[2]) > 179.9)).toBe(true);
    expect(() =>
      hikeRouteDetails({
        type: 'LineString',
        coordinates: [
          [181, 0],
          [0, 0],
        ],
      }),
    ).toThrow(RangeError);
  });
  it('preserves sharp altitude changes at unevenly spaced vertices on short imported hikes', () => {
    const hike = hikeRouteDetails({
      type: 'LineString',
      coordinates: [
        [0, 0, 100],
        [0.00001, 0, 300],
        [0.0005, 0, 100],
      ],
    });
    expect(hike.ascentM).toBe(200);
    expect(hike.descentM).toBe(200);
    expect(hike.samples[1]).toEqual([1.1, 300, 0.00001, 0, 0]);
  });
  it('treats non-terrestrial or overflow-sized altitude values as unavailable', () => {
    const hike = hikeRouteDetails({
      type: 'LineString',
      coordinates: [
        [0, 0, 1e308],
        [0.01, 0, 1e308],
      ],
    });
    expect(hike.elevationSource).toBe('unavailable');
    expect(hike.ascentM).toBeUndefined();
    expect(hike.samples.every((sample) => sample[1] === null)).toBe(true);
  });
});
