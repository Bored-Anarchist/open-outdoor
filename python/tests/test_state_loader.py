"""Executable catalog schema, source-boundary and dateline tests using production builder."""
import importlib.util
import json
import pathlib
import re
import sqlite3
import tempfile
import unittest
from contextlib import closing

spec = importlib.util.spec_from_file_location('state_builder', pathlib.Path(__file__).resolve().parents[2] / 'tools/packages/build-state-loader.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class CatalogTests(unittest.TestCase):
    def source(self, base, private=False):
        feature = {'type': 'Feature', 'id': 'site-water', 'properties': {
            'id': 'site-water', 'name': 'Mountain Spring', 'kind': 'poi', 'category': 'water',
            'sourceId': 'private-ioverlander' if private else 'public-agency', 'unit': 'Test Park',
            'sourceCategory': 'Drinking Water'},
            'geometry': {'type': 'Point', 'coordinates': [-73, 42]}}
        (base / 'outdoors.geojson').write_text(builder.compact({'type': 'FeatureCollection',
            'features': [feature]}), encoding='utf-8')
        (base / 'index.json').write_text(builder.compact({'schemaVersion': 1, 'features': [{
            'id': feature['id'], 'properties': feature['properties'], 'bounds': [-73, 42, -73, 42]}]}), encoding='utf-8')
        (base / 'DATA_NOTICES.md').write_text('Source notice', encoding='utf-8')
        manifest = {'classification': 'SOURCE_REDISTRIBUTABLE', 'distribution': 'public',
            'generatedAt': '2026-09-27T00:00:00Z', 'rights': {'attribution': ['Agency']},
            'artifacts': {key: {'sha256': builder.digest(base / file)} for key, file in
                          [('geojson', 'outdoors.geojson'), ('index', 'index.json')]}}
        (base / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')

    def test_one_file_catalog_search_geometry_and_tile_integrity(self):
        with tempfile.TemporaryDirectory(prefix='state-test-', dir=builder.scratch_root()) as directory:
            base = pathlib.Path(directory)
            self.source(base)
            info = builder.build_state({'state': 'NY', 'name': 'New York'}, base, max_zoom=5)
            self.assertEqual(info['sha256'], builder.digest(base / 'state.sqlite'))
            with closing(sqlite3.connect(base / 'state.sqlite')) as db:
                self.assertEqual(db.execute('PRAGMA quick_check').fetchone()[0], 'ok')
                row = db.execute("SELECT summary,geometry FROM search JOIN features f ON f.ordinal=search.rowid WHERE search MATCH ?", ('"Spring"*',)).fetchone()
                self.assertEqual(json.loads(row[0])['properties']['sourceCategory'], 'Drinking Water')
                self.assertEqual(json.loads(row[1])['coordinates'], [-73, 42])
                self.assertEqual(db.execute('SELECT count(*) FROM spatial').fetchone()[0], 1)
                tiles = db.execute('SELECT data FROM assets WHERE id=1').fetchone()[0]
                self.assertEqual(tiles[:8], b'PMTiles\x03')
                self.assertEqual(builder.hashlib.sha256(tiles).hexdigest(), info['tilesSha256'])
            again = builder.build_state({'state': 'NY', 'name': 'New York'}, base, max_zoom=5)
            self.assertEqual(again['sha256'], info['sha256'])

    def test_private_records_and_changed_sources_fail_closed(self):
        with tempfile.TemporaryDirectory(prefix='state-test-', dir=builder.scratch_root()) as directory:
            base = pathlib.Path(directory)
            self.source(base, private=True)
            with self.assertRaisesRegex(ValueError, 'Private record'):
                builder.build_state({'state': 'NY', 'name': 'New York'}, base)
            self.source(base)
            with (base / 'outdoors.geojson').open('a', encoding='utf-8') as stream:
                stream.write(' ')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                builder.build_state({'state': 'NY', 'name': 'New York'}, base)

    def test_dateline_line_does_not_cross_the_world_for_display(self):
        geometry = builder.display_geometry({'type': 'LineString', 'coordinates': [[179, 50], [-179, 50]]})
        self.assertLess(geometry.length, 300000)
        self.assertTrue(geometry.is_valid)

    def test_resume_closes_sqlite_before_a_subsequent_rebuild(self):
        with tempfile.TemporaryDirectory(prefix='state-test-', dir=builder.scratch_root()) as directory:
            base = pathlib.Path(directory)
            self.source(base)
            state = {'state': 'NY', 'name': 'New York'}
            first = builder.build_state(state, base)
            resumed = builder.worker(state, base, True)
            self.assertEqual(resumed['sha256'], first['sha256'])
            rebuilt = builder.build_state(state, base)
            self.assertEqual(rebuilt['sha256'], first['sha256'])

    def test_numeric_upstream_names_remain_traceable_and_display_as_text(self):
        summary = builder.visitor_summary({'id': 'site', 'properties': {'name': 123, 'unit': None}})
        self.assertEqual(summary['properties']['name'], '123')
        self.assertEqual(summary['properties']['sourceName'], 123)
        self.assertEqual(summary['properties']['unit'], '')

    def test_native_viewport_query_returns_original_point_coordinates_only(self):
        # Execute the native query against a production-built synthetic SQLite catalog.
        native = (builder.ROOT / 'packages/native-spikes/ios/OpenOutdoorStatePackages.swift').read_text(encoding='utf-8')
        query = re.search(r'let sql = """\s*(SELECT json_object.*?)\s*"""', native, re.S).group(1)
        with tempfile.TemporaryDirectory(prefix='state-places-', dir=builder.scratch_root()) as directory:
            base = pathlib.Path(directory)
            self.source(base)
            builder.build_state({'state': 'NY', 'name': 'New York'}, base, max_zoom=5)
            with closing(sqlite3.connect(base / 'state.sqlite')) as db:
                rows = db.execute(query, [-74, -72, 41, 43]).fetchall()
                feature = json.loads(rows[0][0])
                self.assertEqual(feature['bounds'], [-73, 42, -73, 42])
                self.assertEqual(feature['properties']['category'], 'water')
                self.assertEqual(feature['properties']['origin'], 'public-catalog')
                self.assertEqual(db.execute(query, [-72, -71, 41, 43]).fetchall(), [])
                db.execute("UPDATE features SET geometry=?", [json.dumps({'type': 'LineString', 'coordinates': [[-73, 42], [-73.1, 42.1]]})])
                self.assertEqual(db.execute(query, [-74, -72, 41, 43]).fetchall(), [])

    def test_polygon_touching_dateline_keeps_its_area_and_dimension(self):
        geometry = builder.display_geometry({'type': 'Polygon', 'coordinates': [
            [[-180, 50], [-179, 50], [-179, 51], [-180, 51], [-180, 50]]]})
        self.assertEqual(geometry.geom_type, 'Polygon')
        self.assertGreater(geometry.area, 0)


if __name__ == '__main__':
    unittest.main()
