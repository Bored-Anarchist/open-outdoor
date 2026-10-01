import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeCurlFetch } from '../lib/native-curl-fetch.mjs';

const root = resolve(import.meta.dirname, '../..');
const configPath = join(root, 'config/private-state-visitor-references.json');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stageRoot = (state) => join(root, 'PrivateData/reference/agency-visitors', state);

export function validateVisitorEvidence(evidence, html) {
  if (!evidence.requiredPatterns.every((pattern) => new RegExp(pattern, 'i').test(html)))
    throw new Error(`Agency visitor evidence changed: ${evidence.url}`);
}

export function attachVisitorReferences(features, references, state) {
  const output = features.map((feature) => ({ ...feature, properties: { ...feature.properties } }));
  const bindings = [];
  for (const profile of references.profiles) {
    if (profile.state !== state) throw new Error('Visitor reference state mismatch');
    const [west, south, east, north] = profile.matchBounds;
    const matches = output.filter((feature) => {
      const [x, y] = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : [];
      return (
        feature.properties.sourceId === profile.matchSourceId &&
        feature.properties.name === profile.name &&
        x >= west &&
        x <= east &&
        y >= south &&
        y <= north
      );
    });
    if (matches.length !== 1) throw new Error(`${profile.id}: expected exactly one existing place`);
    const feature = matches[0];
    Object.assign(feature.properties, {
      agency: profile.agency,
      agencyPhone: profile.agencyPhone,
      agencyWebsite: profile.agencyWebsite,
      address: profile.address,
      description: profile.description,
      amenities: profile.amenities,
      agencyVisitorReference: {
        profileId: profile.id,
        reviewedAt: references.reviewedAt,
        currentConditions: false,
        rightsStatus: 'Unconfirmed',
        publicDistribution: false,
        geometrySource: 'Existing private place; agency pages do not supply these coordinates',
        reservationUrl: profile.reservationUrl,
        mapPageUrl: profile.mapPageUrl,
        mapReferences: profile.mapReferences.map((map) => ({ ...map, format: 'raster-reference' })),
        sourceEvidence: references.sourceEvidence,
      },
    });
    bindings.push({ profileId: profile.id, featureId: feature.id });
  }
  return { features: output, bindings };
}

export async function readPrivateVisitorReferences(state) {
  const configBytes = await readFile(configPath);
  const config = JSON.parse(configBytes);
  const expectedProfiles = config.profiles.filter((profile) => profile.state === state);
  if (!expectedProfiles.length) return null;
  const bytes = await readFile(join(stageRoot(state), 'visitor-references.json'));
  const references = JSON.parse(bytes);
  if (
    references.configSha256 !== digest(configBytes) ||
    references.state !== state ||
    references.classification !== 'PRIVATE_USER' ||
    references.publicDistribution !== false ||
    JSON.stringify(references.profiles) !== JSON.stringify(expectedProfiles)
  )
    throw new Error('Private visitor references need re-staging after configuration changes');
  const expectedEvidence = new Map(
    expectedProfiles
      .flatMap((profile) => profile.evidence)
      .map((evidence) => [evidence.url, evidence]),
  );
  if (
    references.sourceEvidence.length !== expectedEvidence.size ||
    new Set(references.sourceEvidence.map((evidence) => evidence.url)).size !==
      expectedEvidence.size
  )
    throw new Error('Private visitor evidence inventory mismatch');
  for (const evidence of references.sourceEvidence) {
    if (
      !expectedEvidence.has(evidence.url) ||
      evidence.file !== `${digest(evidence.url).slice(0, 16)}.html`
    )
      throw new Error('Private visitor evidence source binding mismatch');
    const html = await readFile(join(stageRoot(state), evidence.file));
    if (digest(html) !== evidence.sha256 || html.length !== evidence.bytes)
      throw new Error('Private agency visitor evidence checksum mismatch');
    validateVisitorEvidence(expectedEvidence.get(evidence.url), html.toString('utf8'));
  }
  return { references, bytes, sha256: digest(bytes) };
}

export async function stagePrivateVisitorReferences(state) {
  if (!/^[A-Z]{2}$/.test(state)) throw new Error('Expected a state code');
  const configBytes = await readFile(configPath);
  const profiles = JSON.parse(configBytes).profiles.filter((profile) => profile.state === state);
  if (!profiles.length) throw new Error('No reviewed visitor references for this state');
  const directory = stageRoot(state);
  await mkdir(directory, { recursive: true });
  const evidenceByUrl = new Map();
  for (const profile of profiles)
    for (const evidence of profile.evidence) {
      if (evidenceByUrl.has(evidence.url)) continue;
      const response = await nativeCurlFetch(evidence.url);
      const bytes = Buffer.from(await response.arrayBuffer());
      const html = bytes.toString('utf8');
      validateVisitorEvidence(evidence, html);
      for (const map of profile.mapReferences ?? []) {
        if (evidence.url === profile.mapPageUrl && !html.includes(map.url))
          throw new Error(`Official map link changed: ${map.name}`);
      }
      const file = `${digest(evidence.url).slice(0, 16)}.html`;
      await writeFile(join(directory, file), bytes);
      evidenceByUrl.set(evidence.url, {
        url: evidence.url,
        file,
        bytes: bytes.length,
        sha256: digest(bytes),
      });
    }
  const references = {
    schemaVersion: 1,
    state,
    classification: 'PRIVATE_USER',
    publicDistribution: false,
    reviewedAt: new Date().toISOString(),
    configSha256: digest(configBytes),
    profiles,
    sourceEvidence: [...evidenceByUrl.values()],
  };
  await writeFile(
    join(directory, 'visitor-references.json'),
    JSON.stringify(references, null, 2) + '\n',
  );
  return { state, profiles: profiles.length, evidencePages: evidenceByUrl.size };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  console.log(JSON.stringify(await stagePrivateVisitorReferences(process.argv[2]?.toUpperCase())));
