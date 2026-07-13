# Reconstruction and disaster recovery

This suite is the public-safe map for rebuilding Warpkeep development and deployment from trusted repositories and platform access. It intentionally contains no credential values, personal paths, identities, proof data, or private workflow messages.

## Recovery order

1. Isolate any suspected compromised machine and revoke its platform access.
2. Bootstrap a clean supported workstation from [`workstation-bootstrap.md`](workstation-bootstrap.md).
3. Clone Warpkeep and Warpkeep-Assets; check out a recorded tag or full SHA, never only a moving branch.
4. Run [`verification-checklist.md`](verification-checklist.md) before adding local configuration.
5. Restore public GitHub/Pages configuration with shared alpha disabled.
6. Inspect existing Cloudflare and Maincloud state before any deployment or publish.
7. Restore credential values only through platform secret stores or an approved local secret manager.
8. Deploy only components whose reviewed source changed.
9. Verify exact deployed coordinates, public health/security behavior, and the protected aggregate.
10. Re-enable shared alpha only after every server-side gate passes.

## Authority boundaries

- Git repositories and immutable, checksum-verified release attachments are authoritative inputs.
- Local caches, browser storage, terminal history, unverified backups, and unknown workstation state are not.
- One operator owns mutations during an incident or release; reviewers and agents remain read only.
- Never recreate or delete the Maincloud database as part of workstation recovery.
- Never copy unknown local state onto the rebuilt machine.
- Never print or commit secrets, private JWK members, JWTs, SIWF proofs, FIDs, credentialed URLs, or private RPC data.

## Documents

- [`workstation-bootstrap.md`](workstation-bootstrap.md) — tools, versions, clones, worktrees, and private-file conventions.
- [`service-inventory.md`](service-inventory.md) — repositories, GitHub, Pages, Worker, Maincloud, and public configuration.
- [`asset-pipeline.md`](asset-pipeline.md) — runtime/source boundary and immutable release reconstruction.
- [`deployment-recovery.md`](deployment-recovery.md) — safe Pages, Worker, and SpacetimeDB recovery/rollback.
- [`verification-checklist.md`](verification-checklist.md) — local, hosted, asset, production, and browser gates.
- [`credential-rotation.md`](credential-rotation.md) — names, purposes, planned rotation, and compromise response.
- [`incident-command.md`](incident-command.md) — ownership, modes, coordinates, evidence, and handoff.
- [`recovery-manifest.example.json`](recovery-manifest.example.json) — parseable coordinate template with no secrets.
