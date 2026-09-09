import { describe, expect, it, vi } from 'vitest';
import {
  PERMISSION_SOURCES,
  SUPPORTED_SHELL_CATEGORIES,
  createPermissionShell,
  permissionShellManifest,
  shellCapabilities,
  shellDeepLink,
  mapShellCategory,
  runConnector,
  AcquisitionSession,
  type PermissionSourceId,
} from '../src/index.js';

describe('WP-404 permission-gated shells', () => {
  it.each(Object.keys(PERMISSION_SOURCES) as PermissionSourceId[])(
    '%s stays disabled with no record or network rights',
    async (id) => {
      const network = vi.spyOn(globalThis, 'fetch');
      try {
        const shell = createPermissionShell(id);
        expect(shell.manifest).toMatchObject({
          lifecycle: 'disabled',
          authorization: 'permission-required',
          acquisitionMode: 'deep-link-only',
          allowedHosts: [],
          secretNames: [],
          rights: {
            rawRetention: null,
            media: false,
            derivedData: false,
            offlineStorage: false,
            distribution: { public: false, 'private-user': false, 'private-organization': false },
          },
        });
        const result = await runConnector(shell, 'synthetic-shell', '2026-09-09T00:00:00Z');
        expect(result.emitted).toEqual([]);
        expect(result.quarantine[0]?.reason).toBe('rights-denied');
        for (const stage of [
          'discover',
          'fetch',
          'storeRaw',
          'parse',
          'normalize',
          'validate',
          'checkpoint',
          'emit',
        ] as const) {
          await expect((shell[stage] as () => Promise<never>)()).rejects.toThrow(
            /permission shell/,
          );
        }
        const acquisition = new AcquisitionSession(
          shell.manifest,
          {
            contentTypes: ['application/json'],
            maxRunBytes: 1024,
            maxPages: 1,
            timeoutMs: 100,
            retries: 0,
            retryDelayMs: 0,
          },
          '2026-09-09T00:00:00Z',
        );
        await expect(
          acquisition.request(PERMISSION_SOURCES[id].url, new AbortController().signal),
        ).rejects.toThrow();
        expect(shellCapabilities(id)).toMatchObject({
          taxonomySupported: true,
          adapterShellImplemented: true,
          connectorImplemented: false,
          sourceAuthorized: false,
          recordsIncluded: false,
        });
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
      }
    },
  );
  it('does not activate a shell through a mutated manifest copy', async () => {
    const changed = permissionShellManifest('ioverlander');
    const shell = {
      ...createPermissionShell('ioverlander'),
      manifest: {
        ...changed,
        lifecycle: 'active' as const,
        authorization: 'authorized' as const,
        acquisitionMode: 'automated' as const,
      },
    };
    const result = await runConnector(shell, 'synthetic', '2026-09-09T00:00:00Z');
    expect(result.emitted).toEqual([]);
    expect(result.quarantine[0]?.reason).toBe('rights-denied');
    expect(permissionShellManifest('ioverlander').authorization).toBe('permission-required');
    expect(permissionShellManifest('freeroam').sourceClass).toBe('legacy');
  });
  it('maps only taxonomy, preserves unknown values, and separates warnings from places', () => {
    for (const category of SUPPORTED_SHELL_CATEGORIES)
      expect(mapShellCategory(category).reviewRequired).toBe(false);
    expect(mapShellCategory('Overnight Prohibited')).toMatchObject({
      recordType: 'restriction',
      category: 'overnight-prohibition',
    });
    expect(mapShellCategory('Road Report').recordType).toBe('condition');
    expect(mapShellCategory('Checkpoint').recordType).toBe('condition');
    expect(mapShellCategory('Farm & Vineyard Camping').category).toBe('farm-camping');
    expect(mapShellCategory('new-category')).toEqual({
      recordType: 'place',
      category: 'unknown',
      rawCategory: 'new-category',
      reviewRequired: true,
    });
  });
  it('returns source links without fetching and rejects credential-bearing or off-site links', () => {
    expect(shellDeepLink('ioverlander', 'https://ioverlander.com/legend')).toBe(
      'https://ioverlander.com/legend',
    );
    for (const url of [
      'http://ioverlander.com/',
      'https://evil.invalid/',
      'https://ioverlander.com/?token=x',
      'https://a:b@ioverlander.com/',
      'https://ioverlander.com/#private',
    ]) {
      expect(() => shellDeepLink('ioverlander', url)).toThrow();
    }
    expect(() => createPermissionShell('toString' as PermissionSourceId)).toThrow();
  });
});
