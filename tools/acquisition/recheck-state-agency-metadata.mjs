import { loadAgencySourcePolicy } from './agency-source-policy.mjs';

const policy = await loadAgencySourcePolicy();
const records = policy.rights.filter((record) => record.status === 'Unconfirmed');
if (records.length === 0) throw new Error('No unconfirmed source roles found');

const roots = new Map();
for (const record of records) {
  const match = record.url.match(/^(https?:\/\/.*?\/(?:FeatureServer|MapServer))(?:\/\d+)?$/i);
  if (!match) continue;
  const group = roots.get(match[1]) ?? [];
  group.push(record);
  roots.set(match[1], group);
}
const queue = [...roots];
const results = [];
async function worker() {
  while (queue.length) {
    const [url, roles] = queue.shift();
    try {
      const response = await fetch(`${url}/info/iteminfo?f=pjson`, {
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json();
      results.push({
        state: roles[0].state,
        roles: roles.map((role) => role.role),
        url,
        httpStatus: response.status,
        title: body.title ?? null,
        licenseInfo: body.licenseInfo ?? null,
        error: body.error ?? null,
      });
    } catch (error) {
      results.push({
        state: roles[0].state,
        roles: roles.map((role) => role.role),
        url,
        error: error.message,
      });
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
results.sort((a, b) => a.state.localeCompare(b.state) || a.url.localeCompare(b.url));
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      unconfirmedRoles: records.length,
      uniqueArcgisServices: roots.size,
      results,
    },
    null,
    2,
  ),
);
