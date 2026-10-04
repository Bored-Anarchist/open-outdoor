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

import { campingLegend, phase1OfflineMapFixture } from '@open-outdoor/map';

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
  const p = palettes[appearance];
  return `<figure class="map"><figcaption>Illustrative map</figcaption><svg viewBox="0 0 390 700" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Synthetic land, water, dashed planned route and ringed location">
    <rect width="390" height="700" fill="${p.land}"/><path d="M0 90L160 0 290 80 390 190 260 280 0 250Z" fill="${p.selected}"/><path d="M280 0H390V700H330L335 260 280 130Z" fill="${p.water}"/>
    <g fill="none" stroke="${p.surface}" stroke-width="1" opacity=".7">${Array.from({ length: 14 }, (_, i) => `<path d="M-10 ${120 + i * 35}Q140 ${50 + i * 35} 250 ${100 + i * 35}T420 ${150 + i * 35}"/>`).join('')}</g>
    <path d="M0 539L130 420 260 490 390 406" fill="none" stroke="${p.border}" stroke-width="2"/>
    <path d="M55 497L112 329 174 371 221 245 259 189" fill="none" stroke="${p.surface}" stroke-width="7"/><path d="M55 497L112 329 174 371 221 245 259 189" fill="none" stroke="${p.route}" stroke-width="4" stroke-dasharray="12 7"/>
    <circle cx="259" cy="189" r="7" fill="${p.route}" stroke="${p.surface}" stroke-width="3"/><circle cx="174" cy="371" r="11" fill="${p.surface}"/><circle cx="174" cy="371" r="6" fill="${p.location}"/>
    <text x="34" y="165" font-size="11" font-weight="700" fill="${p.muted}">HEMLOCK PRESERVE</text><text x="294" y="225" font-size="11" fill="${p.muted}">Pine Lake</text></svg></figure>`;
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

let settingsOpen = false;
let settingsPage: 'index' | 'maps' | 'appearance' | 'about' | 'advanced' = 'index';
let placeOpen = false;

function surface(): string {
  if (settingsOpen) {
    if (settingsPage === 'maps')
      return `<div class="settings-list"><h2>Bundled</h2><article class="inventory-row">${icon('folder')}<div><strong>Illustrative map</strong><p>Synthetic browser fixture</p></div></article><h2>Public packages</h2><p>No public packages</p><h2>Private data</h2><p>No private datasets</p><p class="quiet-note">Package installation requires the native app.</p></div>`;
    if (settingsPage === 'appearance')
      return `<div class="settings-list"><label for="appearance">Appearance</label><select id="appearance">${appearances.map((value) => `<option value="${value}" ${appearance === value ? 'selected' : ''}>${value === 'high-contrast' ? 'High contrast' : value === 'dark' ? 'Dark' : 'Light'}</option>`).join('')}</select><p>Text size follows your device.</p></div>`;
    if (settingsPage === 'about')
      return `<div class="settings-list"><h2>Open Outdoor</h2><p>Offline maps and private hikes</p><details class="card"><summary>Map sources</summary><p>All places and geometry here are synthetic browser references. Apache-2.0 · No network assets.</p></details><details class="card"><summary>Map limits</summary><p>No turn instructions. Mapped places do not establish access or camping permission.</p></details><details class="card"><summary>Licenses</summary><p>Original Open Outdoor tokens, geometry and map styles · Apache-2.0</p></details></div>`;
    if (settingsPage === 'advanced')
      return `<details class="design-tools" open><summary>Design preview</summary><p class="fixture-label">Synthetic reference</p><label for="field-state">Field state preview</label><select id="field-state">${Object.entries(
        fieldStates,
      )
        .map(
          ([value, state]) =>
            `<option value="${value}" ${value === selectedState ? 'selected' : ''}>${escapeHtml(state.title)}</option>`,
        )
        .join(
          '',
        )}</select><div id="field-notice" role="status">${notice(selectedState)}</div>${catalog()}</details>`;
    return `<div class="settings-list">${[
      ['maps', 'Maps', 'Public packages and private data', 'folder'],
      ['appearance', 'Appearance', 'Light · Dark · High contrast', 'settings'],
      ['about', 'About and sources', 'Attribution and licenses', 'folder'],
      ['advanced', 'Advanced', 'Design preview and component library', 'settings'],
    ]
      .map(
        ([value, title, sub, glyph]) =>
          `<button class="inventory-row" data-settings-page="${value}">${icon(glyph as 'folder' | 'settings')}<span><strong>${title}</strong><small>${sub}</small></span><span aria-hidden="true">›</span></button>`,
      )
      .join('')}</div>`;
  }
  if (section === 'explore')
    return `<div class="explore-workspace">${mapPreview()}<div class="map-toolbar"><button data-section="search">${icon('search')}Find a place</button><button class="icon-button" id="settings" aria-label="Settings">${icon('settings')}</button></div><details class="map-tools"><summary>Map tools</summary>${legend()}</details><div class="place-panel"><span class="badge">Public</span><h2>${route.name}</h2><p class="access-preview">Access unknown</p><button id="place-details" class="primary-action">Details</button>${placeOpen ? `<div id="selected-detail">${resultDetail()}</div><button id="close-place">Close place</button>` : ''}</div><span class="map-attribution">Illustrative map</span></div>`;
  if (section === 'search')
    return `<section class="search-card"><label for="query">Place or trail name</label><div class="search-field">${icon('search')}<input type="search" id="query" value="${escapeHtml(searchText)}" autocomplete="off" placeholder="Find a place"></div><label for="kind">Categories</label><select id="kind"><option value="all">All places</option><option value="trail">Trails</option><option value="poi">Places</option><option value="land">Land</option></select><p id="result-count" role="status" class="section-kicker"></p><ul id="results" class="results"></ul><div id="selected-detail"></div></section>`;
  if (section === 'track')
    return `<section class="recording-card"><span class="badge">Ready</span><div class="path-placeholder" aria-hidden="true">${icon('explore')}</div><div class="recording-metrics"><div><span>Distance</span><strong>—</strong></div><div><span>Ascent</span><strong>—</strong></div><div><span>GPS</span><strong>—</strong></div></div><div class="inventory-row">${icon('track')}<div><strong>Recording mode</strong><p>Balanced</p></div></div>${button('Start recording', 'id="start" class="primary-action"', 'track')}<p class="quiet-note">Recording requires the native app.</p></section>`;
  return `<section class="saved-card"><div class="journal-art" aria-hidden="true"><div class="journal-page">${icon('explore')}<span></span><span></span></div>${icon('saved')}</div><h2>No hikes yet</h2>${button('Record a hike', 'data-section="track" class="primary-action"', 'track')}<p class="quiet-note">Saved on your device</p></section>`;
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
}

root.addEventListener('click', (event) => {
  const target = event.target;

  if (!(target instanceof Element)) return;

  if (target.closest('#start')) {
    root.querySelector('#action-status')!.textContent =
      'Native tracking is unavailable in this browser fixture. Use a physical iPhone build.';
    root.querySelector('#action-status')?.scrollIntoView({ block: 'nearest' });

    return;
  }

  if (target.closest('#destructive-example')) {
    root.querySelector('#button-demo')!.textContent =
      'Example only. A real discard requires a separate confirmation naming the affected recording.';

    return;
  }

  const control = target.closest<HTMLButtonElement>('#results [data-place]');

  if (!control) return;

  const place = places.find((item) => item.id === control.dataset.place);

  if (place) root.querySelector('#selected-detail')!.innerHTML = resultDetail(place.name);
});

function render(): void {
  const expanded = new Set(
    Array.from(root.querySelectorAll('details[open] summary'), (element) => element.textContent),
  );

  applyAppearance(appearance);

  root.dataset.section = settingsOpen ? 'settings' : section;
  root.innerHTML = `<a class="skip" href="#surface">Skip to content</a><header class="product-header">${settingsOpen ? `<button id="back">Back</button>` : ''}<h1>${settingsOpen ? { index: 'Settings', maps: 'Maps', appearance: 'Appearance', about: 'About and sources', advanced: 'Advanced' }[settingsPage] : section === 'explore' ? 'Explore' : section === 'search' ? 'Search' : section === 'track' ? 'Track' : 'Saved'}</h1>${section !== 'explore' || settingsOpen ? `<button class="icon-button" id="settings" aria-label="Settings">${icon('settings')}</button>` : ''}</header>
    <nav aria-label="Primary" class="controls">${(['explore', 'search', 'track', 'saved'] as const).map((value) => button(value[0]!.toUpperCase() + value.slice(1), `data-section="${value}" aria-pressed="${!settingsOpen && section === value}"`, value)).join('')}</nav>
    <section id="surface" tabindex="-1" aria-label="${settingsOpen ? 'Settings' : section}">${surface()}</section><p id="action-status" role="status" aria-live="polite"></p>`;
  // Reserve real layout space for the phone navigation so controls cannot sit underneath it.
  const navigation = root.querySelector<HTMLElement>('nav[aria-label="Primary"]')!;
  const content = document.createElement('div');
  content.className = 'app-content';
  content.dataset.section = section;
  for (const child of Array.from(root.childNodes)) {
    if (child !== navigation) content.appendChild(child);
  }
  root.append(content, navigation);
  root.querySelectorAll<HTMLButtonElement>('button[data-section]').forEach((control) =>
    control.addEventListener('click', () => {
      settingsOpen = false;
      section = control.dataset.section as AppSection;

      render();

      root.querySelector<HTMLButtonElement>(`[data-section="${section}"]`)?.focus();
    }),
  );

  root.querySelector<HTMLSelectElement>('#appearance')?.addEventListener('change', (event) => {
    appearance = (event.target as HTMLSelectElement).value as Appearance;

    render();

    root.querySelector<HTMLSelectElement>('#appearance')!.focus();
  });

  root.querySelector<HTMLSelectElement>('#field-state')?.addEventListener('change', (event) => {
    selectedState = (event.target as HTMLSelectElement).value as FieldState;

    root.querySelector('#field-notice')!.innerHTML = notice(selectedState);
  });

  root.querySelector('#query')?.addEventListener('input', updateSearch);

  root.querySelector('#kind')?.addEventListener('change', updateSearch);

  root.querySelectorAll('details').forEach((element) => {
    element.open =
      element.classList.contains('design-tools') ||
      expanded.has(element.querySelector('summary')?.textContent ?? '');
  });

  root.querySelector('#settings')?.addEventListener('click', () => {
    settingsOpen = true;
    settingsPage = 'index';
    render();
    root.querySelector<HTMLButtonElement>('#back')?.focus();
  });
  root.querySelector('#back')?.addEventListener('click', () => {
    if (settingsPage === 'index') settingsOpen = false;
    else settingsPage = 'index';
    render();
    root.querySelector<HTMLElement>('#surface')?.focus();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-settings-page]').forEach((control) =>
    control.addEventListener('click', () => {
      settingsPage = control.dataset.settingsPage as typeof settingsPage;
      render();
      root.querySelector<HTMLElement>('#surface')?.focus();
    }),
  );
  root.querySelector('#place-details')?.addEventListener('click', () => {
    placeOpen = true;
    render();
    root.querySelector<HTMLButtonElement>('#close-place')?.focus();
  });
  root.querySelector('#close-place')?.addEventListener('click', () => {
    placeOpen = false;
    render();
    root.querySelector<HTMLButtonElement>('#place-details')?.focus();
  });
  if (!settingsOpen && section === 'search') {
    root.querySelector<HTMLSelectElement>('#kind')!.value = searchKind;

    updateSearch();
  }
}

render();
