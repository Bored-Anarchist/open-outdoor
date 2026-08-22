"""Read-only iOS backup inventory inspection for Phase 0 synthetic artifacts."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Iterable, Sequence

DEFAULT_EXCLUDED_PREFIXES: tuple[str, ...] = (
    "Library/Application Support/Tracking/",
    "Library/Application Support/UserData/",
    "Library/Application Support/Catalogs/",
    "Library/Application Support/Attachments/",
    "Library/Application Support/Diagnostics/",
    "Library/Application Support/Phase0Diagnostics/",
)


def inspect_backup(
    backup_root: Path,
    bundle_id: str,
    expected_absent_prefixes: Sequence[str] = DEFAULT_EXCLUDED_PREFIXES,
) -> dict[str, object]:
    """Return a redacted report without copying file IDs or backup payloads."""

    root = backup_root.resolve(strict=True)
    manifest = (root / "Manifest.db").resolve(strict=True)
    if manifest.parent != root:
        raise ValueError("Manifest.db must be directly below the selected backup root")
    if not bundle_id or any(character.isspace() for character in bundle_id):
        raise ValueError("bundle ID must be a non-empty value without whitespace")

    connection = sqlite3.connect(f"{manifest.as_uri()}?mode=ro", uri=True)
    try:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(Files)").fetchall()
        }
        if not {"domain", "relativePath"}.issubset(columns):
            raise ValueError("Manifest.db Files table lacks domain/relativePath columns")
        domain = f"AppDomain-{bundle_id}"
        rows = connection.execute(
            "SELECT relativePath FROM Files WHERE domain = ? ORDER BY relativePath",
            (domain,),
        ).fetchall()
    finally:
        connection.close()

    paths = [str(row[0]).replace("\\", "/") for row in rows if row[0] is not None]
    forbidden = sorted(
        path
        for path in paths
        if any(path.startswith(prefix) for prefix in expected_absent_prefixes)
    )
    return {
        "schemaVersion": 1,
        "bundleId": bundle_id,
        "domain": f"AppDomain-{bundle_id}",
        "manifestPath": "Manifest.db",
        "inventoryEntryCount": len(paths),
        "expectedAbsentPrefixes": list(expected_absent_prefixes),
        "unexpectedExcludedArtifactPaths": forbidden,
        "passed": not forbidden,
    }


def write_report(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inspect an iTunes/Finder backup Manifest.db without reading payload files."
    )
    parser.add_argument("--backup-root", required=True, type=Path)
    parser.add_argument("--bundle-id", default="org.openoutdoor.local")
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument(
        "--expected-absent",
        action="append",
        dest="expected_absent",
        help="Override the default excluded relative-path prefixes; repeat as needed.",
    )
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    arguments = build_parser().parse_args(list(argv) if argv is not None else None)
    prefixes = (
        tuple(arguments.expected_absent)
        if arguments.expected_absent
        else DEFAULT_EXCLUDED_PREFIXES
    )
    report = inspect_backup(arguments.backup_root, arguments.bundle_id, prefixes)
    write_report(report, arguments.report)
    print(json.dumps(report, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
