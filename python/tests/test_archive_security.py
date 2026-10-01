import io
import unittest
import zipfile

from tools.archive_security import inspect_zip


class ArchiveSecurityTests(unittest.TestCase):
    def archive(self, members):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, payload in members:
                archive.writestr(name, payload)
        data.seek(0)
        return zipfile.ZipFile(data)

    def test_accepts_small_bounded_archive(self):
        with self.archive([("dataset.gdb/table", b"synthetic")]) as archive:
            inspect_zip(archive)

    def test_rejects_compression_bomb_before_read(self):
        with self.archive([("data.dbf", bytes(1024 * 1024))]) as archive:
            with self.assertRaisesRegex(ValueError, "expansion"):
                inspect_zip(archive)

    def test_bounds_members_total_expansion_and_entry_count(self):
        for limits in ({"maximum_entries": 1}, {"maximum_expanded_bytes": 15},
                       {"maximum_member_bytes": 9}):
            with self.archive([("one", b"0123456789"), ("two", b"0123456789")]) as archive:
                with self.assertRaises(ValueError):
                    inspect_zip(archive, **limits)

    def test_rejects_traversal_and_windows_path_aliases(self):
        for name in ("../escape", "C:/escape", "a/../escape", "NUL.dbf", "table. "):
            with self.archive([(name, b"synthetic")]) as archive:
                with self.assertRaises(ValueError):
                    inspect_zip(archive)

    def test_rejects_case_collisions_and_links(self):
        with self.archive([("table.dbf", b"one"), ("TABLE.DBF", b"two")]) as archive:
            with self.assertRaises(ValueError):
                inspect_zip(archive)
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            entry = zipfile.ZipInfo("link")
            entry.external_attr = 0o120777 << 16
            archive.writestr(entry, "outside")
        data.seek(0)
        with zipfile.ZipFile(data) as archive:
            with self.assertRaises(ValueError):
                inspect_zip(archive)


if __name__ == "__main__":
    unittest.main()
