"""Synthetic checks for private KML selection and coordinate safety."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "private_kml", Path(__file__).with_name("convert-private-agency-kml.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def document(coordinates="-97, 35, 0", name="Example State Park"):
    return (
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
        f'<Placemark><name>{name}</name><description>&lt;img src="remote"/&gt;</description>'
        f'<Point><coordinates>{coordinates}</coordinates></Point></Placemark>'
        '<Placemark><name>Federal Site</name><Point><coordinates>-97,35</coordinates>'
        '</Point></Placemark></Document></kml>'
    ).encode()


class PrivateKmlTests(unittest.TestCase):
    def test_selection_discards_media_and_federal_sites(self):
        features, excluded = module.park_points(document())
        self.assertEqual(excluded, ["Federal Site"])
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]["geometry"]["coordinates"], [-97.0, 35.0])
        self.assertEqual(features[0]["properties"], {"NAME": "Example State Park"})

    def test_rejects_ambiguous_or_invalid_locations(self):
        for coordinates in ("-97,35 -96,35", "-74,42", "NaN,35"):
            with self.subTest(coordinates=coordinates), self.assertRaises(ValueError):
                module.park_points(document(coordinates))

    def test_rejects_xml_entities(self):
        with self.assertRaisesRegex(ValueError, "entities"):
            module.park_points(b'<!DOCTYPE kml [<!ENTITY x "value">]>' + document())


if __name__ == "__main__":
    unittest.main()
