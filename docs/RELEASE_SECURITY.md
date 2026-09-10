# Release security and independent verification

WP-504 provides detached Ed25519 signing of an exact release inventory and its provenance. It does not publish a release or replace WP-506 acceptance, Apple code signing, or the WP-010 catalog envelope. The unsigned iOS feasibility workflow remains development-only.

## Assemble and review

Use a clean protected commit with exact-head CI evidence and the pinned `config/release.json` toolchain. Record the immutable builder workflow revision and run URL in `provenance.builder`. Hash the actual `pnpm-lock.yaml`, `uv.lock`, `config/release.json` and all other inputs (including native lockfiles and workflow) into named provenance materials. Use material name `release.json` for the configuration digest. Rebuild independently and compare artifact digests; signing does not establish reproducibility.

Stage only intended distribution files in a new flat directory. Include one or more files of every role: `artifact`, `sbom`, `dbom`, `rights`, `notices`. Generate the npm inventory with `pnpm release:sbom PATH.json`; it includes all locked build/runtime packages and registry integrity values. Add the actual Python, native and compiler/tool inventories for the candidate. Retain WP-302's tool SBOM, DBOM, source/rights manifests, attribution and size report. A custom inventory is not a claim of SPDX/CycloneDX conformance. Data-free builds include an explicitly reviewed empty DBOM with the reason. Public and private builds use separate staging directories, manifests, keys and reviewers; never copy a private BOM into public evidence.

The release manager reviews inventory completeness, licenses, dependency advisories, rights/freshness, protected-commit evidence, exact-head checks and release quorum before signing. Attach the sanitized review and WP-506 acceptance report as inventoried artifacts. BOM presence is enforced by the verifier; semantic completeness and source authorization remain reviewer responsibilities. Do not derive approval from a field supplied by the builder.

## Descriptor and signing

A descriptor outside the staging directory has this shape (replace every illustrative value):

```json
{
  "schemaVersion": 1,
  "releaseId": "v1.0.0",
  "channel": "public",
  "sequence": 1,
  "keyId": "public-release-1",
  "provenance": {
    "repository": "https://github.com/Bored-Anarchist/open-outdoor",
    "commit": "40-character-protected-commit-sha",
    "builder": "immutable-workflow-revision-and-run-url",
    "materials": [
      {"name": "pnpm-lock.yaml", "sha256": "64-character-digest"},
      {"name": "uv.lock", "sha256": "64-character-digest"},
      {"name": "release.json", "sha256": "64-character-digest"}
    ]
  },
  "files": [
    {"name": "app.ipa", "role": "artifact"},
    {"name": "sbom.json", "role": "sbom"},
    {"name": "dbom.json", "role": "dbom"},
    {"name": "rights.json", "role": "rights"},
    {"name": "NOTICE.txt", "role": "notices"}
  ]
}
```

Set `OPEN_OUTDOOR_RELEASE_KEY_FILE` to an externally managed Ed25519 PKCS#8 PEM file, then run `pnpm release:artifacts seal STAGING DESCRIPTOR.json`. The key must never enter the repository, PR jobs, logs or distribution. The command writes `release.json`, detached `release.sig` and `SHA256SUMS`, refusing overwrites. A failed/interrupted seal requires a fresh staging directory. Signing covers the manifest bytes with domain `open-outdoor-release-v1` followed by NUL; the manifest binds every artifact digest and size and all provenance. File names are flat and unique ignoring case. Links, traversal, missing roles and local/development channels are rejected.

## Independent verifier

Obtain the public key and expected candidate policy through an authenticated channel independent of the download. A policy contains exactly `releaseId`, `channel`, `sequence`, `provenance` (same field shapes as above) and `keys`, an array of `{keyId, status: "active" | "revoked", publicKeyPem}`. Expected provenance must come from inspection of the protected commit and inputs, not copying the downloaded manifest. Keep an external monotonic release ledger; select the exact approved sequence from it. The CLI deliberately has no automatic trust enrollment or replay-state mutation.

From a separately obtained trusted copy of the verifier, run:

```text
node tools/release-artifacts.mjs verify DOWNLOADED_DIRECTORY TRUSTED_POLICY.json
```

Only Node built-ins are required. No private key or package installation is needed. Exit zero means exact candidate identity, trusted active signature, artifact bytes, inventory and checksum index agree; it does not mean production acceptance. Unknown/revoked/duplicate keys, wrong commit/materials/channel/sequence, malformed signatures, tampering, missing files and unlisted files fail. The tests execute verification in a separate process using ephemeral synthetic keys; they do not claim an independent human release review.

## Key and dependency response

The owner/security responder keeps signing keys outside public infrastructure with least access. Review grants quarterly. On suspected compromise stop publication, revoke the key in the separately distributed trust policy, notify users through a sanitized advisory, establish a replacement through the original authenticated trust channel and reissue reviewed artifacts with a higher sequence. Never accept a new key merely because it accompanies an artifact. Keep old revoked identifiers in the trust record. Catalog rotation also follows WP-010 channel and anti-replay rules.

Before each release and whenever a vulnerability report arrives, check current advisories against all ecosystem inventories. Record affected package/version, advisory, reachability, severity, owner, mitigation, due date and verification. Unresolved exploitable critical/high vulnerabilities block release; no unsupported automatic override. Patch or remove the dependency, update locks, rerun relevant and full quality/security checks, regenerate BOMs and signatures, and publish a sanitized advisory. Uncertain reachability remains open. Response targets and private reporting follow SECURITY.md. No new scheduled CI spend is introduced.
