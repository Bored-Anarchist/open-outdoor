const forbiddenKey =
  /(?:authorization|cookie|email|latitude|longitude|pass(?:word|phrase)?|secret|token|user.?id)/i;

export type DiagnosticScalar = boolean | number | string | null;
export type DiagnosticValue =
  DiagnosticScalar | DiagnosticValue[] | { readonly [key: string]: DiagnosticValue };

export function redactDiagnostic(value: DiagnosticValue): DiagnosticValue {
  if (Array.isArray(value)) return value.map(redactDiagnostic);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        forbiddenKey.test(key) ? '[REDACTED]' : redactDiagnostic(item),
      ]),
    );
  }
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
      .replace(/\b[A-F0-9]{32,}\b/gi, '[REDACTED]');
  }
  return value;
}

export function diagnosticExpiry(createdAt: Date, maximumHours = 24): Date {
  if (!Number.isInteger(maximumHours) || maximumHours < 1 || maximumHours > 72) {
    throw new RangeError('diagnostic retention must be between 1 and 72 hours');
  }
  return new Date(createdAt.getTime() + maximumHours * 60 * 60 * 1000);
}

export interface DiagnosticExportConsent {
  readonly explicitExportRequested: boolean;
  readonly previewAccepted: boolean;
}

export function authorizeDiagnosticExport(consent: DiagnosticExportConsent): void {
  if (!consent.previewAccepted || !consent.explicitExportRequested) {
    throw new Error('diagnostic export requires accepted preview and an explicit export request');
  }
}
