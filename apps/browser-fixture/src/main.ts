import { ApplicationShell } from '@open-outdoor/shared';
import { FixtureMapAdapter, phase1OfflineMapFixture } from '@open-outdoor/map';

const shell = new ApplicationShell();
const map = new FixtureMapAdapter();
const route = phase1OfflineMapFixture.routes[0];
if (route !== undefined) {
  shell.selectRoute({
    id: route.id,
    name: route.name,
    geometry: route.coordinates,
    origin: 'fixture',
  });
  map.setSelectedRoute(route);
}

const app = document.querySelector<HTMLElement>('#app');
if (app !== null) {
  app.innerHTML = `
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 0; background: #f3f1e8; color: #183028; }
      main { max-width: 760px; margin: auto; padding: 24px; }
      .status, .map, .card { border-radius: 16px; padding: 20px; margin: 16px 0; }
      .status { background: #dfeadd; }
      .map { background: #c8dcc7; min-height: 180px; border: 2px solid #35634d; }
      .card { background: white; box-shadow: 0 4px 18px #1830281a; }
      nav, .controls { display: flex; flex-wrap: wrap; gap: 12px; }
      button { min-height: 44px; min-width: 96px; border-radius: 10px; border: 2px solid #28533f;
        padding: 8px 16px; font: inherit; font-weight: 650; }
      button:focus-visible { outline: 4px solid #f39c12; outline-offset: 2px; }
      .route-line { height: 8px; background: #b63737; border-radius: 8px; margin: 72px 20px; }
      @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
      @media (prefers-color-scheme: dark) {
        body { background: #101a16; color: #eef5ee; }
        .status { background: #254032; }
        .map { background: #20392d; }
        .card { background: #1b2b24; }
        button { background: #243d32; color: #fff; border-color: #9ecbad; }
      }
    </style>
    <header>
      <p>Offline fixture · no network required</p>
      <h1>Open Outdoor recorder alpha</h1>
    </header>
    <nav aria-label="Primary">
      <button type="button" data-section="explore" aria-pressed="true">Explore</button>
      <button type="button" data-section="track" aria-pressed="false">Track</button>
      <button type="button" data-section="saved" aria-pressed="false">Saved</button>
    </nav>
    <section class="status" role="status" aria-live="polite" id="status">
      Ready to record offline. Native sensors are unavailable in this browser fixture.
    </section>
    <section class="map" aria-label="Non-interactive map alternative">
      <h2>${route?.name ?? 'No route selected'}</h2>
      <div class="route-line" aria-hidden="true"></div>
      <p>${route?.coordinates.length ?? 0} route points. Display only—no turn instructions or rerouting.</p>
    </section>
    <section class="card">
      <h2>Recorder controls</h2>
      <div class="controls">
        <button type="button" id="start">Start recording</button>
        <button type="button" disabled>Pause recording</button>
        <button type="button" disabled>Finish and save</button>
      </div>
      <p id="capability">Browser QA uses deterministic fixture adapters. Physical tracking remains gated to iOS.</p>
    </section>
  `;
  app.querySelectorAll<HTMLButtonElement>('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.dataset.section;
      if (section === 'explore' || section === 'track' || section === 'saved') {
        shell.navigate(section);
        app.querySelectorAll<HTMLButtonElement>('[data-section]').forEach((candidate) => {
          candidate.setAttribute('aria-pressed', String(candidate === button));
        });
      }
    });
  });
  app.querySelector<HTMLButtonElement>('#start')?.addEventListener('click', () => {
    const status = app.querySelector<HTMLElement>('#status');
    if (status !== null) {
      status.textContent =
        'Native tracking is unavailable in the browser fixture. Use a physical iPhone build.';
    }
  });
}
