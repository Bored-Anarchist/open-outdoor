import {
  AcquisitionSession,
  arcGisPageUrl,
  wfsPageUrl,
  type AcquiredPage,
  type AcquisitionCheckpoint,
} from './acquisition.js';

export interface AcquisitionSink {
  /** Atomically stage this page, keyed by source/URL/checksum so replay is idempotent. */
  readonly stage: (page: AcquiredPage) => Promise<void>;
  readonly checkpoint: (value: AcquisitionCheckpoint, nextUrl: string | null) => Promise<void>;
}
function json(page: AcquiredPage): Record<string, unknown> {
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(page.body));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('adapter expected a JSON object');
  return value as Record<string, unknown>;
}

export async function acquireRest(
  session: AcquisitionSession,
  url: string,
  signal: AbortSignal,
  sink: AcquisitionSink,
  next: (page: AcquiredPage) => string | null = () => null,
): Promise<void> {
  await session.pages(url, signal, next, sink.stage, sink.checkpoint);
}

export async function acquireBulk(
  session: AcquisitionSession,
  urls: readonly string[],
  signal: AbortSignal,
  sink: AcquisitionSink,
): Promise<void> {
  if (new Set(urls).size !== urls.length) throw new Error('duplicate bulk locator');
  for (const url of urls) await acquireRest(session, url, signal, sink);
}

/** ArcGIS object-ID discovery avoids unstable offset pagination. */
export async function acquireArcGis(
  session: AcquisitionSession,
  endpoint: string,
  pageSize: number,
  signal: AbortSignal,
  sink: AcquisitionSink,
): Promise<void> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) throw new Error('invalid ArcGIS page size');
  const discovery = new URL(endpoint);
  discovery.searchParams.set('f', 'json');
  discovery.searchParams.set('where', '1=1');
  discovery.searchParams.set('returnIdsOnly', 'true');
  const page = await session.request(discovery.href, signal);
  if (!page) throw new Error('missing ArcGIS discovery');
  const ids = json(page).objectIds;
  if (
    !Array.isArray(ids) ||
    ids.some((id) => !Number.isSafeInteger(id) || id < 0) ||
    new Set(ids).size !== ids.length
  )
    throw new Error('invalid ArcGIS object ID inventory');
  ids.sort((a: number, b: number) => a - b);
  for (let index = 0; index < ids.length; index += pageSize) {
    const batch = ids.slice(index, index + pageSize) as number[];
    await acquireRest(session, arcGisPageUrl(endpoint, batch), signal, sink, (result) => {
      const value = json(result);
      if (
        value.error ||
        value.exceededTransferLimit ||
        !Array.isArray(value.features) ||
        value.features.length !== batch.length
      )
        throw new Error('incomplete ArcGIS page');
      return null;
    });
  }
}

export async function acquireWfs(
  session: AcquisitionSession,
  endpoint: string,
  typeName: string,
  pageSize: number,
  signal: AbortSignal,
  sink: AcquisitionSink,
  startIndex = 0,
): Promise<void> {
  let start = startIndex;
  await session.pages(
    wfsPageUrl(endpoint, typeName, start, pageSize),
    signal,
    (page) => {
      const value = json(page);
      if (
        value.type !== 'FeatureCollection' ||
        !Array.isArray(value.features) ||
        value.features.length > pageSize ||
        (value.numberReturned !== undefined && value.numberReturned !== value.features.length)
      )
        throw new Error('invalid WFS feature page');
      const count = value.features.length;
      start += count;
      if (typeof value.numberMatched === 'number') {
        if (
          !Number.isSafeInteger(value.numberMatched) ||
          value.numberMatched < start ||
          (count === 0 && start < value.numberMatched)
        )
          throw new Error('incomplete WFS inventory');
        if (start === value.numberMatched) return null;
        if (count < pageSize) throw new Error('incomplete WFS inventory');
      }
      return count < pageSize ? null : wfsPageUrl(endpoint, typeName, start, pageSize);
    },
    sink.stage,
    sink.checkpoint,
  );
}

/** Feed payloads remain untrusted raw XML; links are never fetched by the adapter. */
export async function acquireFeed(
  session: AcquisitionSession,
  url: string,
  signal: AbortSignal,
  sink: AcquisitionSink,
  previous?: AcquisitionCheckpoint,
): Promise<void> {
  const page = await session.request(url, signal, previous);
  if (!page) return;
  const text = new TextDecoder('utf-8', { fatal: true }).decode(page.body);
  if (
    /<!DOCTYPE|<!ENTITY|<script\b|<\?xml-stylesheet|\0/i.test(text) ||
    !/^\s*(?:<\?xml[^?]*\?>\s*)?<(?:rss|feed)(?:\s|>)/i.test(text)
  )
    throw new Error('unsafe or unsupported feed');
  signal.throwIfAborted();
  await sink.stage(page);
  signal.throwIfAborted();
  await sink.checkpoint(page.checkpoint, null);
}
