"""Validate advertised ZIP expansion before GIS readers allocate or decompress."""

import re
import stat


def inspect_zip(archive, *, maximum_entries=10_000,
                maximum_expanded_bytes=1024 ** 3,
                maximum_member_bytes=512 * 1024 ** 2,
                maximum_ratio=1000):
    entries = archive.infolist()
    if len(entries) > maximum_entries:
        raise ValueError("ZIP entry count exceeds the configured limit")
    total = 0
    seen = set()
    for entry in entries:
        name = entry.filename.replace("\\", "/").rstrip("/")
        parts = name.split("/")
        if (not name or name.startswith("/") or len(parts) > 16
                or any(part in ("", ".", "..") or re.search(r"[:\x00-\x1f]", part)
                       or re.search(r"[. ]$", part)
                       or re.match(r"^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)", part, re.I)
                       for part in parts)
                or name.casefold() in seen
                or stat.S_ISLNK(entry.external_attr >> 16)):
            raise ValueError("ZIP path or member type is unsafe")
        seen.add(name.casefold())
        total += entry.file_size
        if (entry.file_size > maximum_member_bytes or total > maximum_expanded_bytes
                or entry.file_size / max(1, entry.compress_size) > maximum_ratio):
            raise ValueError("ZIP expansion exceeds the configured limit")

