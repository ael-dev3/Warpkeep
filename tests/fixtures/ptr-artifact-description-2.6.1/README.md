# Official compiled PTR description captures

`first.json` and `second.json` are separate successful executions of pinned
SpacetimeDB 2.6.1 standalone `extract-schema <artifact.js> --host-type js`.
The command uses the official in-memory host and emits normalized RawModuleDefV10.
No provider call, running server, or database publication was involved.

- Official source commit: `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`.
- Linux standalone SHA256: `a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b`.
- Historical synthetic-fault PTR artifact: 2,411,471 bytes; SHA256
  `db8b615a55191693db6465a117eefdfb3d0640494f79f700540814587f359f0d`.
- First output SHA256: `f2e47b3f8413cb27d77534a8a98b4793c4c1e8c9240df29968d83e9e41826640`.
- Second output SHA256: `4842ba28597a2fb563c79b10996edff04e00d965cd4787e1913df1f463fb86ea`.

These contain module definitions, not database rows or credentials. They are
historical regression fixtures, not current production-artifact attestations.
Internal HashMaps vary the order of types, tables, indexes, constraints, and
explicit-name entries across runs. Tests require equal canonical descriptions
while preserving ordered typespace references, columns, variants, reducers,
and procedures.

The initial normalized description profile accepts only the explicitly validated
RawV10 subset. It rejects unknown fields/sections, duplicate keyed identities,
nonempty views, RLS, HTTP handlers/routes, view primary keys, and column defaults.
Sequence integers outside JavaScript's safe-integer range are unsupported and
rejected without rounding. Named table indexes/constraints/sequences and schedules
are required, matching official normalized output. Every accepted field remains
in the canonical description; absent sections are not invented. This profile
identifies descriptions and does not authorize migrations or approve schema changes.

Source: `crates/standalone/src/subcommands/extract_schema.rs`,
`crates/schema/src/def.rs`, and `crates/lib/src/db/raw_def/v10.rs` at the pinned
commit. Official 2.6.1 and 2.10 schema endpoints offer V10 directly; future
producer integration must attest the executing host contract independently.

The publisher uses the existing private CLI attestation's standalone companion,
checks artifact identity and CLI snapshot before/after extraction, passes its
owned descriptor as fd3, strips inherited environment, and bounds the child to
40 seconds and 16 MiB per output stream with SIGKILL on expiry. These bounds do
not constitute an OS sandbox or guarantee denial of every attempted host syscall.
The official host resolves its own supported Spacetime ABI imports.
