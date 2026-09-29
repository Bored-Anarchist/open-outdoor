import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { sha256 } from './build-public-state-packages.mjs';

const root = resolve(import.meta.dirname, '..');
const base = join(root, 'packages/map/src/assets/state-packages/US');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const inventory = await read(join(base, 'inventory.json'));
const manifests = [];
for (const state of inventory.states) {
  const directory = join(base, state.state);
  const manifest = await read(join(directory, 'manifest.json'));
  if (manifest.rights.sourceTerms)
    manifest.rights.sourceTerms = [
      ...new Map(
        manifest.rights.sourceTerms.map((item) => [`${item.id}|${item.url}`, item]),
      ).values(),
    ];
  manifests.push(manifest);
  const agency = manifest.sources.filter(
    (s) => s.rightsStatus === 'Supported' && s.publicDistribution === true,
  );
  const text = Buffer.from(
    `# ${state.name} public data notices\n\n${agency.map((s) => `## ${s.name}\n\nCredit: ${s.attribution}\n\nLicense: ${s.license}${s.licenseUrl ? ` (${s.licenseUrl})` : ''}\n\nSource: ${s.url}\n\nTerms: ${s.termsUrl ?? s.url}\n\nModifications: ${s.modifications}\n\n${s.distributionConditions ? `Conditions: ${s.distributionConditions}\n\n` : ''}${s.disclaimer ?? s.licenseText ?? ''}\n`).join('\n')}\nNational and other public source credits: ${(manifest.rights.attribution ?? []).join('; ')}. Their terms are recorded in manifest.json. Snapshot geometry is informational; current access and camping permission must be verified with the manager.\n`,
  );
  await writeFile(join(directory, 'DATA_NOTICES.md'), text);
  manifest.artifacts.notices = {
    file: 'DATA_NOTICES.md',
    bytes: text.length,
    sha256: sha256(text),
  };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
const docs = join(root, 'docs');
const totals = inventory.totals;
const agencyStates = inventory.states.filter((s) => s.agencySources > 0).map((s) => s.state);
const agencyStateCount = agencyStates.length;
const publicStatus = `**Public packaging update (2026-09-28):** All **50 states**, including New York, now use the private system's GeoJSON/checksum-manifest structure with public search indexes and **${totals.parts} app-parser-validated import parts**. The packages contain **${totals.features.toLocaleString('en-US')} features**, **${totals.poi.toLocaleString('en-US')} POIs**, and **${totals.agency.toLocaleString('en-US')} eligible direct agency features** in ${agencyStateCount} states. See the [current inventory](PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md) and [format/rebuild guide](PUBLIC_STATE_PACKAGE_FORMAT.md). The older acquisition-stage notes below are superseded where they say no agency data are public, categories are unmapped, or parts have not been validated. Permission-held data stay private; dated references do not establish current access.\n\n`;
for (const name of [
  'STATE_DATA_PACKAGE_TRACKER.md',
  'ALL_DATASETS_TRACKER.md',
  'STATE_AGENCY_FEED_CONNECTORS.md',
  'NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md',
  'BUNDLED_NATIVE_MAP.md',
  'STATE_AGENCY_REDISTRIBUTION_RIGHTS_2026-09-26.md',
]) {
  let text = (await readFile(join(docs, name), 'utf8')).replace(/\r\n/g, '\n');
  text = text.replace(/\*\*Public packaging update \(2026-09-(?:27|28)\):\*\*[^\n]*\n\n/g, '');
  const end = text.indexOf('\n');
  text = text.slice(0, end + 1) + '\n' + publicStatus + text.slice(end + 1).trimStart();
  if (name === 'ALL_DATASETS_TRACKER.md') {
    text = text.replace(
      '**Inventory counts:** 49 state packages;',
      '**Inventory counts:** 50 state packages;',
    );
    const start = text.indexOf('## POI-system gate');
    const finish = text.indexOf('## Shipped national source families', start);
    const rows = inventory.states
      .map(
        (s) =>
          `| ${s.state} | ${s.poi.toLocaleString('en-US')} | ${s.other.toLocaleString('en-US')} | ${s.agency.toLocaleString('en-US')} | ${s.parts} validated parts |`,
      )
      .join('\n');
    text =
      text.slice(0, start) +
      `## POI-system gate\n\nThe 50 public packages contain **${totals.poi.toLocaleString('en-US')} POI entries**. **${totals.other.toLocaleString('en-US')} (${((100 * totals.other) / totals.poi).toFixed(1)}%)** retain Other because their source type is unknown, infrastructure, or an amenity without an iOverlander legend category. Raw source categories and bounded visitor amenities remain available. Camping types, parking, drinking water, dump stations, lodging and visitor attractions are normalized to the app taxonomy. These are package entries, not deduplicated national entities.\n\n**Import status:** every one of the **${totals.parts} parts** passed the actual app parser's byte, feature, coordinate, geometry and normalized-size checks. Full package files can exceed import limits. The app's five-dataset/50 MiB combined-store limits still apply; select parts within those limits. Complete states use the separate SQLite loader; native phone acceptance remains pending.\n\n### State package POI and import status\n\n| State | POI entries | Other | Direct agency features | App import parts |\n| --- | ---: | ---: | ---: | --- |\n${rows}\n\n` +
      text.slice(finish);
    const sourceConfig = await read(join(root, 'config/public-state-agency-sources.json'));
    text = text
      .split('\n')
      .map((line) =>
        sourceConfig.sources.some((s) => line.includes(`](${s.basisUrl})`)) &&
        line.includes('no public agency import')
          ? line.replace(
              /Primary candidate; no public agency import; private staging tracked separately|Supplement candidate; no public agency import; private staging tracked separately/g,
              'Public dated derivative included; exact source receipt and selection in state manifest',
            )
          : line,
      )
      .join('\n');
  }
  if (name === 'STATE_DATA_PACKAGE_TRACKER.md') {
    text = text.replace(
      /\*\*Complete source index and POI readiness:\*\*[^\n]*/,
      `**Complete source index and POI readiness:** The [all-datasets tracker](ALL_DATASETS_TRACKER.md) lists nine national source families, nine New York sources, 212 registry roles, 19 selected AR/ID/SD rows and eight OPRHP candidates. The current public inventory has 50 packages and ${totals.parts} validated import parts. ${totals.other.toLocaleString('en-US')} of ${totals.poi.toLocaleString('en-US')} POIs retain Other with raw type/amenity details.`,
    );
    text = text.replace(
      /\*\*Agency feed code:\*\*[^\n]*/,
      `**Agency feed code:** The [private connector plan](STATE_AGENCY_FEED_CONNECTORS.md) retains all 231 registry/selected-plan roles. The separate [public pipeline](PUBLIC_STATE_PACKAGE_FORMAT.md) includes ${totals.agencySources} exact eligible acquisitions across ${agencyStateCount} states. Permission-held data remain private: 107 Unconfirmed roles, five Permission required roles, one Restricted role and six lead-only roles keep their source gates. Minnesota visitor derivatives and Virginia DCR data are included under their source-specific conditions for this noncommercial application. Arkansas facilities are public historical references with current operating status unverified.`,
    );
    text = text.replace(
      /- A state package is a separate GeoJSON overlay[^\n]*/,
      `- Each full package is a separate reference overlay; validated files in its parts directory are available through user import. The app's five-dataset/50 MiB combined-store limits apply.`,
    );
    text = text.replace('all 13 New York package sources', 'all nine New York package sources');
    text = text.replace(
      'None of the newly identified agency layers has been added to the public package; Arkansas facilities have a positive rights finding but failed the current facility verification gate, and the other agency sources retain rights gates. Existing federal/PAD-US package counts are unchanged.',
      'Arkansas ASP/AFC facilities are now included only as historical references with current existence/access unknown. Other selected agency layers retain their stated gates. Federal/PAD-US baseline counts are preserved.',
    );
    text = text.replace(
      'Hold public import until current point locations/status and duplicates are reconciled with Parks.',
      'Historical subset packaged; current point locations/status and duplicate reconciliation remain unverified.',
    );
    text = text.replace(
      'Hold public import until sites, permits, and forest coverage are confirmed.',
      'Historical subset packaged; sites, permits and forest coverage remain unverified.',
    );
    text = text.replace(
      '**Scope:** the 49 states other than New York. Each state is produced as its own GeoJSON, search index, and source manifest package.',
      '**Scope:** all 50 public state packages. New York retains its audited civil-boundary/federal baseline, with DEC/OPRHP records excluded. Each state has GeoJSON, search index, source manifest and validated import parts.',
    );
    const start = text.indexOf('## State-by-state progress');
    const finish = text.indexOf('\n## ', start + 5);
    if (start < 0 || finish < 0) throw new Error('State tracker section not found');
    const rows = inventory.states
      .map(
        (s) =>
          `| ${s.state} | ${s.name} | ${s.features.toLocaleString('en-US')} | ${s.poi.toLocaleString('en-US')} | ${s.agency.toLocaleString('en-US')} | ${s.parts} | [Manifest](../packages/map/src/assets/state-packages/US/${s.state}/manifest.json) |`,
      )
      .join('\n');
    text =
      text.slice(0, start) +
      `## State-by-state progress\n\n| State | Name | Features | POIs | Direct agency features | Validated parts | Package |\n| --- | --- | ---: | ---: | ---: | ---: | --- |\n${rows}\n` +
      text.slice(finish);
    text = text.replace(
      'No row below is in the shipped state packages.',
      'The Arkansas ASP/AFC facility subset is now included as a historical reference only; its current operating-status gate remains open. Other selected rows remain candidates unless listed in the current inventory.',
    );
  }
  if (name === 'STATE_AGENCY_FEED_CONNECTORS.md')
    text = text.replace(
      /\*\*Status:\*\*[^\n]*/,
      `**Status:** The private connector and agency+iOverlander overlays remain under ignored PrivateData. The separate public acquisition/packaging pipeline contributes ${totals.agency.toLocaleString('en-US')} eligible agency records from ${totals.agencySources} exact acquisitions in ${agencyStateCount} states; see the public format guide. Private permission gates and public derivative receipts remain separate.`,
    );
  await writeFile(join(docs, name), text);
}
const readiness = `# State dataset release readiness — 2026-09-28\n\nThe current [inventory](PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md) and [format/rebuild guide](PUBLIC_STATE_PACKAGE_FORMAT.md) replace the earlier category/import gate decision. Existing source rights classifications remain unchanged. Minnesota and Virginia conditional derivatives are cleared for this scoped noncommercial distribution; see the [condition review](CONDITIONAL_PUBLIC_DATA_2026-09-28.md).\n\n**State loader update:** The dedicated [offline state loader](STATE_PACKAGE_LOADER.md) installs complete catalogs with local tiles, search, checksum verification and rollback. The previous unsigned iOS build passed for code commit \`dbd9bcd8aae2ac2aa4dafaa40bd05494ae420b7e\`; the refreshed packages and source-condition UI require a new build. Physical phone acceptance and production catalog trust integration remain pending.\n\n| Data | Current decision | Remaining limits |\n| --- | --- | --- |\n| All 50 public state packages | Packaged with GeoJSON, index, checksum manifest and ${totals.parts} parser-validated import parts | Dedicated state SQLite loader supports complete states; manual imports retain five files and 50 MiB combined storage. Physical phone acceptance remains pending. |\n| POI taxonomy | ${totals.poi.toLocaleString('en-US')} points mapped from source categories; ${totals.other.toLocaleString('en-US')} remain Other | Unknown/infrastructure/toilet types retain source types and amenities. No invented traveler services or access claims. |\n| Eligible state agency inputs | ${totals.agency.toLocaleString('en-US')} features from ${totals.agencySources} exact acquisitions in ${agencyStates.join(', ')} | Repeated role URLs ingest once; separate points/lines keep independent receipts. Malformed/empty geometry is rejected and counted. |\n| Historical agency inputs | Arkansas facilities, CAL FIRE 2024 boundaries and Massachusetts 2015 trails included as clearly dated informational references | Current facility existence, access, closure and completeness are not asserted. Arkansas operating-status verification and CAL FIRE's conflicting 14/15-forest counts remain unresolved. |\n| Minnesota DNR | Filtered hiking and campground visitor derivatives included | 7,818 of 26,963 trail/road records and 54 of 61 facilities, with selected visitor fields and modified geometry. Credit MNDNR; reference only, no navigation/legal-access use. Entire raw datasets and non-visitor forest stand inventory excluded. |\n| Virginia DCR | 631 trails and 44 boundaries included for the noncommercial application | Redistribution for profit prohibited; DCR credit and separate source terms retained in notices/manifests and visitor records. These data are outside the project code license. |\n| Unconfirmed, restricted and permission-required agency sources | Excluded from public packages; private system retains eligible private validation data | No rights reclassification is implied by packaging public inputs. |\n| New York | Same public state format; default app map/index synchronized; public hike document empty and bound to corrected checksum | 326 public features: civil boundary plus federal records. DEC's 14,454 records and 5,289 profiles remain private; OPRHP is excluded. Historical Git copies still exist. |\n\nConnecticut's three distinct CC0 feeds are now packaged: properties, trails and access locations. Acquisition receipts record object-ID inventories, pages, edit dates, terms checksums, attribution and modifications. Their geometries are distinct feature types; a property or access point is not a legal permission or current closure record.\n\nAll 50 private packages remain intact. Restage the private New York mobile overlay after a public asset update to rebind the combined map/profile checksum. The public packaging tool never reads private source files.\n\nSix forestry source roles remain leads: Arizona, Mississippi, Nevada, New Mexico and two South Dakota roles. Kansas and South Carolina partial agency layers remain permission-held. OSM extracts remain candidates requiring their separate source/ODbL integration path. No iOverlander source records are in the public packages.\n`;
await writeFile(join(docs, 'STATE_DATA_RELEASE_READINESS_2026-09-27.md'), readiness);
const indexPath = join(docs, 'README.md');
let index = await readFile(indexPath, 'utf8');
if (!index.includes('[Public state package format]'))
  index = index.replace(
    '| [Project scope]',
    '| [Public state package format](PUBLIC_STATE_PACKAGE_FORMAT.md) | Public/private-compatible format, POI taxonomy, rights boundary and rebuild commands | Data lead |\n| [Public state package inventory](PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md) | All 50 package counts and validated import parts | Data lead |\n| [Project scope]',
  );
await writeFile(indexPath, index);
console.log(
  `Updated public notices and documentation for ${inventory.states.length} state packages.`,
);
