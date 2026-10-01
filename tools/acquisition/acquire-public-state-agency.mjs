import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadStateAgencyFeedCatalog } from './state-agency-feeds.mjs';
import { nativeCurlFetch } from '../lib/native-curl-fetch.mjs';
import { conditionalPublicPolicy } from './conditional-public-agency.mjs';
import { assertVisitorSource } from './state-visitor-source-scope.mjs';
import { reusableSource, sourceSignature } from '../packages/package-source-cache.mjs';
import {
  publicAgencySourceClearance,
  verifyPublicAgencySourceLicense,
} from './public-agency-source-clearances.mjs';

const root = resolve(import.meta.dirname, '../..');
export const publicAgencyStaging = join(root, '.scratch/public-agency');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function request(url, params) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await nativeCurlFetch(
        url,
        params
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams(params),
            }
          : {},
      );
      const value = await response.json();
      if (value.error) throw new Error(JSON.stringify(value.error));
      return value;
    } catch (e) {
      error = e;
    }
  }
  throw error;
}

export async function acquirePublicAgency(source, catalog, { refresh = false } = {}) {
  assertVisitorSource(source);
  const policy = conditionalPublicPolicy(source);
  const clearance = publicAgencySourceClearance(source);
  const decision =
    catalog.find((feed) => feed.state === source.state && feed.url === source.basisUrl) ??
    (clearance && source.id === 'nc-spo-forest-additions' ? { rightsStatus: 'Supported' } : null);
  if (
    !decision ||
    !(
      decision.rightsStatus === 'Supported' ||
      (decision.rightsStatus === 'Conditional' && policy) ||
      (decision.rightsStatus === 'Permission required' && clearance)
    )
  )
    throw new Error(`${source.id}: public source lacks a Supported rights decision`);
  const directory = join(publicAgencyStaging, source.id);
  await mkdir(directory, { recursive: true });
  if (source.format === 'file-geodatabase') {
    const archive = Buffer.from(await (await nativeCurlFetch(source.url)).arrayBuffer());
    if (archive.subarray(0, 4).toString('hex') !== '504b0304')
      throw new Error('Not a ZIP geodatabase');
    await writeFile(join(directory, 'raw.zip'), archive);
    const conversion = spawnSync(
      process.env.PUBLIC_AGENCY_PYTHON ?? 'python',
      [
        join(root, 'tools/acquisition/convert-public-agency-geodatabase.py'),
        join(directory, 'raw.zip'),
        join(directory, 'raw.geojson'),
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    if (conversion.status !== 0)
      throw new Error(conversion.stderr || 'Geodatabase conversion failed');
    const converted = JSON.parse(conversion.stdout.trim());
    const raw = await readFile(join(directory, 'raw.geojson'));
    const receipt = {
      ...source,
      rightsStatus: 'Supported',
      publicDistribution: true,
      retrievedAt: new Date().toISOString(),
      sourceUpdated: source.vintage,
      featureCount: converted.featureCount,
      bytes: raw.length,
      sha256: digest(raw),
      archiveSha256: digest(archive),
      archiveBytes: archive.length,
      inputCrs: converted.inputCrs,
      fields: converted.fields,
      idField: 'FID',
      termsEvidence:
        'docs/archive/reports/STATE_AGENCY_REDISTRIBUTION_RIGHTS_2026-09-26.md; CAL FIRE credited distribution and marked modifications',
      modifications:
        'Reprojected to WGS84; selected visitor fields; historical boundary reference; no current access claim.',
    };
    await writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
  }
  const metadata = await request(source.url + '?f=json');
  if (!metadata.geometryType || !metadata.fields) throw new Error('Not an exact feature layer');
  const service = await request(source.url.replace(/\/\d+$/, '') + '?f=json');
  let item = null;
  if (service.serviceItemId) {
    const portal = source.portalUrl ?? 'https://www.arcgis.com';
    try {
      item = await request(`${portal}/sharing/rest/content/items/${service.serviceItemId}?f=json`);
    } catch (error) {
      if (source.state !== 'NV') throw error;
    }
  }
  const itemInfo = await request(source.url.replace(/\/\d+$/, '') + '/info/iteminfo?f=json');
  const licenseText = String(
    item?.licenseInfo ?? itemInfo.licenseInfo ?? itemInfo.accessInformation ?? '',
  );
  if (
    source.license === 'CC0-1.0' &&
    !/CC0|creative\s*commons.{0,50}zero/i.test(licenseText.replace(/<[^>]+>/g, ' '))
  )
    throw new Error(`${source.id}: live CC0 terms not confirmed`);
  if (source.id === 'ne-park-areas' && !/no restrictions.*(?:use|distribution)/is.test(licenseText))
    throw new Error(`${source.id}: unrestricted distribution not confirmed`);
  if (
    source.id === 'co-cpw-trails' &&
    !/public.*(?:distribut|download)|distribut.*public/is.test(
      JSON.stringify(itemInfo) + ' ' + JSON.stringify(item),
    )
  )
    throw new Error(`${source.id}: current CPW distribution statement not confirmed`);
  let termsText = '';
  let disclaimer;
  if (source.termsUrl && !source.termsUrl.includes('/info/iteminfo')) {
    termsText = Buffer.from(
      await (await nativeCurlFetch(source.termsUrl)).arrayBuffer(),
    ).toString();
    if (source.state === 'MA' && !/freely redistributed.*derivative/is.test(termsText))
      throw new Error('MassGIS live derivative terms not confirmed');
    if (source.state === 'UT' && !/Creative Commons Attribution 4\.0/i.test(termsText))
      throw new Error('UGRC live terms not confirmed');
    if (
      source.state === 'AR' &&
      !/no.*(?:access|use).*limitation|access constraints.*none|use constraints.*none/is.test(
        termsText,
      )
    )
      throw new Error('Arkansas item-specific terms not confirmed');
    if (source.state === 'UT') {
      const plain = termsText
        .replace(/<[^>]+>/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');
      disclaimer = plain.match(
        /The data, including but not limited to geographic data,[\s\S]*?discontinue use of the data\./,
      )?.[0];
      if (!disclaimer) throw new Error('UGRC mandatory unmodified disclaimer missing');
    }
  }
  if (clearance) verifyPublicAgencySourceLicense(source, licenseText, termsText);
  if (
    source.id === 'nc-spo-forest-additions' &&
    service.serviceItemId !== 'fcb3d26b5a644d78805678203153f15d'
  )
    throw new Error('North Carolina publisher item binding changed');
  let conditionalEvidence;
  if (policy?.state === 'MN') {
    const plain = termsText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (
      !/creation of derivative works/i.test(plain) ||
      !/in its entirety may not be/i.test(plain) ||
      !/MNDNR must be acknowledged/i.test(plain) ||
      !/should not be used for navigational purposes/i.test(plain)
    )
      throw new Error('MNDNR current derivative conditions not confirmed');
    const metadataUrl = `https://www.arcgis.com/sharing/rest/content/items/${service.serviceItemId}/info/metadata/metadata.xml`;
    const xml = Buffer.from(await (await nativeCurlFetch(metadataUrl)).arrayBuffer()).toString();
    if (!/dnr\.state\.mn\.us\/sitetools\/data_software_license\.html/i.test(xml))
      throw new Error('Exact Minnesota item does not bind the reviewed DNR license');
    conditionalEvidence = { url: metadataUrl, sha256: digest(xml) };
    disclaimer = (termsText.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!disclaimer.includes('Terms and Conditions'))
      throw new Error('MNDNR complete notice missing');
  }
  if (
    policy?.state === 'VA' &&
    !/re-distribution.{0,60}for profit is prohibited/i.test(licenseText)
  )
    throw new Error('Virginia current noncommercial redistribution condition not confirmed');
  let fullSourceCount;
  if (policy?.state === 'MN') {
    fullSourceCount = (
      await request(source.url + '/query', { where: '1=1', returnCountOnly: 'true', f: 'json' })
    ).count;
  }
  const inventory = await request(source.url + '/query', {
    where: source.where ?? '1=1',
    returnIdsOnly: 'true',
    f: 'json',
  });
  if (!Array.isArray(inventory.objectIds)) throw new Error('Invalid ID inventory');
  const ids = [...new Set(inventory.objectIds)].sort((a, b) => a - b);
  if (policy?.state === 'MN' && !(ids.length > 0 && ids.length < fullSourceCount))
    throw new Error('Minnesota visitor selection must be a proper subset of the complete dataset');
  const sourceRevision = metadata.editingInfo?.lastEditDate;
  const refreshSignature = sourceSignature({
    source,
    metadata,
    ids,
    serviceItemId: service.serviceItemId,
    licenseText,
    termsText,
    upstreamRightsStatus: decision.rightsStatus,
    fullSourceCount,
    conditionalEvidence,
  });
  const cached = !refresh && (await reusableSource(directory, refreshSignature, sourceRevision));
  if (cached) {
    console.log(`${source.id}: verified source unchanged; reusing local data`);
    return cached;
  }
  const features = [];
  const pages = [];
  const idField = inventory.objectIdFieldName ?? metadata.objectIdField;
  for (let offset = 0; offset < ids.length; offset += 200) {
    const expected = ids.slice(offset, offset + 200);
    const page = await request(source.url + '/query', {
      objectIds: expected.join(','),
      outFields: source.fields?.join(',') ?? '*',
      outSR: '4326',
      returnGeometry: 'true',
      geometryPrecision: '5',
      maxAllowableOffset: '0.00003',
      f: 'geojson',
    });
    const actual = page.features?.map((f) => Number(f.properties?.[idField] ?? f.id));
    if (
      page.type !== 'FeatureCollection' ||
      page.exceededTransferLimit ||
      actual?.length !== expected.length ||
      new Set(actual).size !== expected.length ||
      actual.some((id) => !expected.includes(id))
    )
      throw new Error(`${source.id}: incomplete or mismatched feature page`);
    features.push(...page.features);
    pages.push({
      count: actual.length,
      sha256: digest(JSON.stringify(page)),
      firstId: expected[0],
      lastId: expected.at(-1),
    });
    if (offset % 2000 === 0) console.log(`${source.id}: ${features.length}/${ids.length}`);
  }
  if (Number.isSafeInteger(sourceRevision) && sourceRevision > 0) {
    const after = await request(source.url + '?f=json');
    if (sourceSignature(after) !== sourceSignature(metadata))
      throw new Error(`${source.id}: source changed during acquisition; retry`);
  }
  const bytes = Buffer.from(JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
  const receipt = {
    ...source,
    refreshSignature,
    ...(Number.isSafeInteger(sourceRevision) && sourceRevision > 0 ? { sourceRevision } : {}),
    rightsStatus: 'Supported',
    upstreamRightsStatus: decision.rightsStatus,
    ...(clearance
      ? {
          rightsResolution: 'dataset-specific-license-overrides-general-website-policy',
          distributionConditions:
            source.id === 'nc-spo-forest-additions'
              ? 'NC OneMap permits free and unrestricted use. Credit NC DOA/SPO, CGIA and NC OneMap; retain source disclaimers. No warranty or manager endorsement. Informational property geometry; access and camping permission unverified. Source data remain outside the project code license.'
              : 'Michigan DNR public-record dataset; use, reproduction and distribution unrestricted under the source terms. Provided AS IS; current access and conditions remain unverified. Source data are outside the project code license.',
        }
      : {}),
    ...(policy
      ? {
          distributionScope: 'noncommercial',
          distributionConditions: policy.conditions,
          conditionalClearance: 'conditions-satisfied-for-this-processed-distribution',
          ...(fullSourceCount ? { fullSourceCount, selectedFeatureCount: ids.length } : {}),
          ...(conditionalEvidence ? { conditionalEvidence } : {}),
          ...(source.fields ? { selectedFields: source.fields } : {}),
        }
      : {}),
    publicDistribution: true,
    retrievedAt: new Date().toISOString(),
    sourceUpdated:
      source.vintage ??
      (metadata.editingInfo?.lastEditDate
        ? new Date(metadata.editingInfo.lastEditDate).toISOString()
        : 'Not supplied'),
    featureCount: features.length,
    bytes: bytes.length,
    sha256: digest(bytes),
    metadataSha256: digest(JSON.stringify(metadata)),
    termsSha256: digest(termsText || licenseText),
    licenseText,
    ...(source.id === 'nc-spo-forest-additions' ? { termsText } : {}),
    ...(disclaimer ? { disclaimer } : {}),
    serviceItemId: service.serviceItemId ?? null,
    fields: metadata.fields.map((f) => f.name),
    idField,
    pages,
    modifications: `${policy?.state === 'MN' ? 'Filtered visitor subset, technical/source fields excluded; ' : ''}Selected source fields; WGS84, five decimal places, source simplification 0.00003 degrees; POI taxonomy normalized. Not manager endorsed.`,
  };
  await writeFile(join(directory, 'raw.geojson'), bytes);
  await writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = JSON.parse(await readFile(join(root, 'config/public-state-agency-sources.json')));
  const catalog = await loadStateAgencyFeedCatalog();
  const results = [];
  const refresh = process.argv.includes('--refresh');
  const requested = process.argv.slice(2).filter((arg) => !['--refresh', '--'].includes(arg));
  if (requested.some((id) => !config.sources.some((s) => s.id === id)))
    throw new Error('Unknown public source ID');
  await mkdir(publicAgencyStaging, { recursive: true });
  for (const source of config.sources.filter(
    (s) => !requested.length || requested.includes(s.id),
  )) {
    try {
      const r = await acquirePublicAgency(source, catalog, { refresh });
      results.push({ id: source.id, status: 'acquired', count: r.featureCount });
    } catch (error) {
      results.push({ id: source.id, status: 'failed', error: String(error) });
      console.error(source.id, String(error));
    }
  }
  await writeFile(
    join(publicAgencyStaging, 'acquisition-report.json'),
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results));
  if (results.some((x) => x.status === 'failed')) process.exitCode = 1;
}
