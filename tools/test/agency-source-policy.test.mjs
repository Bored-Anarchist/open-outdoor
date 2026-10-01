import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadAgencySourcePolicy,
  validateAgencySourcePolicy,
} from '../acquisition/agency-source-policy.mjs';
import { loadStateAgencyFeedCatalog } from '../acquisition/state-agency-feeds.mjs';

test('structured policy retains all historical rights and selected-plan records', async () => {
  const policy = await loadAgencySourcePolicy();
  assert.equal(policy.rights.length, 142);
  assert.equal(policy.planned.length, 19);
  const feeds = await loadStateAgencyFeedCatalog();
  assert.equal(feeds.length, 231);
  assert.equal(feeds.filter((feed) => feed.provisionalPrivateValidation).length, 107);
  assert.equal(feeds.filter((feed) => feed.permissionRequiredPrivateValidation).length, 3);
});

test('policy rejects unknown classifications, duplicate keys and incomplete plans', async () => {
  const original = await loadAgencySourcePolicy();
  for (const mutate of [
    (policy) => {
      policy.rights[0].status = 'Approved without evidence';
    },
    (policy) => {
      policy.rights.push({ ...policy.rights[0] });
    },
    (policy) => {
      policy.planned.push({ ...policy.planned[0] });
    },
    (policy) => {
      delete policy.planned[0].url;
    },
    (policy) => {
      policy.rights[0].publicDistribution = true;
    },
  ]) {
    const policy = structuredClone(original);
    mutate(policy);
    assert.throws(() => validateAgencySourcePolicy(policy), /Invalid|Duplicate/);
  }
});
