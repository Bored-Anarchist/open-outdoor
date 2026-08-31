import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IngestionSecurityError,
  RawArtifactStore,
  assertProcessingRootIsolation,
  inspectArchiveEntries,
  redactIngestionSecrets,
  runConnector,
  type Connector,
  type ConnectorManifest,
} from '../src/index.js';

const isolatedManifest: ConnectorManifest = {
  schemaVersion: '1.0.0',
  connectorVersion: '1.0.0',
  sourceId: 'security-fixture',
  lifecycle: 'active',
  authorization: 'authorized',
  acquisitionMode: 'manual-import',
  sourceClass: 'current',
  classification: 'PUBLIC_SYNTHETIC',
  allowedTransports: ['file'],
  allowedHosts: [],
  secretNames: [],
  rights: {
    rawRetention: 'P1D',
    parsedFields: ['name'],
    media: false,
    derivedData: true,
    offlineStorage: true,
    distribution: { public: true, 'private-user': true, 'private-organization': true },
    attribution: ['Synthetic'],
    termsUrl: 'https://example.invalid/terms',
    evidenceReviewedAt: '2026-08-30T00:00:00.000Z',
    reviewExpiresAt: null,
  },
  limits: {
    maxPayloadBytes: 16,
    maxArchiveEntries: 10,
    maxExpandedBytes: 100,
    maxCompressionRatio: 10,
    maxParserMilliseconds: 100,
    maxRedirects: 0,
    maxConcurrency: 1,
  },
  requiredFreshnessSeconds: null,
};

function isolatedConnector(
  manifest: ConnectorManifest = isolatedManifest,
): Connector<string, string, string> {
  return {
    manifest,
    discover: async () => [
      { externalId: 'bad', sourcePartition: 'fixture', locator: 'file:///fixture/bad' },
      { externalId: 'good', sourcePartition: 'fixture', locator: 'file:///fixture/good' },
    ],
    fetch: async (asset) => ({
      ...asset,
      payload: new TextEncoder().encode(asset.externalId === 'bad' ? 'x'.repeat(32) : 'good'),
      contentType: 'text/plain',
      retrievedAt: '2026-09-01T00:00:00.000Z',
    }),
    storeRaw: async (asset) => ({
      ...asset,
      checksum: 'a'.repeat(64),
      byteLength: asset.payload.byteLength,
      storageKey: asset.externalId,
    }),
    parse: async (asset) => new TextDecoder().decode(asset.payload),
    normalize: async (value) => value,
    validate: async () => undefined,
    checkpoint: async () => undefined,
    emit: async (value) => value,
  };
}

describe('WP-202 ingestion security and raw boundary', () => {
  it.each([
    [
      'path traversal',
      [{ path: '../escape.json', compressedBytes: 10, expandedBytes: 10, kind: 'file' as const }],
      'archive-path-traversal',
    ],
    [
      'drive traversal',
      [{ path: 'C:\\escape.json', compressedBytes: 10, expandedBytes: 10, kind: 'file' as const }],
      'archive-path-traversal',
    ],
    [
      'symbolic link',
      [{ path: 'link', compressedBytes: 1, expandedBytes: 1, kind: 'symbolic-link' as const }],
      'archive-link',
    ],
    [
      'compression bomb',
      [{ path: 'bomb.bin', compressedBytes: 1, expandedBytes: 1000, kind: 'file' as const }],
      'compression-ratio-limit',
    ],
  ])('quarantines a malicious %s fixture', (_name, entries, reason) => {
    expect(() =>
      inspectArchiveEntries(entries, {
        maxEntries: 5,
        maxExpandedBytes: 2048,
        maxCompressionRatio: 20,
      }),
    ).toThrowError(expect.objectContaining<Partial<IngestionSecurityError>>({ reason }));
  });

  it('bounds archive entry count and total expanded bytes', () => {
    expect(() =>
      inspectArchiveEntries(
        [
          { path: 'one', compressedBytes: 5, expandedBytes: 10, kind: 'file' },
          { path: 'two', compressedBytes: 5, expandedBytes: 10, kind: 'file' },
        ],
        { maxEntries: 1, maxExpandedBytes: 100, maxCompressionRatio: 10 },
      ),
    ).toThrow(/too many entries/);
    expect(() =>
      inspectArchiveEntries(
        [{ path: 'large', compressedBytes: 100, expandedBytes: 200, kind: 'file' }],
        { maxEntries: 1, maxExpandedBytes: 100, maxCompressionRatio: 10 },
      ),
    ).toThrow(/configured byte limit/);
  });

  it('redacts secret keys and values without exposing them in quarantine-safe details', () => {
    expect(
      redactIngestionSecrets({
        authorization: 'Bearer visible-token',
        nested: 'password=hunter2',
        safe: 'public fixture',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      nested: '[REDACTED]',
      safe: 'public fixture',
    });
  });

  it('keeps public/private roots disjoint and private roots outside the checkout', () => {
    const checkout = resolve('C:/workspace/open-outdoor');
    expect(() =>
      assertProcessingRootIsolation(
        join(checkout, 'public-build'),
        join(checkout, 'private-build'),
        checkout,
      ),
    ).toThrow(/outside the public checkout/);
    expect(() =>
      assertProcessingRootIsolation(join(checkout, 'build'), join(checkout, 'build', 'private')),
    ).toThrow(/disjoint/);
  });

  it('stores immutable content-addressed raw data and blocks private data in a public root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'open-outdoor-raw-'));
    const store = new RawArtifactStore({ root, boundary: 'public' });
    const payload = new TextEncoder().encode('synthetic data');
    const metadata = {
      sourceId: 'synthetic-trails',
      externalId: 'one',
      sourcePartition: 'fixture',
      retrievedAt: '2026-09-01T00:00:00.000Z',
      contentType: 'text/plain',
      classification: 'PUBLIC_SYNTHETIC' as const,
      retention: 'P30D',
    };
    const first = await store.put(payload, metadata);
    const second = await store.put(payload, metadata);
    expect(first).toEqual(second);
    expect(first.storageKey).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{64}\.raw$/);

    await expect(
      store.put(payload, { ...metadata, classification: 'PRIVATE_USER' }),
    ).rejects.toThrow(/cannot enter the public raw root/);
  });

  it('quarantines a bad asset without blocking another asset from the same source', async () => {
    const result = await runConnector(
      isolatedConnector(),
      'security-run',
      '2026-09-01T00:00:00.000Z',
    );
    expect(result.emitted).toEqual(['good']);
    expect(result.quarantine).toMatchObject([{ externalId: 'bad', reason: 'payload-limit' }]);
  });

  it('enforces task timeouts and transport allowlists through quarantine', async () => {
    const timeoutBase = isolatedConnector({
      ...isolatedManifest,
      limits: { ...isolatedManifest.limits, maxPayloadBytes: 64, maxParserMilliseconds: 5 },
    });
    const timeoutConnector: Connector<string, string, string> = {
      ...timeoutBase,
      parse: async () => new Promise((resolveValue) => setTimeout(() => resolveValue('late'), 25)),
    };
    const timeout = await runConnector(timeoutConnector, 'timeout-run', '2026-09-01T00:00:00.000Z');
    expect(timeout.emitted).toEqual([]);
    expect(timeout.quarantine.every((item) => item.reason === 'parser-timeout')).toBe(true);

    const discoveryBase = isolatedConnector({
      ...isolatedManifest,
      limits: { ...isolatedManifest.limits, maxParserMilliseconds: 5 },
    });
    const discoveryTimeout: Connector<string, string, string> = {
      ...discoveryBase,
      discover: async () => new Promise((resolveValue) => setTimeout(() => resolveValue([]), 25)),
    };
    const discovery = await runConnector(
      discoveryTimeout,
      'discovery-timeout-run',
      '2026-09-01T00:00:00.000Z',
    );
    expect(discovery.quarantine).toMatchObject([{ externalId: null, reason: 'parser-timeout' }]);

    const networkConnector: Connector<string, string, string> = {
      ...isolatedConnector(),
      discover: async () => [
        {
          externalId: 'network',
          sourcePartition: 'fixture',
          locator: 'https://unapproved.invalid/data',
        },
      ],
    };
    const network = await runConnector(networkConnector, 'network-run', '2026-09-01T00:00:00.000Z');
    expect(network.quarantine).toMatchObject([
      { externalId: 'network', reason: 'boundary-violation' },
    ]);
  });
});
