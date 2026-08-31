import { describe, expect, it } from 'vitest';
import { ApplicationShell, MemoryKeyValueStorage } from '../src/index.js';

describe('WP-101 application shell', () => {
  it('keeps selected-route display offline and navigation-free', () => {
    const shell = new ApplicationShell();
    shell.selectRoute({
      id: 'fixture-route',
      name: 'Fixture route',
      geometry: [[-74, 41]],
      origin: 'fixture',
    });
    expect(shell.navigate('track')).toMatchObject({
      section: 'track',
      offline: true,
      selectedRoute: { id: 'fixture-route' },
    });
  });

  it('provides a browser-safe storage port', async () => {
    const storage = new MemoryKeyValueStorage();
    await storage.set('state', 'ready');
    expect(await storage.get('state')).toBe('ready');
    await storage.remove('state');
    expect(await storage.get('state')).toBeNull();
  });
});
