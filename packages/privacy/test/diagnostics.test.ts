import { describe, expect, it } from 'vitest';
import { authorizeDiagnosticExport, diagnosticExpiry, redactDiagnostic } from '../src/index.js';

describe('local diagnostics contract', () => {
  it('redacts secrets, identifiers, and precise locations recursively', () => {
    const value = redactDiagnostic({
      authorization: 'Bearer test-token',
      event: { latitude: 40.7128, longitude: -74.006, message: 'Bearer abc.def' },
    });
    expect(value).toEqual({
      authorization: '[REDACTED]',
      event: { latitude: '[REDACTED]', longitude: '[REDACTED]', message: 'Bearer [REDACTED]' },
    });
  });

  it('bounds retention', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    expect(diagnosticExpiry(created).toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(() => diagnosticExpiry(created, 73)).toThrow(RangeError);
  });

  it('requires both user preview and explicit export', () => {
    expect(() =>
      authorizeDiagnosticExport({ previewAccepted: true, explicitExportRequested: false }),
    ).toThrow(/explicit export/);
    expect(() =>
      authorizeDiagnosticExport({ previewAccepted: false, explicitExportRequested: true }),
    ).toThrow(/accepted preview/);
    expect(() =>
      authorizeDiagnosticExport({ previewAccepted: true, explicitExportRequested: true }),
    ).not.toThrow();
  });
});
