# Archived one-time migrations

The scripts under `2026-09-27/` retain historical New York rights-boundary work and the old hardcoded agency/report generators. Normal acquisition, packaging and reporting never invoke them.

They are guarded by `OUTDOOR_RUN_ARCHIVED_MIGRATION=2026-09-27`. Before opting in, review the exact inputs, fixed record-count assumptions, permissions, output paths and recovery receipts. Use an isolated checkout and backups. The old source-audit updater can overwrite newer source definitions and the old dataset tracker contains historical assumptions; neither is a current reporting command.

Keep archived decisions and receipts for traceability. Current operations use [domain tools](../README.md) and the structured source policy.
