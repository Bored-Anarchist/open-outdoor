import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquirePublicAgency } from './acquire-public-state-agency.mjs';
import { readFileSync } from 'node:fs';
import { conditionalPublicPolicy } from './conditional-public-agency.mjs';
import {
  publicAgencySourceClearance,
  verifyPublicAgencySourceLicense,
} from './public-agency-source-clearances.mjs';

test('Michigan dataset license clears only the exact hiking feed and requires an affirmative grant', () => {
  const source = JSON.parse(
    readFileSync(new URL('../config/public-state-agency-sources.json', import.meta.url)),
  ).sources.find((s) => s.id === 'mi-dnr-hiking');
  assert.ok(publicAgencySourceClearance(source));
  verifyPublicAgencySourceLicense(
    source,
    '<p>No restrictions on the use, reproduction, or distribution of this dataset.</p>',
  );
  for (const patch of [
    { url: source.url.replace('/2', '/1') },
    { state: 'MN' },
    { termsUrl: 'https://example.invalid/terms' },
    { rightsClearance: 'invented' },
  ])
    assert.equal(publicAgencySourceClearance({ ...source, ...patch }), null);
  for (const text of ['', 'Informational use only', 'Do not redistribute'])
    assert.throws(() => verifyPublicAgencySourceLicense(source, text), /not confirmed/);
});

test('conditional clearance is limited to exact noncommercial sources and filtered Minnesota fields', () => {
  const config = JSON.parse(
    readFileSync(new URL('../config/public-state-agency-sources.json', import.meta.url)),
  );
  const hiking = config.sources.find((s) => s.id === 'mn-dnr-hiking');
  const virginia = config.sources.find((s) => s.id === 'va-dcr-trails');
  assert.ok(conditionalPublicPolicy(hiking));
  assert.ok(conditionalPublicPolicy(virginia));
  for (const source of config.sources.filter((s) => s.distributionScope === 'noncommercial'))
    assert.ok(conditionalPublicPolicy(source));
  for (const patch of [
    { where: '1=1' },
    { fields: ['*'] },
    { distributionScope: 'commercial' },
    { url: hiking.url.replace('/0', '/1') },
  ])
    assert.equal(conditionalPublicPolicy({ ...hiking, ...patch }), null);
  assert.equal(conditionalPublicPolicy({ ...virginia, distributionScope: 'commercial' }), null);
});

test('North Carolina clearance binds the exact forest subset and requires both publisher and NC OneMap terms', () => {
  const source = JSON.parse(
    readFileSync(new URL('../config/public-state-agency-sources.json', import.meta.url)),
  ).sources.find((s) => s.id === 'nc-spo-forest-additions');
  const license =
    'Written release agreements to authorize use are not required and will not be issued. CGIA Terms: https://www.nconemap.gov/pages/terms';
  const policy = 'All partner organizations understand this free and unrestricted use policy.';
  verifyPublicAgencySourceLicense(source, license, policy);
  assert.throws(() => verifyPublicAgencySourceLicense(source, '', policy), /not confirmed/);
  assert.throws(() => verifyPublicAgencySourceLicense(source, license, ''), /not confirmed/);
  for (const patch of [
    { where: '1=1' },
    { url: source.url.replace('/0', '/1') },
    { state: 'LA' },
    { rightsClearance: 'invented' },
    { termsUrl: 'https://example.invalid' },
  ]) {
    const changed = { ...source, ...patch };
    assert.equal(publicAgencySourceClearance(changed), null);
    assert.throws(() => verifyPublicAgencySourceLicense(changed, license, policy), /not confirmed/);
  }
});

test('public acquisition rejects permission-held and conditional feeds before network or staging', async () => {
  const source = {
    id: 'synthetic',
    state: 'CT',
    url: 'https://example.invalid/0',
    basisUrl: 'https://example.invalid/catalog',
  };
  for (const rightsStatus of ['Unconfirmed', 'Permission required', 'Restricted', 'Conditional']) {
    await assert.rejects(
      acquirePublicAgency(source, [{ state: 'CT', url: source.basisUrl, rightsStatus }]),
      /lacks a Supported rights decision/,
    );
  }
  await assert.rejects(
    acquirePublicAgency(source, [{ state: 'NY', url: source.basisUrl, rightsStatus: 'Supported' }]),
    /lacks a Supported rights decision/,
  );
});
