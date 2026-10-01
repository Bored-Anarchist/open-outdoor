# Public-boundary incident response

If personal, restricted, operational-private, credential, signing, or recovery material reaches a public boundary:

1. Stop publication and disable affected workflows or releases.
2. Revoke and rotate every exposed credential or key before investigating convenience fixes.
3. Preserve a minimal, access-controlled incident timeline without copying the sensitive payload.
4. Notify repository security contacts through the private channel in `SECURITY.md`; do not open a public issue.
5. Remove public artifacts and caches where the host supports it. Treat Git history and third-party clones as permanently exposed.
6. Determine impact, required data-owner notification, and whether history rewriting is warranted. History rewriting never substitutes for revocation.
7. Add a synthetic regression signature or policy test, record corrective action, and require privacy/security approval before resuming publication.

Diagnostics are local, private, user-previewed, explicitly exported, and deleted no later than 72 hours after creation (24 hours by default). They never include credentials, precise coordinates, stable user identifiers, raw headers, cookies, or unrestricted request/response bodies.
