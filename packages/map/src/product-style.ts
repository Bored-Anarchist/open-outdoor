import { palettes, type Appearance } from '@open-outdoor/shared';
import type { BasemapJson, LocalBasemapStyle } from './basemap';

export const campingLegend = [
  {
    id: 'generally-eligible',
    label: 'Generally eligible',
    explanation: 'General rules suggest eligibility; site restrictions still apply.',
    mark: 'outline',
    tone: 'info',
  },
  {
    id: 'verified-allowed',
    label: 'Verified allowed',
    explanation: 'Source evidence supports camping, subject to its date and conditions.',
    mark: 'check',
    tone: 'success',
  },
  {
    id: 'restricted',
    label: 'Restricted',
    explanation: 'Read applicable restrictions before entering or camping.',
    mark: 'triangle',
    tone: 'caution',
  },
  {
    id: 'permit-required',
    label: 'Permit required',
    explanation: 'Obtain the required permit from the managing authority.',
    mark: 'square',
    tone: 'caution',
  },
  {
    id: 'prohibited',
    label: 'Prohibited',
    explanation: 'Camping is prohibited by the available rules.',
    mark: 'bar',
    tone: 'danger',
  },
  {
    id: 'temporary-closure',
    label: 'Temporary closure',
    explanation: 'Review closure scope and effective dates; do not assume access.',
    mark: 'cross',
    tone: 'danger',
  },
  {
    id: 'unknown',
    label: 'Unknown',
    explanation: 'No access permission can be inferred.',
    mark: 'question',
    tone: 'caution',
  },
] as const;

/** All data are supplied locally. No remote glyphs, sprites, tiles or style imports. */
export interface ProductMapData {
  readonly base: BasemapJson;
  readonly places: BasemapJson;
  readonly selectedRoute: BasemapJson;
  readonly activeTrack: BasemapJson;
  readonly location: BasemapJson;
}
const empty: BasemapJson = { type: 'FeatureCollection', features: [] };
export function createProductMapStyle(
  appearance: Appearance,
  data: Partial<ProductMapData> = {},
): LocalBasemapStyle {
  const p = palettes[appearance];
  const kind = (value: string): BasemapJson => ['==', ['get', 'kind'], value];
  const line = (
    id: string,
    source: string,
    color: string,
    width: number,
    extra: Record<string, BasemapJson> = {},
  ) => ({
    id,
    type: 'line',
    source,
    paint: { 'line-color': color, 'line-width': width },
    ...extra,
  });
  return {
    sprites: [],
    fonts: [],
    document: {
      version: 8,
      name: `Open Outdoor / ${appearance}`,
      metadata: { 'open-outdoor:style-version': 1, 'open-outdoor:license': 'Apache-2.0' },
      sources: {
        base: { type: 'geojson', data: data.base ?? empty },
        places: {
          type: 'geojson',
          data: data.places ?? empty,
          cluster: true,
          clusterRadius: 44,
          clusterMaxZoom: 13,
        },
        selected: { type: 'geojson', data: data.selectedRoute ?? empty },
        active: { type: 'geojson', data: data.activeTrack ?? empty },
        location: { type: 'geojson', data: data.location ?? empty },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': p.background } },
        {
          id: 'land',
          type: 'fill',
          source: 'base',
          filter: kind('land'),
          paint: { 'fill-color': p.land, 'fill-outline-color': p.border },
        },
        {
          id: 'water',
          type: 'fill',
          source: 'base',
          filter: kind('water'),
          paint: { 'fill-color': p.water },
        },
        line('road', 'base', p.border, 2, { filter: kind('road') }),
        line('trail', 'base', p.accent, 3, {
          filter: kind('trail'),
          paint: { 'line-color': p.accent, 'line-width': 3, 'line-dasharray': [2, 1] },
        }),
        ...campingLegend.map((entry) =>
          line(
            `status-${entry.id}`,
            'base',
            entry.tone === 'info' ? p.accent : p[entry.tone],
            entry.id === 'temporary-closure' ? 5 : 3,
            {
              filter: ['all', kind('land'), ['==', ['get', 'campingStatus'], entry.id]],
              paint: {
                'line-color': entry.tone === 'info' ? p.accent : p[entry.tone],
                'line-width': entry.id === 'temporary-closure' ? 5 : 3,
                'line-dasharray':
                  entry.id === 'verified-allowed'
                    ? [1, 0]
                    : entry.id === 'unknown'
                      ? [1, 3]
                      : [3, 2],
              },
            },
          ),
        ),
        {
          id: 'clusters',
          type: 'circle',
          source: 'places',
          filter: ['has', 'point_count'],
          paint: {
            'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 100, 24],
            'circle-color': p.selected,
            'circle-stroke-color': p.text,
            'circle-stroke-width': 3,
          },
        },
        {
          id: 'place',
          type: 'circle',
          source: 'places',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 16, 8],
            'circle-color': p.accent,
            'circle-stroke-color': p.surface,
            'circle-stroke-width': 2,
          },
        },
        line('closures', 'base', p.danger, 6, {
          filter: kind('closure'),
          paint: { 'line-color': p.danger, 'line-width': 6, 'line-dasharray': [1, 1] },
        }),
        {
          id: 'hazards',
          type: 'circle',
          source: 'base',
          filter: kind('hazard'),
          paint: {
            'circle-radius': 10,
            'circle-color': p.caution,
            'circle-stroke-color': p.surface,
            'circle-stroke-width': 3,
          },
        },
        line('selected-halo', 'selected', p.surface, 9),
        line('selected-route', 'selected', p.route, 5, {
          paint: { 'line-color': p.route, 'line-width': 5, 'line-dasharray': [3, 1] },
        }),
        line('active-halo', 'active', p.surface, 10),
        line('active-recording', 'active', p.route, 6),
        {
          id: 'location-halo',
          type: 'circle',
          source: 'location',
          paint: {
            'circle-radius': 11,
            'circle-color': p.surface,
            'circle-stroke-color': p.text,
            'circle-stroke-width': 1,
          },
        },
        {
          id: 'user-location',
          type: 'circle',
          source: 'location',
          paint: { 'circle-radius': 7, 'circle-color': p.location },
        },
      ],
    },
  };
}
