# Release prerequisite recheck — 2026-09-07

Read-only checks from the Windows release worktree at source `05f7272`.
No credentials, raw receipts, player data or private identity values are included.

## Cloudflare

Wrangler 4.110.0 `whoami` succeeded using its configured OAuth login. However,
`wrangler deployments list`, run in `services/auth-bridge`, failed with Cloudflare
code 10007: the configured `warpkeep-auth-bridge` Worker does not exist in the
selected account. Login success is therefore not evidence of access to the
production Worker. A CLI session for the owning account is required before
production service inspection or deployment. Do not create a replacement Worker
in this account to work around this mismatch. No deployment was attempted.

## SpacetimeDB

Installed Windows CLI 2.6.1, using
`spacetime list --server https://maincloud.spacetimedb.com --yes`, succeeded and
listed `warpkeep`, `warpkeep-genesis-002`, and `warpkeep-ptr` under the configured
identity. The reported G001 immutable identity matched the recorded baseline
identity. This proves authenticated database-list access, not successful module
publication, live invariant verification, owner PTR play, or recovery.

## Signer fixture prerequisites

Existence-only checks under the generator's fixed private root found all eight
required files absent:

- `fixture-materialization/wsl-toolchain-attestation-v1.json`
- `activation-evidence/records/g002-publish-receipt.json`
- `activation-evidence/records/g002-atlas-import-receipt.json`
- `activation-evidence/records/g002-sealed-live-receipt.json`
- `activation-evidence/records/ptr-publish-receipt.json`
- `activation-evidence/records/ptr-atlas-import-receipt.json`
- `activation-evidence/records/ptr-owner-provision-receipt.json`
- `activation-evidence/records/ptr-sealed-live-receipt.json`

This does not establish that equivalent records exist nowhere else. It does
establish that the current fixture generator cannot consume them at its fixed
location. Their authenticated producer paths must supply genuine records; do
not fabricate them or replace missing historical evidence with guessed values.

The recovery workflow remains uninstalled. These findings are release
prerequisites, not successful live-release evidence.
