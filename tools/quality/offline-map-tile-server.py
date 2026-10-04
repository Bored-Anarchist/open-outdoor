"""Loopback-only browser QA bridge for bundled PMTiles and a synthetic installed state."""
import importlib.util
import json
import mmap
import re
import sqlite3
import sys
import tempfile
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from pmtiles.reader import Reader

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('builder', ROOT / 'tools/packages/build-state-loader.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

with ExitStack() as stack:
    base = Path(stack.enter_context(tempfile.TemporaryDirectory(dir=builder.scratch_root())))
    coordinates = [-73.12345678, 42.87654321]
    features = [
        {'type': 'Feature', 'id': 'qa-water', 'properties': {'kind': 'poi', 'name': 'QA Spring',
         'category': 'water', 'unit': 'Synthetic park', 'sourceId': 'synthetic-public'},
         'geometry': {'type': 'Point', 'coordinates': coordinates}},
        {'type': 'Feature', 'id': 'qa-trail', 'properties': {'kind': 'trail', 'name': 'QA Trail',
         'category': 'other', 'unit': 'Synthetic park', 'sourceId': 'synthetic-public'},
         'geometry': {'type': 'LineString', 'coordinates': [coordinates, [-73.121, 42.878]]}},
    ]
    for feature in features:
        feature['properties']['id'] = feature['id']
    summaries = [{'id': feature['id'], 'properties': feature['properties'], 'bounds':
                  coordinates * 2 if feature['id'] == 'qa-water' else
                  [coordinates[0], coordinates[1], -73.121, 42.878]} for feature in features]
    (base / 'outdoors.geojson').write_text(builder.compact({'type': 'FeatureCollection', 'features': features}))
    (base / 'index.json').write_text(builder.compact({'schemaVersion': 1, 'features': summaries}))
    (base / 'DATA_NOTICES.md').write_text('Synthetic QA data only')
    (base / 'manifest.json').write_text(builder.compact({
        'classification': 'SOURCE_REDISTRIBUTABLE', 'distribution': 'public',
        'generatedAt': '2026-10-03T00:00:00Z', 'rights': {'attribution': ['Synthetic QA']},
        'artifacts': {key: {'sha256': builder.digest(base / file)} for key, file in
                      [('geojson', 'outdoors.geojson'), ('index', 'index.json')]}}))
    builder.build_state({'state': 'NY', 'name': 'New York'}, base, max_zoom=10)
    archives = {}
    for name, path in [('world', ROOT / 'packages/map/src/assets/world-overview-z6.pmtiles'),
                       ('regional', ROOT / 'packages/map/src/assets/us-canada-territories-z7-z9.pmtiles'),
                       ('state', base / 'outdoors.pmtiles')]:
        # The builder stores its tile archive only in SQLite; use the embedded bytes for QA.
        if name == 'state':
            with sqlite3.connect(base / 'state.sqlite') as db:
                tile_bytes = db.execute('SELECT data FROM assets WHERE id=1').fetchone()[0]
            archives[name] = Reader(lambda offset, length, data=tile_bytes: data[offset:offset + length])
        else:
            stream = stack.enter_context(path.open('rb'))
            mapping = stack.enter_context(mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ))
            archives[name] = Reader(lambda offset, length, data=mapping: data[offset:offset + length])
    native = (ROOT / 'packages/native-spikes/ios/OpenOutdoorStatePackages.swift').read_text()
    query = re.search(r'func places.*?let sql = """\s*(SELECT json_object.*?)\s*"""', native, re.S).group(1)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def do_GET(self):
            path = urlparse(self.path).path
            if path == '/places':
                with sqlite3.connect(base / 'state.sqlite') as db:
                    features = [json.loads(row[0]) for row in db.execute(query, [-74, -72, 42, 44])]
                data = json.dumps(features).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
            else:
                match = re.fullmatch(r'/(world|regional|state)/(\d+)/(\d+)/(\d+)\.pbf', path)
                if not match:
                    self.send_error(404)
                    return
                name, z, x, y = match.groups()
                data = archives[name].get(int(z), int(x), int(y))
                self.send_response(200 if data else 204)
                self.send_header('Content-Type', 'application/x-protobuf')
                if data:
                    self.send_header('Content-Encoding', 'gzip')
                data = data or b''
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_):
            pass

    class TileServer(ThreadingHTTPServer):
        # Broad overview views request many tiles at once.
        request_queue_size = 64

    server = TileServer(('127.0.0.1', 0), Handler)
    print(f'QA_TILE_SERVER={server.server_port}', flush=True)
    server.serve_forever()
