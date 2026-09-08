# Existing-update definition policy fixtures

These complete RawModuleDefV9 responses were captured from private-network SpacetimeDB 2.6.1 instances during the 2026-09-08 recovery rehearsal. They contain schema declarations, not player rows or credentials. A is the reconstructed earlier module; B adds the current gameplay tables and procedures. Captured PTR C has exactly the same schema bytes as PTR B, so it reuses that fixture for an identical-definition replacement.

| Capture | SHA-256 |
| --- | --- |
| G002 A | `5d21c2f14f61a8a55724253566d266057fece60a6a1ddc161336924f393e1ac3` |
| G002 B | `02cee4120ff65b9d210fd8cf3b3a6baa9f8e0ba977dd651610cabab553a7ef2c` |
| PTR A | `7e9a580eb4499e1f5800b5048f337c69aa1cd1a70c54d6a7f28749bb23c758c3` |
| PTR B and C | `939fd1919d280ff834a6e700466e7f7d84b2c928321196a941ab57837d9ddf51` |

The rehearsal result has SHA-256 `4632e8dc908a399a8d8319ce9f233d15b26afa9435af8fd90c2c6670d2304d46`. Local extraction evidence retains original filenames and byte hashes. The B schemas are also structurally identical to the complete compiled candidate descriptions used by the rehearsal.

## Supported policy

`warpkeep-raw-module-v9-no-views-rls-defaults-v1` accepts the exact RawModuleDefV9 envelope: typespace, tables, reducers, types, misc_exports and row_level_security. Both observed and candidate definitions must have empty RLS and only Procedure misc exports. Views are unsupported even when their declarations are unchanged, because the host can recompute a view whose implementation changed without displaying an UpdateView step. Column defaults and unknown export variants or structural fields are rejected. Known type envelopes and declaration shapes are checked; the host still owns complete schema validity, reference semantics and database migration execution.

Reducer and procedure declarations may change and new gameplay procedures are supported. These application entry points do not themselves constitute an old-table migration. The complete accepted raw definition is committed in the candidate schema digest, including procedures, reducers and type declarations. Therefore postflight must observe exactly that candidate description; a table-only match no longer suffices. Every old table descriptor and its reachable row-type closure must still match the candidate's existing table boundary. Table additions and identical-definition code replacement remain supported. Raw declaration ordering and type-reference numbering remain significant under this conservative policy.

Synthetic profile `warpkeep-synthetic-quiescent-existing-update-v3` records the definition policy in its binding and snapshots, and checks it again on reopening. The former v2 directory is checked and refused when it contains records: old evidence is retained, not silently promoted, ignored or replayed as a new attestation. Continue old rehearsals with their original code and evidence; start new v3 rehearsals in a fresh disposable environment. No production activation receipt format changes.

## Limits

This policy closes the definition fields that the older table-only check ignored. It does not establish remote server implementation, durability, actual program-to-description attribution, future application behavior, or preservation under concurrent gameplay. The current adapter still uses explicitly synthetic, quiescent row-equality checks and an isolated authenticated loopback transport; its production factory remains unavailable. A pinned local CLI is not proof of the executing production host version. Production delivery requires the separately verified host contract, authenticated artifact/definition binding and connected production receipt consumers.
