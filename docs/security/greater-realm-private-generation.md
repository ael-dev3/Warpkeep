# Greater Realm private-generation boundary

The Greater Realm generator handles unrevealed world geometry. Its exact
outputs are security-sensitive game authority even before a production schema
exists. This document applies to the candidate-generation pull request only.

## Assets and trust boundaries

| Data | Classification | Allowed location |
| --- | --- | --- |
| Root/candidate seed bytes | Private authority | Owner-only workspace outside the repository |
| Exact canvas, cells, geology/geomorphology processes, paired topography/biomes, regions, gates, slots, sites, fields, transforms | Private authority | Owner-only workspace outside the repository |
| Chunk/topography-patch manifests, package/layout/stage digests, toolchain records, and inventories | Private operational data | Owner-only workspace outside the repository |
| Candidate maps and contact sheets | Private owner-review data | Owner-only workspace outside the repository |
| Aggregate allowlisted candidate metrics | Public sanitized evidence | `docs/evidence/greater-realm/` after strict validation |
| Generator source and synthetic fixtures | Public source | `scripts/atlas/` and `tests/` |

The browser, Vite `public/` tree, production `dist/`, source maps, Git history,
pull-request comments, CI artifacts, logs, and public SpacetimeDB tables are not
private storage.

## Local workspace controls

The tool accepts no secret through arguments or environment variables. It
creates a 256-bit candidate root internally. Secrets are never
included in an error, path, log, metric, preview watermark, or public handle.

The private workspace must:

- resolve to an absolute canonical directory outside the repository;
- be owned by the current user with directory mode `0700` and file mode `0600`;
- reject symbolic links and special files in every inspected path component;
- use an exclusive operation lock;
- publish bounded files atomically without following a replacement leaf;
- assemble an entire review batch in an opaque owner-only staging directory,
  attest the complete tree, atomically claim a no-replace owner-only envelope,
  move the tree beneath an opaque payload name, and expose that payload only
  through an atomically linked commit marker; logical readers reject every
  claim or envelope that is not fully committed, while failed cleanup removes
  only identity-pinned entries and otherwise leaves the claim fail-closed;
- store batch and candidate seeds in strict, type-tagged private envelopes so
  renamed seed files retain a scan-visible private marker while derivation
  continues to use only the extracted 32-byte payload;
- bind every package to generator version, source commit, parameters, seed
  identity, stage digests, and exact file inventory;
- bind every private chunk to its canonical cell-index digest and full authority
  field payload, then bind its referenced topography patch to the same cells,
  generation/topography/partition versions, exact process-and-derived field
  inventory, payload length, and payload digest;
- include final elevation, each glacial/arid/volcanic/coastal elevation delta,
  and the corresponding process masks/classes in that canonical inventory so
  the private physical-process metrics can be independently reproduced; retain
  raw geomorphology climate fields separately from final derived climate, and
  retain process-output elevation so process input is exactly output minus the
  total delta;
- bind the single dormant Tier III throne anchor as private atlas geometry and
  private manifest coordinates; expose only its boolean proof publicly;
- fail closed on a stale lock, substitution, permission drift, oversized
  package, unknown file, or digest mismatch.

Private paths are also ignored defensively. Ignore rules are not the security
boundary: a tracked-file scanner independently rejects private magic,
extensions, fields, images, or directories in Git and release surfaces.

Owned `Buffer` and typed-array copies are overwritten in `finally` blocks when
their lifetime ends, including temporary seed digests and failed atlas
serialization or persistence. Private candidate retirement also clears the
coordinate lookup captured by its indexed grid before clearing canonical field
arrays.

This is defense in depth, not a secure-erasure guarantee: V8 strings and
garbage-collected/native-library copies cannot be reliably overwritten, and
unlinking cannot erase copies retained by journaled, copy-on-write, or SSD
storage. Run the generator as a short-lived owner-only process on encrypted
local storage, with core dumps and external heap inspection disabled.

## Trusted toolchain bootstrap

Every supported `atlas:*` operation enters through
`scripts/atlas/greater-realm-toolchain-bootstrap.mjs`. The bootstrap imports
only Node built-ins and completes its checks before it loads local `tsx`,
TypeScript, esbuild, Sharp, libvips, or their JavaScript dependencies. It:

- requires the configured Node 22.13+ / npm 10 lock boundary;
- cross-checks direct exact pins in `package.json` and exact package versions
  and npm SHA-512 integrity records between `package-lock.json` and the
  committed Greater Realm toolchain lock;
- rejects unsupported host profiles, unsafe ownership or permissions,
  symbolic links in registry package contents, nested resolution overrides,
  special files, changed package aliases, and unverified module-resolution
  shadows; and
- hashes every executable-package file, executable-bit classification,
  relative path, and byte count against the committed package-tree records
  before launching the pinned absolute `tsx` entrypoint. Package-manager
  `.bin` launch shims are not part of registry package trees and are excluded;
  the child receives only the trusted Node executable directory in `PATH`, so
  those shims cannot participate in command resolution. npm's reviewed
  esbuild postinstall copy is handled explicitly: the stable JavaScript tree
  is hashed without `bin/esbuild`, while that installed executable must be
  byte-identical, executable, and size-identical to the separately locked
  platform-native esbuild package;

The bootstrap also rejects Node/module-resolution, native-loader, esbuild, and
Sharp override environment variables before verification and removes them
from the child environment. This is a fail-closed check, not a claim that the
bootstrap can undo code a hostile loader variable already injected into its
own process.

The committed lock currently supports Apple Silicon macOS (including the
optional `fsevents` load reachable from `tsx`) and glibc x64 Linux (where that
macOS-only module must not resolve). The check is local and does not need
network access. Establish `node_modules` with
a clean, locked install (`npm ci`) from reviewed `package.json` and
`package-lock.json`; do not bless an existing working tree by regenerating the
toolchain lock from it. Run `npm run atlas:toolchain-preflight` after install,
then use the `npm run atlas:*` commands rather than invoking `tsx` or the atlas
CLI directly.

The bootstrap passes a manifest digest and host profile to the child process so
private package metadata can be bound to the completed preflight. That receipt
is diagnostic provenance, not a signature, secret, or independently trusted
capability: a caller that bypasses the bootstrap can forge environment text,
but the supported CLI refuses an absent or inconsistent receipt. Likewise, the
runtime version/artifact record describes the process that produced a package;
it is not itself evidence that code was safe before it ran.

This boundary assumes a reviewed repository, trusted Node executable, and an
operating system not already controlled by another process with the owner's
privileges. The identity checks narrow filesystem races while reading, but do
not claim to stop an active same-user attacker from replacing files between a
successful preflight and child startup. Use a quiescent owner-only checkout;
re-run a clean locked install and the preflight if dependency state may have
changed.

## Sanitization model

Public evidence is built field by field from an exact schema. Private objects
are never copied and then “redacted.” The validator recursively rejects unknown
keys and rejects seed, coordinate, transform, chunk, layout, package, stage,
image, path, and reconstructive fields regardless of nesting.

The final sanitized JSON export pins the full destination-directory chain and
temporary inode, requires current-owner mode `0644`, exact size, link count,
and byte-for-byte contents, and installs with a no-clobber hard link. Parent or
temporary-path substitution fails without deleting the substituted entry.

Public review handles are random labels independent of seed or layout. PR A
does not publish a layout digest: pairing a reconstructive digest with a weak
or leaked seed would create an offline guessing oracle. Public evidence carries
its own canonical-document digest, calculated with that one digest field
omitted.

Candidate timing and process-lifetime peak-memory values are rounded and
excluded from world identity. The memory field is deliberately named
`processPeakMemoryMiBRounded`; Node's `maxRSS` is not a per-candidate peak.
Timestamps, machine paths, host details, preview encodings, and tool diagnostics
are also excluded from authority digests.

## Determinism and integrity

Generation uses named, counter-addressed random channels and canonical cell
ordering. Adding a later random consumer cannot perturb an existing stage.
Stable queues include a complete cell-index tie-break. Thermal and erosion
passes use double buffers rather than scan-order mutation. Persistable fields
use checked integers/fixed point; visual previews may use floating-point
presentation only.

Every batch attempt ordinal is regenerated before review. The rejection ledger
is an exact discriminated union: a completed candidate may record a
`proof-rejection` with its active-cell count and failed proofs, while only an
allowlisted, typed bounded-search exhaustion may record a
`geography-exhaustion` with its exact rejection code. Ordinary errors --
including invariant, malformed-input, filesystem, package, and toolchain
failures -- abort the atomic batch instead of being converted into candidate
rejections. Both rejection forms must reproduce exactly. Accepted attempts must
reproduce the complete candidate binary, private manifest, chunk and
topography-patch manifests, marked seed envelopes, and preview set.
Verification requires exact bytes, bounded sizes, complete inventories,
authority bindings, and recorded SHA-256 values. Each preview must exactly
match the regenerated marked PNG before its bounded decode/dimension check. A
candidate generated alone, first, or last must have the same authoritative
output.

Comparison is also deterministic but is not selection. Only metrics captured
from regenerated, byte-for-byte verified private candidate packages may enter
the comparison vector. It covers coordinate-free outer-boundary/coastal,
route/playability, chunk-balance, geological/topographic, climate/landform, and
biome axes. It may write only a private, unranked three-to-five-candidate
shortlist containing opaque handles and axis/constraint labels—not the metric
values—after enforcing route redundancy, 4–8-cell barrier width, zero
incompatible visual adjacencies, and zero incompatible biome/landform pairs.
The shortlist remains `selectionStatus: pending`, with no recommendation and no
automatic selection. Recording a choice requires a separate explicit owner
approval and private receipt; PR A does not record one.

## Required negative tests

The pull request must prove that it rejects:

- a seed-like argument or environment field;
- a repository-contained, public, symbolic-link, special-file, group-readable,
  or world-readable private workspace;
- unknown nested public-report fields;
- coordinates, seeds, transforms, chunk keys, private digests, image paths, or
  preview references in public evidence;
- tracked private package extensions or private magic in source, docs,
  `public/`, `dist/`, and source maps;
- source/config/seed/package substitution;
- a malformed or wrongly typed seed envelope, including a renamed private seed
  that still carries the private marker;
- chunk, topography-patch, process-field, cell-index, inventory, or toolchain
  substitution;
- a changed `tsx` or native dependency tree and package-lock integrity drift,
  before any injected dependency code executes;
- nondeterministic stage output, integer overflow, flow cycles, uphill routing,
  inconsistent lake surfaces/spills, or Lowlands catalog drift.

Tests use programmatically generated synthetic bytes and tiny synthetic grids.
They do not include a realistic seed string, private candidate map, or broad
secret-scanner exception.

## Residual risk

An owner workstation, unencrypted storage, backups, swap, screen capture, or
manually shared preview can still disclose a candidate. Candidate review should
therefore use encrypted owner-controlled storage and should never attach exact
maps to GitHub. A later server design must independently prove caller-bounded
hidden-region access; this offline boundary does not make client-side fog safe.
PR A changes no SpacetimeDB schema, browser/runtime data, renderer, public
generated asset, deployment, or production authority; the current Lowlands is
untouched.
