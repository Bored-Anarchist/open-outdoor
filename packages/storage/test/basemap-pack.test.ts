import { describe, expect, it } from 'vitest';

import {
  BasemapManifestValidationError,
  basemapFileMatchesPin,
  evaluateBasemapStorage,
  initialBasemapActivationState,
  parsePinnedBasemapManifest,
  reduceBasemapActivation,
  type ActiveBasemapPack,
  type PinnedBasemapManifest,
} from '../src/index.js';

const digest = 'a'.repeat(64);

const manifestValue = {
  schemaVersion: 1,
  kind: 'basemap',
  packId: 'us-ny-standard',
  version: '2026-09-12',
  displayName: 'New York Standard',
  fileName: 'new-york-z12.pmtiles',
  byteLength: 134_642_224,
  sha256: digest,
  format: {
    type: 'pmtiles',
    specVersion: 3,
    minZoom: 0,
    maxZoom: 12,
  },
  coverage: {
    bounds: [-79.7624, 40.4774, -71.7517, 45.0159],
  },
  compatibility: {
    minimumAppVersion: '1.0.0',
    styleSchemaVersion: 1,
  },
  attribution: ['© OpenStreetMap contributors'],
};

function manifest(): PinnedBasemapManifest {
  return parsePinnedBasemapManifest(manifestValue);
}

describe('pinned basemap manifests', () => {
  it('strictly decodes a supported PMTiles pin', () => {
    expect(manifest()).toMatchObject({
      schemaVersion: 1,
      kind: 'basemap',
      packId: 'us-ny-standard',
      byteLength: 134_642_224,
      format: { specVersion: 3, minZoom: 0, maxZoom: 12 },
    });
  });

  it('rejects unknown fields instead of silently ignoring signed semantics', () => {
    expect(() =>
      parsePinnedBasemapManifest({ ...manifestValue, downloadUrl: 'https://x' }),
    ).toThrowError(BasemapManifestValidationError);
  });

  it.each([
    ['a directory traversal filename', { fileName: '../map.pmtiles' }],
    ['an uppercase digest', { sha256: 'A'.repeat(64) }],
    [
      'an unsupported PMTiles version',
      {
        format: { ...manifestValue.format, specVersion: 4 },
      },
    ],
    [
      'an inverted zoom range',
      {
        format: { ...manifestValue.format, minZoom: 13, maxZoom: 12 },
      },
    ],
    [
      'inverted geographic bounds',
      {
        coverage: { bounds: [-71, 40, -79, 45] },
      },
    ],
  ])('rejects %s', (_description, replacement) => {
    expect(() => parsePinnedBasemapManifest({ ...manifestValue, ...replacement })).toThrowError(
      BasemapManifestValidationError,
    );
  });

  it('matches an imported file only by exact length and digest', () => {
    const pin = manifest();
    expect(
      basemapFileMatchesPin(pin, {
        byteLength: pin.byteLength,
        sha256: pin.sha256,
      }),
    ).toBe(true);
    expect(
      basemapFileMatchesPin(pin, {
        byteLength: pin.byteLength - 1,
        sha256: pin.sha256,
      }),
    ).toBe(false);
    expect(
      basemapFileMatchesPin(pin, {
        byteLength: pin.byteLength,
        sha256: 'b'.repeat(64),
      }),
    ).toBe(false);
  });
});

describe('basemap activation storage', () => {
  it('requires candidate bytes and a reserve while retaining the old pack', () => {
    expect(
      evaluateBasemapStorage({
        incomingBytes: 100,
        reserveBytes: 25,
        availableBytes: 200,
      }),
    ).toEqual({
      status: 'ready',
      requiredBytes: 125,
      availableBytes: 200,
      remainingBytes: 75,
    });
  });

  it('reports the exact free-space shortfall', () => {
    expect(
      evaluateBasemapStorage({
        incomingBytes: 100,
        reserveBytes: 25,
        availableBytes: 120,
      }),
    ).toEqual({
      status: 'insufficient-space',
      requiredBytes: 125,
      availableBytes: 120,
      missingBytes: 5,
    });
  });
});

describe('atomic basemap activation model', () => {
  const oldPack: ActiveBasemapPack = {
    packId: 'us-ny-standard',
    version: 'old',
    localUri: 'file:///installed/old/basemap.pmtiles',
    sha256: 'b'.repeat(64),
  };

  const installed: ActiveBasemapPack = {
    packId: 'us-ny-standard',
    version: '2026-09-12',
    localUri: 'file:///installed/new/basemap.pmtiles',
    sha256: digest,
  };

  it('does not expose the candidate as active until atomic commit', () => {
    const pin = manifest();
    const staging = reduceBasemapActivation(initialBasemapActivationState(oldPack), {
      type: 'begin',
      candidate: pin,
    });
    const verified = reduceBasemapActivation(staging, { type: 'verified' });
    const committing = reduceBasemapActivation(verified, {
      type: 'begin-commit',
    });

    expect(staging.active).toBe(oldPack);
    expect(verified.active).toBe(oldPack);
    expect(committing.active).toBe(oldPack);

    const committed = reduceBasemapActivation(committing, {
      type: 'commit',
      installed,
    });
    expect(committed).toEqual({ phase: 'idle', active: installed });
  });

  it('retains the previous active pack when any pre-commit phase fails', () => {
    const staging = reduceBasemapActivation(initialBasemapActivationState(oldPack), {
      type: 'begin',
      candidate: manifest(),
    });
    const failed = reduceBasemapActivation(staging, {
      type: 'fail',
      error: 'hash mismatch',
    });

    expect(failed).toMatchObject({
      phase: 'failed',
      active: oldPack,
      error: 'hash mismatch',
    });
    expect(reduceBasemapActivation(failed, { type: 'reset' })).toEqual({
      phase: 'idle',
      active: oldPack,
    });
  });

  it('rejects out-of-order transitions and a mismatched commit', () => {
    expect(() =>
      reduceBasemapActivation(initialBasemapActivationState(), {
        type: 'verified',
      }),
    ).toThrowError('Invalid basemap activation transition');

    const staging = reduceBasemapActivation(initialBasemapActivationState(), {
      type: 'begin',
      candidate: manifest(),
    });
    const verified = reduceBasemapActivation(staging, { type: 'verified' });
    const committing = reduceBasemapActivation(verified, {
      type: 'begin-commit',
    });
    expect(() =>
      reduceBasemapActivation(committing, {
        type: 'commit',
        installed: { ...installed, localUri: 'https://example.test/map.pmtiles' },
      }),
    ).toThrowError('does not match the verified candidate');
  });
});
