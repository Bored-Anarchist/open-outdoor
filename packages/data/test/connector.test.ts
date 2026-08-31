import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_STAGES,
  evaluateSourceRights,
  runConnector,
  validateConnectorManifest,
  type Connector,
  type ConnectorManifest,
} from '../src/index.js';

export const syntheticManifest: ConnectorManifest = {
  schemaVersion: '1.0.0',
  connectorVersion: '1.2.3',
  sourceId: 'synthetic-trails',
  lifecycle: 'active',
  authorization: 'authorized',
  acquisitionMode: 'manual-import',
  sourceClass: 'current',
  classification: 'PUBLIC_SYNTHETIC',
  allowedTransports: ['file'],
  allowedHosts: [],
  secretNames: [],
  rights: {
    rawRetention: 'P30D',
    parsedFields: ['name', 'geometry'],
    media: false,
    derivedData: true,
    offlineStorage: true,
    distribution: { public: true, 'private-user': true, 'private-organization': true },
    attribution: ['Open Outdoor synthetic fixture'],
    termsUrl: 'https://example.invalid/synthetic-fixture-terms',
    evidenceReviewedAt: '2026-08-30T12:00:00.000Z',
    reviewExpiresAt: '2027-08-30T12:00:00.000Z',
  },
  limits: {
    maxPayloadBytes: 1024,
    maxArchiveEntries: 10,
    maxExpandedBytes: 4096,
    maxCompressionRatio: 10,
    maxParserMilliseconds: 100,
    maxRedirects: 0,
    maxConcurrency: 1,
  },
  requiredFreshnessSeconds: null,
};

describe('WP-201 connector manifest and SDK', () => {
  it('validates independent lifecycle, authorization, acquisition, rights, and limits', () => {
    expect(validateConnectorManifest(syntheticManifest)).toEqual(syntheticManifest);
    expect(() =>
      validateConnectorManifest({
        ...syntheticManifest,
        authorization: undefined,
        rights: { ...syntheticManifest.rights, distribution: { public: true } },
      }),
    ).toThrow(/authorization.*distribution/);
  });

  it('ships a JSON Schema matching the runtime manifest contract', async () => {
    const schema = JSON.parse(
      await readFile(new URL('../schema/connector-manifest.schema.json', import.meta.url), 'utf8'),
    ) as unknown;
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    expect(ajv.validate(schema, syntheticManifest), JSON.stringify(ajv.errors)).toBe(true);
  });

  it('fails rights decisions closed and keeps lifecycle independent from authorization', () => {
    expect(
      evaluateSourceRights(syntheticManifest, {
        operation: 'distribute',
        distribution: 'public',
        now: '2026-09-01T00:00:00.000Z',
      }),
    ).toEqual({ allowed: true, reasons: [] });

    const permissionRequired = {
      ...syntheticManifest,
      authorization: 'permission-required' as const,
    };
    expect(
      evaluateSourceRights(permissionRequired, {
        operation: 'acquire',
        now: '2026-09-01T00:00:00.000Z',
      }),
    ).toEqual({ allowed: false, reasons: ['authorization-permission-required'] });

    expect(
      evaluateSourceRights(syntheticManifest, {
        operation: 'parse-field',
        field: 'owner_email',
        now: '2026-09-01T00:00:00.000Z',
      }),
    ).toEqual({ allowed: false, reasons: ['field-not-authorized'] });
  });

  it('runs every common connector stage for a synthetic fixture', async () => {
    const called: string[] = [];
    const connector: Connector<string, { readonly name: string }, string> = {
      manifest: syntheticManifest,
      discover: async () => {
        called.push('discover');
        return [
          {
            externalId: 'asset-1',
            sourcePartition: 'test',
            locator: 'file:///synthetic/one.json',
          },
        ];
      },
      fetch: async (asset) => {
        called.push('fetch');
        return {
          ...asset,
          payload: new TextEncoder().encode('{"name":"Synthetic Trail"}'),
          contentType: 'application/json',
          retrievedAt: '2026-09-01T00:00:00.000Z',
        };
      },
      storeRaw: async (asset) => {
        called.push('store_raw');
        return {
          ...asset,
          checksum: 'a'.repeat(64),
          byteLength: asset.payload.byteLength,
          storageKey: 'aa/raw',
        };
      },
      parse: async (asset) => {
        called.push('parse');
        return new TextDecoder().decode(asset.payload);
      },
      normalize: async (value) => {
        called.push('normalize');
        return JSON.parse(value) as { readonly name: string };
      },
      validate: async (value) => {
        called.push('validate');
        if (!value.name) throw new Error('name is required');
      },
      checkpoint: async () => {
        called.push('checkpoint');
      },
      emit: async (value) => {
        called.push('emit');
        return value.name;
      },
    };

    const result = await runConnector(connector, 'run-201', '2026-09-01T00:00:00.000Z');
    expect(result).toEqual({ emitted: ['Synthetic Trail'], quarantine: [] });
    expect(called).toEqual(CONNECTOR_STAGES);
  });
});
