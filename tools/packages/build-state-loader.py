"""Build pinned public SQLite catalogs containing local PMTiles; never read private inputs."""
import argparse
import gzip
import hashlib
import json
import math
import os
import pathlib
import sqlite3
import sys
import tempfile
import traceback
import shutil
from concurrent.futures import ProcessPoolExecutor, as_completed
from contextlib import closing

ROOT = pathlib.Path(__file__).resolve().parents[2]

def scratch_root():
    path = ROOT / '.scratch' / 'state-loader'
    path.mkdir(parents=True, exist_ok=True)
    return path

import mapbox_vector_tile
from pmtiles.writer import Writer
from pmtiles.reader import Reader
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pyproj import Transformer
from shapely import make_valid
from shapely.affinity import translate
from shapely.geometry import box, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

_compress = gzip.compress
gzip.compress = lambda data, compresslevel=9, *, mtime=0: _compress(data, compresslevel=compresslevel, mtime=0)

MAX_ZOOM = 10
WORLD = 20037508.342789244
PROJECT = Transformer.from_crs(4326, 3857, always_xy=True).transform


def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def visitor_summary(summary):
    properties = dict(summary['properties'])
    for key in ('name', 'unit'):
        value = properties.get(key)
        if not isinstance(value, str):
            properties['source' + key.title()] = value
            properties[key] = '' if value is None else str(value)
    properties['origin'] = 'public-catalog'
    return {**summary, 'properties': properties}


def unwrap(value):
    if not value or isinstance(value[0], (int, float)):
        return value[:2]
    if isinstance(value[0][0], (int, float)):
        result = []
        previous = value[0][0]
        for point in value:
            x = point[0]
            x += 360 * round((previous - x) / 360)
            result.append([x, point[1]])
            previous = x
        return result
    return [unwrap(child) for child in value]


def display_geometry(geometry):
    # Resolve antimeridian seams for display; authoritative geometry stays verbatim in SQLite.
    source = shape({**geometry, 'coordinates': unwrap(geometry['coordinates'])})
    dimension = 2 if 'Polygon' in geometry['type'] else 1 if 'LineString' in geometry['type'] else 0
    if source.is_valid:
        g = source
    else:
        components = list(source.geoms) if hasattr(source, 'geoms') else [source]
        repaired = [part for component in components for part in dimension_parts(make_valid(component), dimension)]
        g = unary_union(repaired)
    domain = box(-180, -85.05112878, 180, 85.05112878)
    if g.is_empty:
        return g
    w, s, e, n = g.bounds
    if w >= -180 and e <= 180 and s >= -85.05112878 and n <= 85.05112878:
        clipped = g
    else:
        pieces = [part for offset in (-360, 0, 360)
                  for part in dimension_parts(translate(g, xoff=offset).intersection(domain), dimension)]
        clipped = unary_union(pieces)
    projected = transform(PROJECT, clipped)
    return projected if projected.is_valid else unary_union(dimension_parts(make_valid(projected), dimension))


def dimension_parts(g, dimension):
    if g.is_empty:
        return []
    if g.geom_type == 'GeometryCollection':
        return [p for child in g.geoms for p in dimension_parts(child, dimension)]
    if ('Polygon' in g.geom_type and dimension == 2 or
            'LineString' in g.geom_type and dimension == 1 or
            'Point' in g.geom_type and dimension == 0):
        return [g]
    return []


def build_tiles(features, target, max_zoom=MAX_ZOOM):
    geometries = []
    for ordinal, feature in enumerate(features, 1):
        geometries.append(display_geometry(feature['geometry']))
        if ordinal % 5000 == 0:
            print(f'  prepared {ordinal}/{len(features)} geometries', flush=True)
    count = 0
    with open(target, 'wb') as stream:
        writer = Writer(stream)
        for z in range(5, max_zoom + 1):
            width = 2 * WORLD / (1 << z)
            ordinals = [i for i, f in enumerate(features) if z >= 8 or
                        f['properties']['kind'] in ('poi', 'land', 'boundary')]
            simplified = [make_valid(geometries[i].simplify(width / 4096, preserve_topology=True)) for i in ordinals]
            tree = STRtree(simplified)
            cells = set()
            components = [part for g in simplified for part in
                          (list(g.geoms) if hasattr(g, 'geoms') else [g])]
            for g in components:
                if g.is_empty:
                    continue
                w, s, e, n = g.bounds
                x0 = min((1 << z) - 1, max(0, int((w + WORLD) / width)))
                x1 = min((1 << z) - 1, int((e + WORLD) / width))
                y0 = min((1 << z) - 1, max(0, int((WORLD - n) / width)))
                y1 = min((1 << z) - 1, int((WORLD - s) / width))
                cells.update((x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1))
            for x, y in sorted(cells, key=lambda xy: zxy_to_tileid(z, *xy)):
                w, n = -WORLD + x * width, WORLD - y * width
                bounds = (w, n - width, w + width, n)
                clip = box(w - width / 512, n - width - width / 512,
                           w + width + width / 512, n + width / 512)
                encoded = []
                for ordinal in tree.query(clip, predicate='intersects'):
                    f, g = features[ordinals[ordinal]], simplified[ordinal]
                    source_type = f['geometry']['type']
                    dimension = 2 if 'Polygon' in source_type else 1 if 'LineString' in source_type else 0
                    clipped = g.intersection(clip)
                    for piece in dimension_parts(clipped, dimension):
                        p = f['properties']
                        encoded.append({'geometry': piece, 'properties': {
                            'id': f['id'], 'kind': p['kind'],
                            'name': str(p.get('name', ''))[:200], 'category': p.get('category', 'other')}})
                if encoded:
                    tile = mapbox_vector_tile.encode({'name': 'outdoors', 'features': encoded},
                        default_options={'quantize_bounds': bounds, 'extents': 4096})
                    if len(tile) > 8 * 1024 * 1024:
                        raise ValueError('Vector tile exceeds bounded 8 MiB decode budget')
                    writer.write_tile(zxy_to_tileid(z, x, y), gzip.compress(tile, mtime=0))
                    count += 1
            print(f'  zoom {z}: {len(cells)} candidate tiles', flush=True)
        writer.finalize({'tile_compression': Compression.GZIP, 'tile_type': TileType.MVT,
            'min_lon_e7': -1800000000, 'min_lat_e7': -850511287,
            'max_lon_e7': 1800000000, 'max_lat_e7': 850511287,
            'center_zoom': 5, 'center_lon_e7': 0, 'center_lat_e7': 0},
            {'name': 'Public outdoor reference', 'vector_layers': [{'id': 'outdoors',
              'fields': {'id': 'String', 'kind': 'String', 'name': 'String', 'category': 'String'}}]})
    return count


def build_state(state, base, max_zoom=MAX_ZOOM):
    source = base / 'outdoors.geojson'
    manifest = json.loads((base / 'manifest.json').read_text(encoding='utf-8'))
    if manifest['classification'] != 'SOURCE_REDISTRIBUTABLE' or manifest['distribution'] != 'public':
        raise ValueError('Only explicitly redistributable public inputs are supported')
    if digest(source) != manifest['artifacts']['geojson']['sha256']:
        raise ValueError('Source checksum mismatch')
    features = json.loads(source.read_text(encoding='utf-8'))['features']
    index = json.loads((base / 'index.json').read_text(encoding='utf-8'))
    if digest(base / 'index.json') != manifest['artifacts']['index']['sha256']:
        raise ValueError('Index checksum mismatch')
    indexed = {f['id']: f for f in index['features']}
    for f in features:
        p = f['properties']
        if (p.get('origin') == 'private-catalog' or 'private' in p.get('sourceId', '').lower()
                or any(p.get(k) for k in ('communityDescription', 'communityCheckIns', 'contributor'))):
            raise ValueError('Private record rejected')
        if f['id'] not in indexed:
            raise ValueError('Missing source index record')
    with tempfile.TemporaryDirectory(prefix='state-', dir=scratch_root()) as workspace:
        tile_file = pathlib.Path(workspace) / 'map.pmtiles'
        print(f'Building {state["state"]}: {len(features)} catalog records', flush=True)
        tile_count = build_tiles(features, tile_file, max_zoom)
        target = base / 'state.sqlite'
        temporary = pathlib.Path(workspace) / 'state.sqlite'
        db = sqlite3.connect(temporary)
        db.executescript('''PRAGMA application_id=1330590548; PRAGMA user_version=1;
          CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
          CREATE TABLE features(ordinal INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,
            summary TEXT NOT NULL,geometry TEXT NOT NULL);
          CREATE VIRTUAL TABLE spatial USING rtree(ordinal,west,east,south,north);
          CREATE VIRTUAL TABLE search USING fts5(name,unit,category,content='',tokenize='unicode61');
          CREATE TABLE assets(id INTEGER PRIMARY KEY,data BLOB NOT NULL);''')
        bounds = [180, 90, -180, -90]
        for ordinal, feature in enumerate(features, 1):
            summary = visitor_summary(indexed[feature['id']])
            # Preserve existing source IDs so cross-state records and place journals keep identity.
            b, p = summary['bounds'], summary['properties']
            db.execute('INSERT INTO features VALUES(?,?,?,?)',
                (ordinal, feature['id'], compact(summary), compact(feature['geometry'])))
            db.execute('INSERT INTO spatial VALUES(?,?,?,?,?)', (ordinal, b[0], b[2], b[1], b[3]))
            db.execute('INSERT INTO search(rowid,name,unit,category) VALUES(?,?,?,?)',
                (ordinal, p.get('name', ''), p.get('unit', ''), p.get('category', 'other')))
            bounds = [min(bounds[0], b[0]), min(bounds[1], b[1]),
                      max(bounds[2], b[2]), max(bounds[3], b[3])]
        tile_bytes = tile_file.stat().st_size
        info = {'schemaVersion': 1, 'channel': 'public', 'classification': 'SOURCE_REDISTRIBUTABLE',
            'state': state['state'], 'name': state['name'], 'featureCount': len(features),
            'sourceSha256': digest(source), 'generatedAt': manifest['generatedAt'],
            'sourceIndexSha256': digest(base / 'index.json'),
            'tilesSha256': digest(tile_file), 'tilesBytes': tile_bytes,
            'maximumZoom': max_zoom, 'tileCount': tile_count, 'bounds': bounds,
            'attribution': '; '.join(manifest['rights']['attribution']),
            'notices': (base / 'DATA_NOTICES.md').read_text(encoding='utf-8')}
        db.execute('INSERT INTO metadata VALUES(?,?)', ('manifest', compact(info)))
        db.execute('INSERT INTO assets VALUES(1,zeroblob(?))', (tile_bytes,))
        with db.blobopen('assets', 'data', 1) as blob, tile_file.open('rb') as tiles:
            while chunk := tiles.read(1024 * 1024):
                blob.write(chunk)
        db.commit()
        assert db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
        db.close()
        os.replace(temporary, target)
    info.pop('notices')
    return {**info, 'file': f'{state["state"]}/state.sqlite', 'sha256': digest(target),
            'bytes': target.stat().st_size, 'installedBytes': target.stat().st_size + tile_bytes}


def worker(state, base, resume):
    try:
        target = base / 'state.sqlite'
        if resume and target.exists():
            with closing(sqlite3.connect(target)) as db:
                info = json.loads(db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0])
                with db.blobopen('assets', 'data', 1, readonly=True) as blob:
                    header = Reader(lambda offset, length: (blob.seek(offset), blob.read(length))[1]).header()
                if (info['maximumZoom'] == MAX_ZOOM and info['sourceSha256'] == digest(base / 'outdoors.geojson')
                        and header['min_zoom'] == 5
                        and info.get('sourceIndexSha256') == digest(base / 'index.json')
                        and db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'):
                    info.pop('notices')
                    return {**info, 'file': f'{state["state"]}/state.sqlite', 'sha256': digest(target),
                            'bytes': target.stat().st_size, 'installedBytes': target.stat().st_size + info['tilesBytes']}
        return build_state(state, base)
    except Exception:
        print(f'Failed state {state["state"]}', flush=True)
        traceback.print_exc()
        raise


def normalize_completed_catalogs():
    """Upgrade cached visitor text without recompiling unchanged map tiles or source geometry."""
    base = ROOT / 'packages/map/src/assets/state-packages/US'
    states = json.loads((base / 'inventory.json').read_text(encoding='utf-8'))['states']
    entries = []
    for state in states:
        target = base / state['state'] / 'state.sqlite'
        if not target.exists():
            raise ValueError(f'Missing complete state catalog: {state["state"]}')
        with tempfile.TemporaryDirectory(prefix='normalize-', dir=scratch_root()) as directory:
            temporary = pathlib.Path(directory) / 'state.sqlite'
            shutil.copyfile(target, temporary)
            with closing(sqlite3.connect(temporary)) as db:
                info = json.loads(db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0])
                if info['channel'] != 'public' or info['sourceSha256'] != digest(target.parent / 'outdoors.geojson'):
                    raise ValueError('Cached public source binding failed')
                changed = False
                for ordinal, value in db.execute('SELECT ordinal,summary FROM features'):
                    before = json.loads(value)
                    after = visitor_summary(before)
                    if before != after:
                        changed = True
                        db.execute('UPDATE features SET summary=? WHERE ordinal=?', (compact(after), ordinal))
                if changed:
                    db.execute("INSERT INTO search(search) VALUES('delete-all')")
                    for ordinal, value in db.execute('SELECT ordinal,summary FROM features'):
                        p = json.loads(value)['properties']
                        db.execute('INSERT INTO search(rowid,name,unit,category) VALUES(?,?,?,?)',
                            (ordinal, p['name'], p['unit'], p.get('category', 'other')))
                info['sourceIndexSha256'] = digest(target.parent / 'index.json')
                db.execute("UPDATE metadata SET value=? WHERE key='manifest'", (compact(info),))
                db.commit()
                if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise ValueError('Catalog integrity failed')
            os.replace(temporary, target)
        info.pop('notices')
        entries.append({**info, 'file': f'{state["state"]}/state.sqlite', 'sha256': digest(target),
            'bytes': target.stat().st_size, 'installedBytes': target.stat().st_size + info['tilesBytes']})
    registry = base / 'loader-inventory.json'
    temporary = registry.with_suffix('.tmp')
    temporary.write_text(json.dumps({'schemaVersion': 1, 'states': sorted(entries,
        key=lambda s: s['name'])}, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, registry)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--states', nargs='*')
    parser.add_argument('--workers', type=int, default=2)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--normalize-completed', action='store_true')
    args = parser.parse_args()
    if args.normalize_completed:
        normalize_completed_catalogs()
        return
    base = ROOT / 'packages/map/src/assets/state-packages/US'
    states = json.loads((base / 'inventory.json').read_text(encoding='utf-8'))['states']
    registry_path = base / 'loader-inventory.json'
    previous = json.loads(registry_path.read_text(encoding='utf-8'))['states'] if registry_path.exists() else []
    entries = {s['state']: s for s in previous}
    failures = []
    selected = [s for s in states if not args.states or s['state'] in args.states]
    with ProcessPoolExecutor(max_workers=max(1, min(4, args.workers))) as executor:
        pending = [executor.submit(worker, state, base / state['state'], args.resume) for state in selected]
        for result in as_completed(pending):
            try:
                info = result.result()
            except Exception as error:
                print(f'STATE BUILD FAILED: {error}', flush=True)
                failures.append(str(error))
                continue
            entries[info['state']] = info
            temp = registry_path.with_suffix('.tmp')
            temp.write_text(json.dumps({'schemaVersion': 1, 'states': sorted(entries.values(),
                key=lambda s: s['name'])}, indent=2) + '\n', encoding='utf-8')
            os.replace(temp, registry_path)
    print(f'Built {len(entries)} installable state catalogs', flush=True)
    if failures:
        raise RuntimeError(f'{len(failures)} state catalogs failed; fix and rerun with --resume: {failures}')


if __name__ == '__main__':
    main()
