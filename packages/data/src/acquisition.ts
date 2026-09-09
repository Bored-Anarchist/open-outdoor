// Shared acquisition adapters are laptop-side infrastructure, never mobile fetch code.
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  evaluateSourceRights,
  validateConnectorManifest,
  type ConnectorManifest,
} from './connector.js';
import {
  IngestionSecurityError,
  inspectArchiveEntries,
  type ArchiveEntryMetadata,
} from './ingestion.js';

export type AdapterKind = 'rest' | 'bulk' | 'arcgis' | 'wfs' | 'feed' | 'local' | 'overlay';
export interface AcquisitionPolicy {
  readonly contentTypes: readonly string[];
  readonly maxRunBytes: number;
  readonly maxPages: number;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly retryDelayMs: number;
}
export interface AcquisitionCheckpoint {
  readonly sourceId: string;
  readonly connectorVersion: string;
  readonly url: string;
  readonly checksum: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
}
export interface AcquiredPage {
  readonly url: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly checkpoint: AcquisitionCheckpoint;
}
export interface AcquisitionPorts {
  readonly fetch?: typeof fetch;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

function denied(message: string): never {
  throw new IngestionSecurityError('boundary-violation', message);
}

/** Exact host allowlisting applies again to every redirect and pagination URL. */
export function assertAcquisitionUrl(value: string, manifest: ConnectorManifest): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return denied('invalid acquisition URL');
  }
  if (
    url.protocol !== 'https:' ||
    !manifest.allowedTransports.includes('https') ||
    !manifest.allowedHosts.includes(url.hostname) ||
    url.username ||
    url.password ||
    (url.port !== '' && url.port !== '443') ||
    url.hash
  )
    denied('acquisition URL is not allowed');
  // Credentials belong in transport ports, never persisted in locators/checkpoints.
  for (const key of url.searchParams.keys()) {
    if (/token|secret|password|credential|api.?key|signature/i.test(key))
      denied('secret query parameter');
  }
  return url;
}

export class AcquisitionSession {
  readonly manifest: ConnectorManifest;
  private bytes = 0;
  private requests = 0;
  private active = false;
  constructor(
    manifest: ConnectorManifest,
    readonly policy: AcquisitionPolicy,
    readonly now: string,
    readonly ports: AcquisitionPorts = {},
  ) {
    this.manifest = validateConnectorManifest(manifest);
    for (const key of ['maxRunBytes', 'maxPages', 'timeoutMs'] as const) {
      if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0)
        denied('invalid acquisition budget');
    }
    if (
      !Number.isSafeInteger(policy.retries) ||
      policy.retries < 0 ||
      policy.retries > 10 ||
      !Number.isSafeInteger(policy.retryDelayMs) ||
      policy.retryDelayMs < 0 ||
      policy.retryDelayMs > 60_000 ||
      policy.contentTypes.length === 0
    )
      denied('invalid retry/content policy');
  }

  private authorize(mode: ConnectorManifest['acquisitionMode']): void {
    const decision = evaluateSourceRights(this.manifest, {
      operation: 'acquire',
      acquisitionMode: mode,
      now: this.now,
    });
    if (!decision.allowed)
      throw new IngestionSecurityError('rights-denied', decision.reasons.join(','));
  }

  private consume(count: number): void {
    this.bytes += count;
    if (this.bytes > this.policy.maxRunBytes)
      throw new IngestionSecurityError('payload-limit', 'run byte budget exceeded');
  }

  /** One in-flight request per session conservatively satisfies every manifest concurrency cap. */
  async request(
    locator: string,
    signal: AbortSignal,
    previous?: AcquisitionCheckpoint,
  ): Promise<AcquiredPage | null> {
    if (this.active) denied('concurrent session request');
    this.active = true;
    try {
      return await this.fetchPage(locator, signal, previous);
    } finally {
      this.active = false;
    }
  }

  /** Returns null only when a caller-provided durable checkpoint is still current. */
  private async fetchPage(
    locator: string,
    signal: AbortSignal,
    previous?: AcquisitionCheckpoint,
  ): Promise<AcquiredPage | null> {
    this.authorize('automated');
    let url = assertAcquisitionUrl(locator, this.manifest).href;
    if (++this.requests > this.policy.maxPages) denied('run page budget exceeded');
    if (
      previous &&
      (previous.sourceId !== this.manifest.sourceId ||
        previous.connectorVersion !== this.manifest.connectorVersion ||
        previous.url !== url ||
        !/^[a-f0-9]{64}$/.test(previous.checksum))
    )
      denied('checkpoint does not match source');
    const timeout = AbortSignal.timeout(this.policy.timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    let redirects = 0;
    let attempt = 0;
    while (true) {
      combined.throwIfAborted();
      const headers = new Headers();
      if (previous?.etag) headers.set('If-None-Match', previous.etag);
      else if (previous?.lastModified) headers.set('If-Modified-Since', previous.lastModified);
      let response: Response;
      try {
        response = await (this.ports.fetch ?? fetch)(url, {
          headers,
          signal: combined,
          redirect: 'manual',
        });
      } catch {
        combined.throwIfAborted();
        if (attempt++ >= this.policy.retries) denied('network retries exhausted');
        const ms = Math.min(60_000, this.policy.retryDelayMs * 2 ** (attempt - 1));
        await (
          this.ports.wait ??
          (async (waitMs, abort) => {
            await delay(waitMs, undefined, { signal: abort });
          })
        )(ms, combined);
        continue;
      }
      // A custom transport must preserve manual redirects as well.
      if (response.redirected) {
        await response.body?.cancel();
        denied('transport followed an unchecked redirect');
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || ++redirects > this.manifest.limits.maxRedirects)
          denied('redirect limit exceeded');
        url = assertAcquisitionUrl(new URL(location, url).href, this.manifest).href;
        continue;
      }
      if (response.status === 429 || [500, 502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        if (attempt++ >= this.policy.retries) denied('acquisition retries exhausted');
        const retryAfter = response.headers.get('retry-after');
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const serverDelay = Number.isFinite(seconds)
          ? seconds * 1000
          : retryAfter
            ? Date.parse(retryAfter) - Date.parse(this.now)
            : 0;
        if (serverDelay > 60_000) denied('server requested deferred retry');
        const backoff = Math.ceil(
          this.policy.retryDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random() / 2),
        );
        const milliseconds = Math.min(60_000, Math.max(0, serverDelay || 0, backoff));
        await (
          this.ports.wait ??
          (async (ms, abort) => {
            await delay(ms, undefined, { signal: abort });
          })
        )(milliseconds, combined);
        continue;
      }
      if (response.status === 304) {
        await response.body?.cancel();
        if (!previous) denied('unexpected not-modified response');
        return null;
      }
      if (response.status !== 200) {
        await response.body?.cancel();
        denied(`acquisition HTTP status ${response.status}`);
      }
      const contentType = (response.headers.get('content-type') ?? '')
        .split(';')[0]!
        .trim()
        .toLowerCase();
      if (!this.policy.contentTypes.includes(contentType)) {
        await response.body?.cancel();
        denied('unexpected content type');
      }
      const length = response.headers.get('content-length');
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) > this.manifest.limits.maxPayloadBytes)
      ) {
        await response.body?.cancel();
        throw new IngestionSecurityError('payload-limit', 'payload length exceeds limit');
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body?.getReader();
      try {
        if (reader)
          while (true) {
            combined.throwIfAborted();
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            this.consume(chunk.value.byteLength);
            if (size > this.manifest.limits.maxPayloadBytes)
              throw new IngestionSecurityError('payload-limit', 'stream exceeds payload limit');
            chunks.push(chunk.value);
          }
      } finally {
        await reader?.cancel();
        reader?.releaseLock();
      }
      combined.throwIfAborted();
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      return {
        url,
        body,
        contentType,
        checkpoint: {
          sourceId: this.manifest.sourceId,
          connectorVersion: this.manifest.connectorVersion,
          url: new URL(locator).href,
          checksum: createHash('sha256').update(body).digest('hex'),
          etag: response.headers.get('etag'),
          lastModified: response.headers.get('last-modified'),
        },
      };
    }
  }

  /** Commit the cursor only after the consumer durably stages the whole page. */
  async pages(
    first: string,
    signal: AbortSignal,
    next: (page: AcquiredPage) => string | null,
    stage: (page: AcquiredPage) => Promise<void>,
    save: (checkpoint: AcquisitionCheckpoint, nextUrl: string | null) => Promise<void>,
  ): Promise<void> {
    let url: string | null = first;
    const visited = new Set<string>();
    while (url !== null) {
      const normalized: string = assertAcquisitionUrl(url, this.manifest).href;
      if (visited.has(normalized)) denied('pagination cycle');
      visited.add(normalized);
      const page = await this.request(normalized, signal);
      if (!page) denied('unexpected empty page');
      const candidate = next(page);
      const following: string | null =
        candidate === null
          ? null
          : assertAcquisitionUrl(new URL(candidate, normalized).href, this.manifest).href;
      signal.throwIfAborted();
      await stage(page);
      signal.throwIfAborted();
      await save(page.checkpoint, following);
      url = following;
    }
  }

  local(selection: {
    readonly userSelected: true;
    readonly bytes: Uint8Array;
    readonly contentType: string;
  }): Uint8Array {
    this.authorize(
      this.manifest.acquisitionMode === 'user-export' ? 'user-export' : 'manual-import',
    );
    if (
      selection.userSelected !== true ||
      !this.manifest.allowedTransports.includes('file') ||
      !this.policy.contentTypes.includes(selection.contentType)
    )
      denied('local import requires a selected allowed file');
    if (selection.bytes.length > this.manifest.limits.maxPayloadBytes)
      throw new IngestionSecurityError('payload-limit', 'local payload limit exceeded');
    this.consume(selection.bytes.length);
    return selection.bytes.slice();
  }
}

export function arcGisPageUrl(endpoint: string, objectIds: readonly number[]): string {
  if (objectIds.length === 0 || objectIds.some((id) => !Number.isSafeInteger(id) || id < 0))
    denied('invalid ArcGIS object IDs');
  const url = new URL(endpoint);
  url.searchParams.set('f', 'geojson');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('objectIds', [...new Set(objectIds)].sort((a, b) => a - b).join(','));
  return url.href;
}

export function wfsPageUrl(
  endpoint: string,
  typeName: string,
  start: number,
  count: number,
): string {
  if (
    !/^[\w:.-]+$/.test(typeName) ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(count) ||
    count < 1
  )
    denied('invalid WFS page');
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    startIndex: String(start),
    count: String(count),
    outputFormat: 'application/json',
    srsName: 'urn:ogc:def:crs:OGC:1.3:CRS84',
  }))
    url.searchParams.set(key, value);
  return url.href;
}

/** Validate archive inventory before the caller invokes an isolated format-specific decoder. */
export function inspectBulkArchive(
  entries: readonly ArchiveEntryMetadata[],
  manifest: ConnectorManifest,
): void {
  validateConnectorManifest(manifest);
  for (const entry of entries) {
    const parts = entry.path.replaceAll('\\', '/').split('/');
    if (
      parts.length > 16 ||
      parts.some(
        (part) =>
          /[:\x00-\x1f]/.test(part) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      )
    )
      denied('unsafe archive entry');
  }
  inspectArchiveEntries(entries, {
    maxEntries: manifest.limits.maxArchiveEntries,
    maxExpandedBytes: manifest.limits.maxExpandedBytes,
    maxCompressionRatio: manifest.limits.maxCompressionRatio,
  });
}

export function displayOverlay(
  manifest: ConnectorManifest,
  url: string,
  now: string,
): {
  readonly kind: 'display-only';
  readonly url: string;
  readonly attribution: readonly string[];
  readonly offlineAllowed: boolean;
  readonly queryable: false;
} {
  const decision = evaluateSourceRights(manifest, {
    operation: 'acquire',
    acquisitionMode: 'overlay',
    now,
  });
  if (!decision.allowed)
    throw new IngestionSecurityError('rights-denied', decision.reasons.join(','));
  return {
    kind: 'display-only',
    url: assertAcquisitionUrl(url, manifest).href,
    attribution: [...manifest.rights.attribution],
    offlineAllowed: manifest.rights.offlineStorage,
    queryable: false,
  };
}
