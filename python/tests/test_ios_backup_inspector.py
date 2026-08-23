import sqlite3
import tempfile
import unittest
from pathlib import Path

from open_outdoor_data.ios_backup_inspector import inspect_backup, write_report


class IosBackupInspectorTests(unittest.TestCase):
    def make_backup(self, root: Path, relative_paths: list[str]) -> None:
        database = sqlite3.connect(root / "Manifest.db")
        try:
            database.execute(
                """
                CREATE TABLE Files (
                  fileID TEXT PRIMARY KEY,
                  domain TEXT NOT NULL,
                  relativePath TEXT,
                  flags INTEGER
                )
                """
            )
            for index, relative_path in enumerate(relative_paths):
                database.execute(
                    "INSERT INTO Files VALUES (?, ?, ?, ?)",
                    (
                        f"synthetic-{index}",
                        "AppDomain-org.openoutdoor.local",
                        relative_path,
                        1,
                    ),
                )
            database.commit()
        finally:
            database.close()

    def test_passes_when_excluded_artifacts_are_absent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_backup(root, ["Documents/synthetic-user-export.gpx"])
            report = inspect_backup(root, "org.openoutdoor.local")
            self.assertTrue(report["passed"])
            self.assertEqual(report["inventoryEntryCount"], 1)
            self.assertEqual(report["unexpectedExcludedArtifactPaths"], [])

    def test_fails_and_reports_only_relative_paths_when_excluded_artifact_is_present(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_backup(
                root,
                [
                    "Library/Application Support/UserData/user.sqlite",
                    "Documents/synthetic-user-export.gpx",
                ],
            )
            report = inspect_backup(root, "org.openoutdoor.local")
            self.assertFalse(report["passed"])
            self.assertEqual(
                report["unexpectedExcludedArtifactPaths"],
                ["Library/Application Support/UserData/user.sqlite"],
            )
            self.assertNotIn("fileID", str(report))

            output = root / "reports" / "inspection.json"
            write_report(report, output)
            self.assertTrue(output.read_text(encoding="utf-8").endswith("\n"))

    def test_rejects_a_manifest_without_required_columns(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database = sqlite3.connect(root / "Manifest.db")
            database.execute("CREATE TABLE Files (fileID TEXT)")
            database.close()
            with self.assertRaisesRegex(ValueError, "lacks domain/relativePath"):
                inspect_backup(root, "org.openoutdoor.local")


    def test_rejects_an_encrypted_manifest_with_a_scoped_message(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "Manifest.db").write_bytes(b"synthetic encrypted manifest")
            with self.assertRaisesRegex(
                ValueError, "encrypted local-backup inventory is outside WP-008"
            ):
                inspect_backup(root, "org.openoutdoor.local")


if __name__ == "__main__":
    unittest.main()
