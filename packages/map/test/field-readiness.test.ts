import { describe, expect, it } from 'vitest';
import { evaluateFieldReadiness, type FieldConditions } from '../src/index.js';

const ready: FieldConditions = {
  networkAvailable: false,
  offlineCatalogReady: true,
  locationAuthorization: 'always',
  horizontalAccuracyM: 8,
  freeStorageBytes: 3 * 1024 ** 3,
  batteryPercent: 75,
  thermalState: 'nominal',
  provisioningValid: true,
};

describe('WP-307 field-facing degraded and error states', () => {
  it('makes offline readiness explicit without relying on color', () => {
    expect(evaluateFieldReadiness(ready)).toMatchObject({
      state: 'ready',
      code: 'READY_OFFLINE',
      icon: 'check',
      capabilities: { browse: true, search: true, record: true },
    });
  });

  it.each([
    [{ ...ready, horizontalAccuracyM: 80 }, 'DEGRADED_GPS', true],
    [{ ...ready, batteryPercent: 10 }, 'DEGRADED_POWER', true],
    [{ ...ready, offlineCatalogReady: false }, 'BLOCKED_CATALOG', false],
    [{ ...ready, locationAuthorization: 'denied' as const }, 'BLOCKED_LOCATION', false],
    [{ ...ready, freeStorageBytes: 100 }, 'BLOCKED_STORAGE', false],
    [{ ...ready, provisioningValid: false }, 'BLOCKED_PROVISIONING', false],
  ])('reports actionable state %s', (conditions, code, record) => {
    const result = evaluateFieldReadiness(conditions as FieldConditions);
    expect(result.code).toBe(code);
    expect(result.capabilities.record).toBe(record);
    expect(result.accessibilityLabel).toContain(result.headline);
  });
});
