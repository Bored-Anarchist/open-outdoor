# Synthetic private extension example

These files are PUBLIC_SYNTHETIC project fixtures under Apache-2.0. They contain no private source material. The private classification inside the example describes the destination of a future composed extension, not the provenance of these invented files. The example.invalid origin and repeated-letter revision are synthetic provenance identifiers and do not authorize an external source.

Copy this directory into an explicitly selected private root outside the public checkout. Rename open-outdoor.private.example.json to open-outdoor.private.json and private-packages.lock.example.json to private-packages.lock.json. Set OUTDOOR_PRIVATE_ROOT and run `pnpm private:compatibility`. The entry's SHA-256 is pinned to LF-normalized bytes. Package changes require a reviewed version/lock/provenance update.

The verifier checks but never executes the example. Real package origins, revisions, permissions, and private outputs belong only in the private environment. Existing schemaVersion 1 composition fixtures are unchanged.
