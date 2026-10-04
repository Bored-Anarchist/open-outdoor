"""Derive exact regional tile coverage from the pinned archive, without reading tile payloads."""
import hashlib
import json
from pathlib import Path

from pmtiles.reader import MmapSource, Reader
from pmtiles.tile import deserialize_directory, tileid_to_zxy

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'packages/map/src/assets'
archive = ASSETS / 'us-canada-territories-z7-z9.pmtiles'
manifest = json.loads((ASSETS / 'us-canada-basemap.manifest.json').read_text())
with archive.open('rb') as stream:
    if hashlib.file_digest(stream, 'sha256').hexdigest() != manifest['archive']['sha256']:
        raise ValueError('Regional basemap does not match its pinned checksum')
    source = MmapSource(stream)
    header = Reader(source).header()
    rows = {}

    def visit(offset, length):
        for entry in deserialize_directory(source(offset, length)):
            if entry.run_length == 0:
                visit(header['leaf_directory_offset'] + entry.offset, entry.length)
            else:
                for tile_id in range(entry.tile_id, entry.tile_id + entry.run_length):
                    z, x, y = tileid_to_zxy(tile_id)
                    rows.setdefault(z, {}).setdefault(y, set()).add(x)

    visit(header['root_offset'], header['root_length'])

coverage = {}
for z, tile_rows in sorted(rows.items()):
    ranges = []
    for y, columns in sorted(tile_rows.items()):
        start = previous = None
        for x in sorted(columns):
            if previous is not None and x != previous + 1:
                ranges.append([y, start, previous])
                start = None
            if start is None:
                start = x
            previous = x
        ranges.append([y, start, previous])
    coverage[str(z)] = ranges
output = {'archiveSha256': manifest['archive']['sha256'], 'rows': coverage}
(ASSETS / 'regional-basemap-coverage.json').write_text(
    json.dumps(output, separators=(',', ':')) + '\n', encoding='utf-8')
