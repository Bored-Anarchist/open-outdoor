"""Independently verify every distributable state catalog against its source and tile archive."""
import hashlib
import json
import pathlib
import sqlite3
import sys
from contextlib import closing

ROOT = pathlib.Path(__file__).resolve().parents[2]
from pmtiles.reader import Reader, all_tiles
from pmtiles.tile import TileType
import mapbox_vector_tile
import gzip


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify():
    base = ROOT / 'packages/map/src/assets/state-packages/US'
    registry = json.loads((base / 'loader-inventory.json').read_text(encoding='utf-8'))
    expected = {s['state'] for s in json.loads((base / 'inventory.json').read_text(encoding='utf-8'))['states']}
    assert len(registry['states']) == 50 and {s['state'] for s in registry['states']} == expected
    total = installed = count = 0
    for pin in registry['states']:
        catalog = base / pin['file']
        source = base / pin['state'] / 'outdoors.geojson'
        assert catalog.stat().st_size == pin['bytes'] and digest(catalog) == pin['sha256']
        assert digest(source) == pin['sourceSha256']
        assert digest(source.parent / 'index.json') == pin['sourceIndexSha256']
        features = {f['id']: f for f in json.loads(source.read_text(encoding='utf-8'))['features']}
        index = {f['id']: f for f in json.loads((source.parent / 'index.json').read_text(encoding='utf-8'))['features']}
        with closing(sqlite3.connect(f'{catalog.resolve().as_uri()}?mode=ro', uri=True)) as db:
            assert db.execute('PRAGMA application_id').fetchone()[0] == 1330590548
            assert db.execute('PRAGMA user_version').fetchone()[0] == 1
            assert db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
            assert db.execute('SELECT count(*) FROM features').fetchone()[0] == len(features) == pin['featureCount']
            assert db.execute('SELECT count(*) FROM spatial').fetchone()[0] == len(features)
            assert db.execute('SELECT count(*) FROM search').fetchone()[0] == len(features)
            metadata = json.loads(db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0])
            assert metadata['classification'] == 'SOURCE_REDISTRIBUTABLE' and metadata['channel'] == 'public'
            assert metadata['state'] == pin['state'] and metadata['tilesSha256'] == pin['tilesSha256']
            assert metadata['sourceIndexSha256'] == pin['sourceIndexSha256']
            assert metadata['notices'] == (source.parent / 'DATA_NOTICES.md').read_text(encoding='utf-8')
            for identity, summary, geometry in db.execute('SELECT id,summary,geometry FROM features'):
                assert json.loads(geometry) == features[identity]['geometry']
                p = json.loads(summary)['properties']
                original = index[identity]
                for key in ('name', 'unit'):
                    value = original['properties'].get(key)
                    if not isinstance(value, str):
                        original['properties']['source' + key.title()] = value
                        original['properties'][key] = '' if value is None else str(value)
                original['properties']['origin'] = 'public-catalog'
                assert json.loads(summary) == original
                assert p['origin'] == 'public-catalog' and 'private' not in p['sourceId'].lower()
                assert not p.get('communityDescription') and not p.get('communityCheckIns')
            with db.blobopen('assets', 'data', 1, readonly=True) as blob:
                tile_hash = hashlib.sha256()
                assert len(blob) == pin['tilesBytes']
                while chunk := blob.read(1024 * 1024):
                    tile_hash.update(chunk)
                assert tile_hash.hexdigest() == pin['tilesSha256']
                # Read the PMTiles header/directory using random access to the SQLite blob.
                read_bytes = lambda offset, length: (blob.seek(offset), blob.read(length))[1]
                reader = Reader(read_bytes)
                header = reader.header()
                assert header['tile_type'] == TileType.MVT and header['max_zoom'] == 10 and header['min_zoom'] == 5
                assert reader.metadata()['vector_layers'][0]['id'] == 'outdoors'
                coordinates, tile = next(all_tiles(read_bytes))
                assert reader.get(*coordinates) == tile
                decoded = mapbox_vector_tile.decode(gzip.decompress(tile))['outdoors']['features']
                assert decoded and all(f['properties']['id'] in features for f in decoded)
            term = next((json.loads(row[0])['properties']['name'].split()[0] for row in
                         db.execute('SELECT summary FROM features LIMIT 20')
                         if json.loads(row[0])['properties']['name'].split()), None)
            if term:
                # Tokenize as the native search does, then bind rather than interpolate the query.
                token = ''.join(c for c in term if c.isalnum())
                if token:
                    db.execute('SELECT rowid FROM search WHERE search MATCH ? LIMIT 30',
                               (f'"{token}"*',)).fetchall()
            try:
                db.execute('DELETE FROM features')
                raise AssertionError('Read-only catalog was writable')
            except sqlite3.OperationalError:
                pass
        total += pin['bytes']
        installed += pin['installedBytes']
        count += len(features)
        print(f'Verified {pin["state"]}: {len(features)} records, {pin["tileCount"]} tiles', flush=True)
    print(f'All 50 state catalogs verified: {count} records; {total} transfer bytes; {installed} installed bytes.', flush=True)


if __name__ == '__main__':
    verify()
