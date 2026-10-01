"""Validate advertised ZIP expansion before GIS readers allocate or decompress."""

import re
import stat
import math


def inspect_zip(archive, *, maximum_entries=10_000,
                maximum_expanded_bytes=1024 ** 3,
                maximum_member_bytes=512 * 1024 ** 2,
                maximum_ratio=1000):
    for value in (maximum_entries, maximum_expanded_bytes, maximum_member_bytes):
        if type(value) is not int or value <= 0:
            raise ValueError("ZIP limits are invalid")
    if (not isinstance(maximum_ratio, (int, float)) or isinstance(maximum_ratio, bool)
            or not math.isfinite(maximum_ratio) or maximum_ratio <= 0):
        raise ValueError("ZIP limits are invalid")
    entries = archive.infolist()
    if len(entries) > maximum_entries:
        raise ValueError("ZIP entry count exceeds the configured limit")
    total = 0
    seen = {}
    for entry in entries:
        name = entry.filename.replace("\\", "/").rstrip("/")
        parts = name.split("/")
        if (not name or name.startswith("/") or len(parts) > 16
                or any(part in ("", ".", "..") or re.search(r'[:\x00-\x1f<>"|?*]', part)
                       or re.search(r"[. ]$", part)
                       or re.match(r"^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)", part, re.I)
                       for part in parts)
                or name.casefold() in seen
                or stat.S_IFMT(entry.external_attr >> 16) not in (0, stat.S_IFREG, stat.S_IFDIR)):
            raise ValueError("ZIP path or member type is unsafe")
        seen[name.casefold()] = entry.is_dir()
        total += entry.file_size
        if (entry.file_size > maximum_member_bytes or total > maximum_expanded_bytes
                or entry.file_size / max(1, entry.compress_size) > maximum_ratio):
            raise ValueError("ZIP expansion exceeds the configured limit")
    for name in seen:
        parts = name.split("/")
        if any(seen.get("/".join(parts[:index])) is False for index in range(1, len(parts))):
            raise ValueError("ZIP parent path is a file")

