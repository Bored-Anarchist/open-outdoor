# Repository tooling

Use the root `pnpm` commands for stable workflow entry points. Executables and libraries live together by domain:

| Directory | Responsibility |
| --- | --- |
| `acquisition/` | Source discovery, rights policy, approved downloads and private staging |
| `packages/` | Public/private package construction, verification, recovery and storage policy |
| `catalog/` | Connector scaffolding and catalog/private-extension commands |
| `laptop/` | Pairing, local serving and signed updates |
| `reporting/` | Current generated inventories and status reports |
| `acceptance/` | Phase gates and retained acceptance evaluators |
| `quality/` | Release validation, benchmarks and build/test discovery |
| `lib/` | Shared transport, private-root and archive utilities |
| `test/` | Node release and dependency compatibility tests |
| `migrations/` | Guarded historical one-time migrations |

`pnpm test:release` discovers all `*.test.mjs` under `test/`, excluding the separately invoked dependency compatibility test. Vitest tooling tests live in `test/` too. Python tests live in `python/tests`; the standard Python suite includes state-loader tests using the locked loader group.

Run GIS converters as modules so project imports resolve, for example `uv run --frozen --group gis python -m tools.acquisition.convert-private-agency-shapefiles`. Loader commands are available through `pnpm map:states:build` and `pnpm map:states:verify`. Optional groups are defined and pinned in `pyproject.toml` and `uv.lock`, sharing the geometry pins through an included group.

Current agency rights and selection records belong to `config/agency-source-policy.json`; its schema rejects malformed records and the loader rejects duplicate keys or unmatched registry roles. Historical evidence is retained in [archived reports](../docs/archive/README.md). Public derivative approvals remain in their separate source-specific configuration.

`pnpm docs:generate` is the sole writer of the current public package and dataset trackers. It reads pinned inventories/manifests and catalog metadata, validates totals, and writes deterministic Markdown. `pnpm docs:check` verifies those outputs without changing them. Acquisition writes package receipts; it does not patch documentation.

Temporary caches and staging output go under ignored `.scratch/`. Use [Scratch.ps1](../scripts/Scratch.ps1) to create and mark disposable runs complete. `-Action Clean` lists completed candidates; adding `-Delete` removes only marked disposable runs. Legacy reports and recovery material under `.scratch/legacy/` are deliberately outside that cleanup scope. Never place durable private data or recovery receipts in a disposable run.
