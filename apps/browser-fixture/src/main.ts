import {
  appearances,
  palettes,
  designTokens as t,
  fieldStates,
  componentCatalog,
  type Appearance,
  type FieldState,
  type AppSection,
} from '@open-outdoor/shared';

import { campingLegend, createProductMapStyle, phase1OfflineMapFixture } from '@open-outdoor/map';

import { badge, button, detailCard, escapeHtml, icon, notice } from './components';

import './style.css';

const app = document.querySelector<HTMLElement>('#app');

if (app === null) throw new Error('Application root missing');

const root = app;

let appearance: Appearance = matchMedia('(prefers-contrast: more)').matches
  ? 'high-contrast'
  : matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

let section: AppSection = 'explore';

let searchText = '';

let searchKind = 'all';

let selectedState: FieldState = 'offline';

const route = phase1OfflineMapFixture.routes[0]!;

const places = phase1OfflineMapFixture.features;

function applyAppearance(value: Appearance): void {
  appearance = value;

  document.documentElement.dataset.appearance = value;

  for (const [key, color] of Object.entries(palettes[value]))
    document.documentElement.style.setProperty(`--${key}`, color);

  for (const [key, value] of Object.entries(t.space))
    document.documentElement.style.setProperty(`--space-${key}`, `${value}px`);

  document.documentElement.style.setProperty('--target', `${t.target.minimum}px`);

  document.documentElement.style.setProperty('--radius', `${t.radius.card}px`);

  document.documentElement.style.setProperty('--control-radius', `${t.radius.control}px`);

  document.documentElement.style.setProperty('--feedback', `${t.motion.feedbackMs}ms`);
}

function mapPreview(): string {
  // Preview uses the actual style paints; the SVG is a synthetic schematic, not a geographic map.

  const style = createProductMapStyle(appearance).document as {
    layers: { id: string; paint: Record<string, string> }[];
  };

  const paint = (id: string, key: string) =>
    style.layers.find((layer) => layer.id === id)!.paint[key]!;

  return `<figure class="map"><figcaption>Explore the preserve <span class="map-mode">Sample map</span></figcaption>

    <svg viewBox="0 0 600 250" role="img" aria-label="Land, water, dashed selected route, solid recording and ringed user location">

      <rect width="600" height="250" fill="${paint('background', 'background-color')}"/>

      <path d="M0 15L360 0 510 140 360 250H0Z" fill="${paint('land', 'fill-color')}"/>

      <g fill="none" stroke="${paint('background', 'background-color')}" stroke-width="2" opacity=".7"><path d="M-20 90Q120 -10 280 60T440 100"/><path d="M-20 110Q120 10 280 80T440 120"/><path d="M-20 130Q120 30 280 100T440 140"/><path d="M-20 150Q120 50 280 120T440 160"/></g><path d="M450 0Q280 100 600 240L600 0Z" fill="${paint('water', 'fill-color')}"/>

      <path d="M30 200L130 100 260 150 340 70" fill="none" stroke="${paint('selected-halo', 'line-color')}" stroke-width="10"/>

      <path d="M30 200L130 100 260 150 340 70" fill="none" stroke="${paint('selected-route', 'line-color')}" stroke-width="5" stroke-dasharray="15 5"/>

      <path d="M30 200L130 100 195 125" fill="none" stroke="${paint('active-recording', 'line-color')}" stroke-width="6"/>

      <text x="50" y="45" font-size="12" letter-spacing="2" fill="${palettes[appearance].text}">HEMLOCK PRESERVE</text><text x="440" y="86" font-size="11" fill="${palettes[appearance].text}">Pine Lake</text><circle cx="340" cy="70" r="7" fill="${palettes[appearance].surface}" stroke="${paint('selected-route', 'line-color')}" stroke-width="3"/><circle cx="195" cy="125" r="12" fill="${paint('location-halo', 'circle-color')}"/><circle cx="195" cy="125" r="7" fill="${paint('user-location', 'circle-color')}"/>

    </svg><p>Dashed: selected route · Solid: active recording · Ring: your location. Display only; no turn instructions.</p></figure>`;
}

function legend(): string {
  return `<details class="card"><summary>Land and camping legend</summary><ul class="legend">${campingLegend.map((entry) => `<li><strong>${escapeHtml(entry.mark)} · ${escapeHtml(entry.label)}</strong><p>${escapeHtml(entry.explanation)}</p></li>`).join('')}</ul></details>`;
}

function resultDetail(name = route.name): string {
  return detailCard({
    name,

    origin: 'public-catalog',

    source: 'Open Outdoor synthetic fixture',

    coverage: 'Synthetic preserve only; not a field catalog',

    freshness: 'Unknown — no live verification',

    restrictions: 'No verified access rules in this fixture',

    uncertainty: 'Access unknown. Missing information is not permission.',

    provenance: 'Project-authored synthetic geometry, Apache-2.0',
  });
}

function surface(): string {
  if (section === 'explore')
    return `<div class="explore-workspace"><div>${mapPreview()}<div class="map-key"><span><i class="route-dot"></i>Selected route</span><span><i class="location-dot"></i>Your location</span><span>Illustrative map</span></div>${legend()}</div><div class="place-panel"><p class="section-kicker">On this map</p>${resultDetail()}</div></div>`;
  if (section === 'search')
    return `<section class="card search-card"><div class="section-title"><div><h2>Where would you like to go?</h2></div><span class="round-icon">${icon('search')}</span></div><label for="query">Place or trail name</label><div class="search-field">${icon('search')}<input type="search" id="query" value="${escapeHtml(searchText)}" autocomplete="off" placeholder="Try a trail, forest or campsite"></div><label for="kind">Explore by type</label><select id="kind"><option value="all">All places</option><option value="trail">Trails</option><option value="poi">Places</option><option value="land">Land</option></select><p id="result-count" role="status" class="section-kicker"></p><ul id="results" class="results"></ul><div id="selected-detail"></div><p class="quiet-note">Searches the synthetic places included in this preview.</p></section>`;
  if (section === 'track')
    return `<section class="card recording-card"><div class="section-title"><div><h2>Ready to head out?</h2></div><span class="badge">${icon('private')} On your device</span></div><div class="recording-orbit" aria-hidden="true"><div>${icon('explore')}</div><span></span></div><p class="recording-caption">Your route will appear as you walk.</p><div class="recording-metrics"><div><span>Distance</span><strong>— <small>km</small></strong><em>Not started</em></div><div><span>Ascent</span><strong>— <small>m</small></strong><em>Not started</em></div></div><div class="gps-state">${icon('info')} GPS unavailable in this browser preview</div>${button('Start recording', 'id="start" class="primary-action"', 'track')}<p class="quiet-note">Recording requires the native app and device location permission. No activity is recording here.</p></section>`;
  return `<section class="card saved-card"><div class="journal-art" aria-hidden="true"><div class="journal-page">${icon('explore')}<span></span><span></span></div>${icon('saved')}</div><h2>No hikes saved yet</h2><p>After your first recording, you can return here to see the route and the details you captured. Your activities stay on your device.</p>${button('Explore the map', 'data-section="explore" class="primary-action"', 'explore')}<p class="quiet-note">No saved activities in this browser preview.</p></section>`;
}
function catalog(): string {
  return `<section id="catalog" aria-labelledby="catalog-heading"><h2 id="catalog-heading">Component catalog</h2><p>Every example below is synthetic QA. Expand a component to review its states.</p>

    <details class="card"><summary>Buttons and navigation</summary><div class="controls">${button('Default')}${button('Selected', 'aria-pressed="true"')}${button('Disabled', 'disabled')}${button('Saving…', 'aria-busy="true" disabled')}${button('Destructive example', 'class="destructive" id="destructive-example"')}${button('Pressed preview', 'class="pressed"')}${button('Focus preview', 'class="focus-preview"')}</div><p id="button-demo" role="status">Use Tab to review actual keyboard focus. Disabled and busy controls do not activate.</p></details>

    <details class="card"><summary>Origin badges, cards and metrics</summary><div class="controls">${['public-catalog', 'private-catalog', 'user', 'unknown'].map(badge).join('')}</div><article class="card selected"><h3>Selected card</h3><p>Selection has a border and an explicit label.</p></article>${notice('empty')}<p>Distance: 1.2 km · Ascent: Unknown · GPS: Degraded — reduced confidence</p></details>

    <details class="card"><summary>Search input states</summary><label for="example-search">Search example</label><input id="example-search" type="search" value="Hemlock"><label for="disabled-search">Unavailable search</label><input id="disabled-search" type="search" disabled placeholder="Catalog unavailable"><p>Tab to focus; clear the populated input to inspect the empty state.</p></details>

    <details class="card" id="all-states"><summary>All ${Object.keys(fieldStates).length} field states</summary><div class="state-grid">${Object.keys(
      fieldStates,
    )

      .map((state) => notice(state as FieldState))

      .join('')}</div></details>

    <details class="card"><summary>Detail states</summary>${(['stale', 'unknown', 'conflict', 'closure', 'private-origin'] as const).map((state) => notice(state)).join('')}${detailCard({ name: 'Fresh source example', origin: 'public-catalog', source: 'Synthetic source', coverage: 'Synthetic preserve', freshness: 'Data as of 2026-09-09; freshness is not live access confirmation', restrictions: 'Example closure effective until reviewed by the authority', uncertainty: 'Source dates do not establish current safety', provenance: 'Synthetic QA; no real source assertion' })}</details>

    <details class="card"><summary>Catalog state inventory</summary><dl>${Object.entries(
      componentCatalog,
    )

      .map(
        ([component, states]) =>
          `<div><dt>${escapeHtml(component)}</dt><dd>${states.map(escapeHtml).join(', ')}</dd></div>`,
      )

      .join('')}</dl></details>

    </section>`;
}

function updateSearch(): void {
  const query = root.querySelector<HTMLInputElement>('#query')?.value.trim().toLowerCase() ?? '';

  const kind = root.querySelector<HTMLSelectElement>('#kind')?.value ?? 'all';

  searchText = root.querySelector<HTMLInputElement>('#query')?.value ?? '';

  searchKind = kind;

  const filtered = places.filter(
    (place) => place.name.toLowerCase().includes(query) && (kind === 'all' || place.kind === kind),
  );

  const list = root.querySelector<HTMLElement>('#results');

  if (!list) return;

  root.querySelector('#result-count')!.textContent = `${filtered.length} results`;

  list.innerHTML = filtered.length
    ? filtered

        .map(
          (place) =>
            `<li><button class="place-result" type="button" data-place="${escapeHtml(place.id)}"><span class="place-icon">${icon(place.kind === 'trail' ? 'explore' : 'saved')}</span><span><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.kind === 'poi' ? 'Place' : place.kind[0]!.toUpperCase() + place.kind.slice(1))} · Synthetic preserve</small></span><span class="result-arrow" aria-hidden="true">→</span></button></li>`,
        )

        .join('')
    : `<li>${notice('empty')}</li>`;

  root.querySelector('#selected-detail')!.replaceChildren();

  list.querySelectorAll<HTMLButtonElement>('[data-place]').forEach((control) =>
    control.addEventListener('click', () => {
      const place = filtered.find((item) => item.id === control.dataset.place)!;

      root.querySelector('#selected-detail')!.innerHTML = resultDetail(place.name);
    }),
  );
}

function render(): void {
  const expanded = new Set(
    Array.from(root.querySelectorAll('details[open] summary'), (element) => element.textContent),
  );

  applyAppearance(appearance);

  root.innerHTML = `<a class="skip" href="#surface">Skip to content</a><header class="product-header"><div class="brand">${icon('explore')} ${t.brand.name}<span class="edition">Offline field guide</span></div><div class="page-intro"><h1>${{ explore: 'Explore outdoors', search: 'Find a place', track: 'Record a hike', saved: 'Your hikes' }[section]}</h1><p>${{ explore: 'Trails, open spaces and places to pause.', search: 'Search the places on your offline map.', track: 'Keep a record of where the day takes you.', saved: 'The routes and memories you bring home.' }[section]}</p></div></header>

    <nav aria-label="Primary" class="controls">${(['explore', 'search', 'track', 'saved'] as const).map((value) => button(value[0]!.toUpperCase() + value.slice(1), `data-section="${value}" aria-pressed="${section === value}"`, value)).join('')}</nav>

<section id="surface" tabindex="-1" aria-label="${section}">${surface()}</section>

    <p id="action-status" role="status" aria-live="polite"></p><details class="design-tools"><summary>Design preview settings &amp; component library</summary><p class="fixture-label">Synthetic offline fixture · For visual reference only</p>    <div class="review-controls card"><label for="appearance">Appearance</label><select id="appearance">${appearances.map((value) => `<option value="${value}" ${appearance === value ? 'selected' : ''}>${value}</option>`).join('')}</select><label for="field-state">Field state preview</label><select id="field-state">${Object.entries(
      fieldStates,
    )

      .map(
        ([value, state]) =>
          `<option value="${value}" ${value === selectedState ? 'selected' : ''}>${escapeHtml(state.title)}</option>`,
      )

      .join('')}</select><a href="#catalog">Review component catalog</a></div>

<div id="field-notice" role="status" aria-live="polite">${notice(selectedState)}</div>${catalog()}</details><footer>Original Open Outdoor tokens, geometry and map styles · Apache-2.0 · No network assets</footer>`;

  // Reserve real layout space for the phone navigation so controls cannot sit underneath it.
  const navigation = root.querySelector<HTMLElement>('nav[aria-label="Primary"]')!;
  const content = document.createElement('div');
  content.className = 'app-content';
  content.dataset.section = section;
  for (const child of Array.from(root.childNodes)) {
    if (child !== navigation) content.appendChild(child);
  }
  root.append(content, navigation);
  root.querySelectorAll<HTMLButtonElement>('[data-section]').forEach((control) =>
    control.addEventListener('click', () => {
      section = control.dataset.section as AppSection;

      render();

      root.querySelector<HTMLButtonElement>(`[data-section="${section}"]`)?.focus();
    }),
  );

  root.querySelector<HTMLSelectElement>('#appearance')!.addEventListener('change', (event) => {
    appearance = (event.target as HTMLSelectElement).value as Appearance;

    render();

    root.querySelector<HTMLSelectElement>('#appearance')!.focus();
  });

  root.querySelector<HTMLSelectElement>('#field-state')!.addEventListener('change', (event) => {
    selectedState = (event.target as HTMLSelectElement).value as FieldState;

    root.querySelector('#field-notice')!.innerHTML = notice(selectedState);
  });

  root.querySelector('#start')?.addEventListener('click', () => {
    root.querySelector('#action-status')!.textContent =
      'Native tracking is unavailable in this browser fixture. Use a physical iPhone build.';
    root.querySelector('#action-status')?.scrollIntoView({ block: 'nearest' });
  });

  root.querySelector('#query')?.addEventListener('input', updateSearch);

  root.querySelector('#kind')?.addEventListener('change', updateSearch);

  root.querySelector('#destructive-example')?.addEventListener('click', () => {
    root.querySelector('#button-demo')!.textContent =
      'Example only. A real discard requires a separate confirmation naming the affected recording.';
  });

  root.querySelectorAll('details').forEach((element) => {
    element.open = expanded.has(element.querySelector('summary')?.textContent ?? '');
  });

  if (section === 'search') {
    root.querySelector<HTMLSelectElement>('#kind')!.value = searchKind;

    updateSearch();
  }
}

render();
