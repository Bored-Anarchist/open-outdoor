import { describe, expect, it } from 'vitest';
import { FixtureMapAdapter, phase1OfflineMapFixture } from '../src/index.js';

describe('WP-108 fixture-backed offline map', () => {
  it('supports route and active-track display without navigation capabilities', () => {
    const map = new FixtureMapAdapter();
    map.setSelectedRoute(phase1OfflineMapFixture.routes[0] ?? null);
    map.setActiveTrack([[-74, 41]]);
    expect(map.capabilities).toMatchObject({
      offline: true,
      turnByTurn: false,
      rerouting: false,
    });
    expect(map.selectedRoute?.id).toBe('trail-hemlock-loop');
    expect(map.queryFeatures([-74, 41]).map(({ id }) => id)).toContain('poi-trailhead');
  });
  it('rejects any network-backed style resource', () => {
    expect(
      () =>
        new FixtureMapAdapter({
          ...phase1OfflineMapFixture,
          style: {
            ...phase1OfflineMapFixture.style,
            sources: {
              remote: { type: 'geojson', data: 'https://example.invalid/private.geojson' },
            },
          },
        }),
    ).toThrow('network resource');
  });
});
