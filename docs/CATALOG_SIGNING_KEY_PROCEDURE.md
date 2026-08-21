# Catalog signing key, rotation, and revocation procedure

**Package:** WP-010
**Status:** Accepted foundation; production key provisioning remains a release-owner operation

## Security boundary

Catalog manifests use the version-1 envelope in `config/catalog-signature.schema.json`. Its Ed25519 signature binds the envelope version, algorithm, channel, trust-root ID, key ID, monotonic anti-replay version, manifest SHA-256, and signing timestamp. The verifier receives trust policy independently of the catalog and fails closed if hashing or signature verification is unavailable.

Signing private keys, recovery material, credentials, and private-channel public-key registries stay outside Git, including private Git. `config/catalog-trust.json` pins only trust-root identifiers, external key-source names, and unsigned-development policy. It intentionally provisions no production key: public and private production catalogs remain untrusted until the responsible release environment supplies an approved keyring.

## Initial provisioning

1. The release/security owner creates an Ed25519 signing key in an approved external signing service, hardware-backed store, or offline release workstation. The private key must be non-exportable where the selected facility supports that control.
2. Record the channel, trust-root ID, unique key ID, public-key fingerprint, creation time, custodian roles, and recovery/compromise contacts in the controlled release record. Never record the private key or seed.
3. Two authorized reviewers compare the public-key fingerprint through an independent channel before adding the public key to that channel's trusted keyring.
4. Bind the keyring to the `trustRoot` and `keySource` pinned in `config/catalog-trust.json`. A public key is not trusted merely because it appears in a catalog or its envelope.
5. Run T-REL-003-C01 through C08 against the exact candidate. Until this succeeds, release stays blocked and the last known-good catalog remains active.

## Signing a catalog manifest

1. Build and rights-check the exact immutable catalog candidate.
2. Hash the exact manifest bytes with SHA-256.
3. Allocate an anti-replay version greater than every accepted version for that channel and trust root. Never reuse a value, including after a failed or withdrawn release.
4. Construct the fixed version-1 signature payload in `catalogSignaturePayload`; do not reserialize or omit fields.
5. Ask the external channel signer to sign the UTF-8 payload with Ed25519, store only the base64 signature in the envelope, and independently verify it before publication.
6. Record source commit, manifest digest, envelope digest, channel, trust root, key ID, anti-replay version, signer service, and approvals without including secret material.

## Planned rotation

1. Provision and independently verify the replacement key while the predecessor remains trusted.
2. Publish the replacement public key through the channel's independently controlled keyring and verify both keys during a bounded overlap.
3. Sign the first replacement-key catalog with a strictly greater anti-replay version. The keyring change itself must be authorized through an already trusted release path; a catalog cannot introduce its own trust.
4. After supported clients have the replacement key, mark the predecessor revoked, run C06 and C07, and remove signing access. Keep its public ID and revocation record for audit.

## Emergency revocation

1. Pause the affected catalog channel and signing jobs immediately; preserve audit evidence without copying secrets into issues, chat, CI, or Git.
2. Mark the key revoked in the external channel keyring, distribute the revocation through the trusted release path, and reject all future candidates bearing that key.
3. Assess every version signed since the last known uncompromised event. Allocate a new anti-replay version; never roll the counter backward.
4. Keep the last known-good compatible catalog active. Signature verification authorizes a candidate only; the atomic pointer and rollback behavior belong to WP-303 and must not mutate private data.
5. Provision a replacement using the initial-provisioning steps, run C01–C08, document the incident privately, and publish only the minimum safe public advisory.

## Unsigned development catalogs

Only the `local` channel may accept an unsigned catalog, and only when it displays the exact label `UNSIGNED DEVELOPMENT CATALOG — NOT FOR PRODUCTION`. Public and private production policies reject the candidate even if that label is present. Relabeling never promotes an unsigned or private artifact.
