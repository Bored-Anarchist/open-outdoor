import json
import tempfile
import unittest
from pathlib import Path

from open_outdoor_data.cli import build_catalog


class CatalogTests(unittest.TestCase):
    def test_public_catalog_is_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.json"
            output = root / "output.json"
            source.write_text('{"classification":"public","schemaVersion":1}', encoding="utf-8")
            build_catalog(source, output)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["classification"], "public")


if __name__ == "__main__":
    unittest.main()
