import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import polygonClipping from 'polygon-clipping';

export const dedupPolicy = {
  version: 2,
  pointDistanceMeters: 25,
  shapeDistanceMeters: 20,
  shapeMeasureRatio: 0.98,
  polygonIntersectionOverUnion: 0.9,
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nameKey = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const usefulName = (name) =>
  name.length >= 4 &&
  !/^(agency feature|unnamed|unknown|trail|road|campground|campsite|parking|restroom|toilet|water|other)(?: \d+)?$/.test(
    name,
  );
const urlKey = (url) =>
  String(url ?? '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
const dimension = (f) =>
  /Polygon$/.test(f.geometry?.type)
    ? 2
    : /LineString$/.test(f.geometry?.type)
      ? 1
      : f.geometry?.type === 'Point'
        ? 0
        : -1;
function category(f) {
  const canonical = nameKey(f.properties?.category);
  const key =
    canonical && canonical !== 'other'
      ? canonical
      : nameKey(f.properties?.sourceCategory || canonical);
  return (
    {
      'established campground': 'campground',
      'developed campground': 'campground',
      campgrounds: 'campground',
      'campgrounds and camping': 'campground',
      'wild camping': 'campsite',
      'informal campsite': 'campsite',
      'primitive campsite': 'campsite',
      restroom: 'toilet',
      restrooms: 'toilet',
      toilets: 'toilet',
      'potable water': 'drinking water',
    }[key] ?? key
  );
}
function compatible(a, b) {
  const ca = category(a),
    cb = category(b);
  return (
    ca === cb ||
    (a.properties?.sourceId !== 'private-ioverlander' &&
      (!ca || ca === 'other' || !cb || cb === 'other'))
  );
}
function parts(g) {
  if (g.type === 'Point') return [[g.coordinates]];
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString' || g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}
function bounds(f) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of parts(f.geometry))
    for (const c of p) {
      b[0] = Math.min(b[0], c[0]);
      b[1] = Math.min(b[1], c[1]);
      b[2] = Math.max(b[2], c[0]);
      b[3] = Math.max(b[3], c[1]);
    }
  return b;
}
function projection(a, b) {
  const lat = (a[1] + a[3] + b[1] + b[3]) / 4;
  const x = 111195 * Math.cos((lat * Math.PI) / 180),
    y = 111195;
  return (p) => [p[0] * x, p[1] * y];
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
  );
  return distance(p, [a[0] + dx * t, a[1] + dy * t]);
}
function directedClose(a, b, limit) {
  const segments = b.flatMap((r) => r.slice(1).map((p, i) => [r[i], p]));
  function covered(start, end, depth = 0) {
    // A segment inside one convex target-segment capsule is covered continuously.
    // Subdivide crossings between capsules; uncertainty retains the private feature.
    let startDistance = Infinity,
      endDistance = Infinity;
    for (const [q, r] of segments) {
      const ds = segmentDistance(start, q, r),
        de = segmentDistance(end, q, r);
      if (ds <= limit && de <= limit) return true;
      startDistance = Math.min(startDistance, ds);
      endDistance = Math.min(endDistance, de);
    }
    if (startDistance > limit || endDistance > limit || depth >= 20) return false;
    const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    return covered(start, mid, depth + 1) && covered(mid, end, depth + 1);
  }
  for (const part of a)
    for (let i = 1; i < part.length; i++) if (!covered(part[i - 1], part[i])) return false;
  return true;
}
export function polygonIntersectionOverUnion(a, b) {
  try {
    const intersection = polygonClipping.intersection(
      a.geometry.coordinates,
      b.geometry.coordinates,
    );
    const union = polygonClipping.union(a.geometry.coordinates, b.geometry.coordinates);
    const area = (coordinates) =>
      coordinates.reduce((n, poly) => n + measure({ type: 'Polygon' }, poly, 2), 0);
    const unionArea = area(union);
    return unionArea > 0 ? area(intersection) / unionArea : 0;
  } catch {
    return 0;
  }
}
function measure(g, p, dim) {
  if (dim === 1)
    return p.reduce((n, r) => n + r.slice(1).reduce((v, c, i) => v + distance(c, r[i]), 0), 0);
  const areas = p.map(
    (r) =>
      Math.abs(
        r.reduce((n, c, i) => {
          const q = r[(i + 1) % r.length];
          return n + c[0] * q[1] - q[0] * c[1];
        }, 0),
      ) / 2,
  );
  if (g.type === 'Polygon') return areas[0] - areas.slice(1).reduce((a, b) => a + b, 0);
  let offset = 0,
    total = 0;
  for (const poly of g.coordinates) {
    total +=
      areas[offset] - areas.slice(offset + 1, offset + poly.length).reduce((a, b) => a + b, 0);
    offset += poly.length;
  }
  return total;
}
export function sameShape(a, b, limit = dedupPolicy.shapeDistanceMeters) {
  const dim = dimension(a);
  if (dim < 0 || dim !== dimension(b)) return false;
  const ab = bounds(a),
    bb = bounds(b),
    project = projection(ab, bb);
  if (dim === 0)
    return (
      distance(project(a.geometry.coordinates), project(b.geometry.coordinates)) <=
      dedupPolicy.pointDistanceMeters
    );
  if (
    distance(project(ab.slice(0, 2)), project(bb.slice(0, 2))) > limit ||
    distance(project(ab.slice(2)), project(bb.slice(2))) > limit
  )
    return false;
  const ap = parts(a.geometry).map((r) => r.map(project)),
    bp = parts(b.geometry).map((r) => r.map(project));
  const am = measure(a.geometry, ap, dim),
    bm = measure(b.geometry, bp, dim);
  if (!(am > 0 && bm > 0) || Math.min(am, bm) / Math.max(am, bm) < dedupPolicy.shapeMeasureRatio)
    return false;
  if (dim === 2 && polygonIntersectionOverUnion(a, b) < dedupPolicy.polygonIntersectionOverUnion)
    return false;
  return directedClose(ap, bp, limit) && directedClose(bp, ap, limit);
}
export function deduplicatePrivateFeatures(privateFeatures, publicFeatures) {
  const names = new Map(),
    identities = new Map();
  for (const f of publicFeatures) {
    const n = nameKey(f.properties?.name),
      d = dimension(f);
    if (usefulName(n)) {
      const k = `${d}:${n}`;
      if (!names.has(k)) names.set(k, []);
      names.get(k).push(f);
    }
    const url = urlKey(f.properties?.sourceUrl);
    if (url) {
      const k = `${url}:${String(f.id).split(':').at(-1)}`;
      if (!identities.has(k)) identities.set(k, []);
      identities.get(k).push(f);
    }
  }
  const features = [],
    matches = [];
  for (const f of privateFeatures) {
    const url = urlKey(f.properties?.sourceUrl),
      n = nameKey(f.properties?.name);
    const identity = url ? (identities.get(`${url}:${String(f.id).split(':').at(-1)}`) ?? []) : [];
    let method = 'source-record';
    let candidates = identity.filter((p) => dimension(f) >= 0 && dimension(f) === dimension(p));
    if (!candidates.length) {
      method = 'name-category-and-shape';
      candidates = (names.get(`${dimension(f)}:${n}`) ?? []).filter(
        (p) => compatible(f, p) && sameShape(f, p),
      );
    }
    if (!candidates.length) {
      features.push(f);
      continue;
    }
    candidates.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    matches.push({
      privateId: f.id,
      privateSourceId: f.properties?.sourceId,
      publicId: candidates[0].id,
      publicSourceId: candidates[0].properties?.sourceId,
      method,
      feature: f,
    });
  }
  return { features, matches };
}
export async function readPublicStatePackage(repository, code) {
  const dir = join(repository, 'packages/map/src/assets/state-packages/US', code);
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const descriptor = manifest.artifacts.geojson;
  const bytes = await readFile(join(dir, descriptor.file));
  if (
    manifest.state.code !== code ||
    manifest.classification !== 'SOURCE_REDISTRIBUTABLE' ||
    manifest.publicDistribution !== true ||
    descriptor.sha256 !== hash(bytes) ||
    descriptor.bytes !== bytes.length
  )
    throw new Error(`${code}: public package provenance mismatch`);
  const collection = JSON.parse(bytes);
  if (
    collection.type !== 'FeatureCollection' ||
    collection.features.length !== descriptor.featureCount
  )
    throw new Error(`${code}: public package count mismatch`);
  return { features: collection.features, sha256: hash(bytes) };
}
