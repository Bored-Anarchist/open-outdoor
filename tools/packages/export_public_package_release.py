#!/usr/bin/env python3
"""Build integrity-checked, per-state archives for a public GitHub Release."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
MAX_RELEASE_ASSET_BYTES = 2 * 1024 * 1024 * 1024


def sha256_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    return size, digest.hexdigest()


def safe_relative_path(value: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if (
        not value
        or path.is_absolute()
        or "\\" in value
        or any(part in ("", ".", "..") for part in path.parts)
    ):
        raise ValueError(f"Unsafe public backup path: {value!r}")
    return path


def load_settings() -> dict[str, Any]:
    settings_path = ROOT / ".private" / "package-maintenance.json"
    if not settings_path.is_file():
        raise FileNotFoundError(f"Missing ignored package settings: {settings_path}")
    return json.loads(settings_path.read_text(encoding="utf-8"))


def build_release_assets(backup_release: Path, output: Path) -> dict[str, Any]:
    backup_release = backup_release.resolve(strict=True)
    output = output.resolve()
    if output == backup_release or backup_release in output.parents:
        raise ValueError("Release archive output must be separate from its backup input")

    receipt_path = backup_release / "backup-receipt.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("complete") is not True or receipt.get("channel") != "public":
        raise ValueError("A completed public backup receipt is required")

    states = json.loads(
        (ROOT / "config" / "us-state-forestry-agencies.json").read_text(encoding="utf-8")
    )["states"]
    if len(states) != 50:
        raise ValueError("Expected exactly 50 configured states")

    descriptors = receipt.get("files")
    if not isinstance(descriptors, list):
        raise ValueError("Public backup receipt has no file inventory")
    by_file: dict[str, dict[str, Any]] = {}
    for descriptor in descriptors:
        rel = safe_relative_path(descriptor.get("file", ""))
        if (
            not isinstance(descriptor.get("bytes"), int)
            or descriptor["bytes"] < 0
            or not isinstance(descriptor.get("sha256"), str)
            or len(descriptor["sha256"]) != 64
        ):
            raise ValueError(f"Invalid backup descriptor: {descriptor!r}")
        if descriptor["file"] in by_file:
            raise ValueError(f"Duplicate backup path: {descriptor['file']}")
        by_file[descriptor["file"]] = descriptor

    output.mkdir(parents=True, exist_ok=False)
    assets: list[dict[str, Any]] = []

    def verify_source(relative: str, descriptor: dict[str, Any]) -> Path:
        source = (backup_release / Path(*safe_relative_path(relative).parts)).resolve(strict=True)
        if backup_release not in source.parents:
            raise ValueError(f"Backup file escapes release root: {relative}")
        size, digest = sha256_file(source)
        if size != descriptor["bytes"] or digest != descriptor["sha256"]:
            raise ValueError(f"Backup checksum mismatch: {relative}")
        return source

    for state in states:
        code = state["code"]
        state_entries = sorted(
            (name, descriptor)
            for name, descriptor in by_file.items()
            if name.startswith(f"{code}/")
        )
        required = {f"{code}/{name}" for name in ("manifest.json", "DATA_NOTICES.md")}
        present = {name for name, _ in state_entries}
        if not required.issubset(present):
            raise ValueError(f"{code}: public manifest and notices are required")
        manifest_path = verify_source(
            f"{code}/manifest.json", by_file[f"{code}/manifest.json"]
        )
        state_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if (
            state_manifest.get("publicDistribution") is not True
            or state_manifest.get("classification") != "SOURCE_REDISTRIBUTABLE"
        ):
            raise ValueError(f"{code}: manifest does not permit public redistribution")
        archive_name = f"open-outdoor-US-{code}.zip"
        archive_path = output / archive_name
        with zipfile.ZipFile(
            archive_path,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=6,
            allowZip64=True,
        ) as archive:
            for relative, descriptor in state_entries:
                source = verify_source(relative, descriptor)
                archive.write(source, arcname=relative)
        with zipfile.ZipFile(archive_path) as archive:
            if archive.testzip() is not None:
                raise ValueError(f"Archive CRC verification failed: {archive_name}")
            if sorted(archive.namelist()) != [name for name, _ in state_entries]:
                raise ValueError(f"Archive file list mismatch: {archive_name}")
        size, digest = sha256_file(archive_path)
        if size >= MAX_RELEASE_ASSET_BYTES:
            raise ValueError(f"{archive_name} exceeds GitHub's per-asset size limit")
        assets.append(
            {
                "name": archive_name,
                "bytes": size,
                "sha256": digest,
                "state": code,
                "files": len(state_entries),
            }
        )

    index_files = ("inventory.json", "loader-inventory.json")
    index_name = "open-outdoor-US-index.zip"
    index_path = output / index_name
    with zipfile.ZipFile(index_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name in index_files:
            descriptor = by_file.get(name)
            if descriptor is None:
                raise ValueError(f"Public backup is missing {name}")
            archive.write(verify_source(name, descriptor), arcname=name)
    index_size, index_digest = sha256_file(index_path)
    assets.append(
        {"name": index_name, "bytes": index_size, "sha256": index_digest, "files": len(index_files)}
    )

    receipt_asset = "open-outdoor-public-backup-receipt.json"
    (output / receipt_asset).write_bytes(receipt_path.read_bytes())
    receipt_size, receipt_digest = sha256_file(output / receipt_asset)
    assets.append(
        {"name": receipt_asset, "bytes": receipt_size, "sha256": receipt_digest, "files": 1}
    )

    manifest = {
        "schemaVersion": 1,
        "channel": "public",
        "sourceBackupFingerprint": receipt["fingerprint"],
        "sourceBackupVerifiedAt": receipt["verifiedAt"],
        "packageCount": 50,
        "assets": sorted(assets, key=lambda asset: asset["name"]),
    }
    manifest_path = output / "open-outdoor-public-release-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    sums_path = output / "SHA256SUMS.txt"
    sums_path.write_text(
        "".join(f"{asset['sha256']}  {asset['name']}\n" for asset in manifest["assets"])
        + f"{sha256_file(manifest_path)[1]}  {manifest_path.name}\n",
        encoding="utf-8",
    )
    readme_path = output / "README.md"
    readme_path.write_text(
        "# Open Outdoor public state packages\n\n"
        "Each `open-outdoor-US-XX.zip` contains one state's complete public package, "
        "including its manifest, data notices, GeoJSON, index, import parts, and SQLite catalog. "
        "`open-outdoor-US-index.zip` contains the 50-state inventories. Verify downloaded asset "
        "hashes against `SHA256SUMS.txt`; the per-state manifests and notices retain source "
        "attribution and distribution conditions.\n",
        encoding="utf-8",
    )
    for path in (manifest_path, sums_path, readme_path):
        size, digest = sha256_file(path)
        assets.append({"name": path.name, "bytes": size, "sha256": digest, "files": 1})

    if len(assets) > 1000:
        raise ValueError("Release exceeds GitHub's 1000-asset limit")
    return {
        "output": str(output),
        "sourceBackupFingerprint": receipt["fingerprint"],
        "assetCount": len(assets),
        "assets": sorted(assets, key=lambda asset: asset["name"]),
    }


def main() -> None:
    settings = load_settings()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--backup-release",
        type=Path,
        default=Path(settings["publicRelease"]),
        help="completed public backup release; defaults to ignored local settings",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / ".scratch" / "public-github-release",
        help="folder for per-state release archives",
    )
    arguments = parser.parse_args()
    print(json.dumps(build_release_assets(arguments.backup_release, arguments.output), indent=2))


if __name__ == "__main__":
    main()
