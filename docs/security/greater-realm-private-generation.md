# Greater Realm private-generation boundary

The Greater Realm generator handles unrevealed world geometry. Its exact
outputs are security-sensitive game authority even before a production schema
exists. This document applies to the candidate-generation pull request only.

## Assets and trust boundaries

| Data                                                                                                                                                                                              | Classification            | Allowed location                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------ |
| Root/candidate seed bytes                                                                                                                                                                         | Private authority         | Owner-only workspace outside the repository            |
| Exact canvas, cells, geology/geomorphology processes, paired topography/biomes, vegetation/groundcover/wildflower patches, route/site anchors, ambient-life potentials, regions, gates, slots, sites, fields, transforms | Private authority         | Owner-only workspace outside the repository            |
| Chunk/topography-patch manifests, package/layout/stage digests, toolchain records, and inventories                                                                                                | Private operational data  | Owner-only workspace outside the repository            |
| Candidate maps and contact sheets                                                                                                                                                                 | Private owner-review data | Owner-only workspace outside the repository            |
| Aggregate allowlisted candidate metrics                                                                                                                                                           | Public sanitized evidence | `docs/evidence/greater-realm/` after strict validation |
| Generator source and synthetic fixtures                                                                                                                                                           | Public source             | `scripts/atlas/` and `tests/`                          |

The browser, Vite `public/` tree, production `dist/`, source maps, Git history,
pull-request comments, CI artifacts, logs, and public SpacetimeDB tables are not
private storage.

The two additional density channels and marsh-aware dressing rules are bound by
living-world authority v4, generator algorithm `.16`, and private atlas format
8. The terrain-seed
namespace remains `.3`; a package-layout revision is not permission to reroll
private world authority.

## Local workspace controls

The tool accepts no secret through arguments or environment variables. Secret
shapes include case-folded hexadecimal and standard or URL-safe Base64, and
reserved/loader environment keys are matched case-insensitively for portable
Windows semantics. The exact host metadata key
`NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S` may carry its public hexadecimal
browser-client digest; similarly named or spoofed digest keys receive no
exception. The tool creates a 256-bit candidate root internally. Secrets are
never included in an error, path, log, metric, preview watermark, or public
handle.

The private workspace must:

- resolve to an absolute canonical directory outside the repository;
- reject cross-platform path aliases before any filesystem operation,
  including Win32 drive-relative/alternate-stream syntax, reserved device
  names, silently trimmed trailing dots/spaces, controls, and wildcard names;
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
- bind every package to generator algorithm version, the independently pinned
  terrain-seed namespace, source commit, parameters, seed identity, stage
  digests, and exact file inventory;
- bind every private chunk to its canonical cell-index digest and full authority
  field payload, then bind its referenced topography patch to the same cells,
  generation/topography/partition versions, exact process-and-derived field
  inventory, payload length, and payload digest;
- bind every private dressing field through the same canonical chunk cells,
  deterministic vegetation/groundcover/wildflower/corridor/scenic-anchor/
  ambient-capacity field inventory, payload length, and payload digest; these
  fields are dormant semantics and must never be interpreted as runtime actors,
  assets, routes, per-blade records, or persistence records;
- recompute grass-quality metrics from those bound fields and fail closed when
  retained groundcover/wildflower components are smaller than six/three cells,
  candidate patch counts fall below eight each, largest-patch shares exceed
  60%/30%, distinct nonzero density counts fall below 32/16, fewer than 1% of
  groundcovered cells are free of woody density, vegetation/groundcover
  Jaccard overlap exceeds 95%, or the aggregate counts are internally
  impossible;
- include final elevation, the low-frequency terrace delta, each
  glacial/arid/volcanic/coastal elevation delta, and the corresponding process
  masks/classes in that canonical inventory so
  the private physical-process metrics can be independently reproduced; retain
  raw geomorphology climate fields separately from final derived climate, and
  retain process-output elevation so process input is exactly output minus the
  total delta;
- retain the terrace domain-warp A/B output-effect count only in private
  generation evidence; compute its unwarped scratch surface through the same
  weathering, coast-strength, displacement-cap, and edge-relaxation path,
  zeroize that scratch surface after comparison, and never publish it;
- retain final-relief structure-function pair counts, second moments, scale
  growth, and axial-anisotropy metrics only in the private manifest; the
  complete-corridor eligibility mask and moment accumulators are zeroized, and
  public evidence receives only the existing advanced-geomorphology boolean;
- replay the coordinate-free regional hydrogeomorphology report exactly from
  private region, coastal-process, final surface, flow, landform, and biome
  authority; require its conjunction as a private hard gate, retain no cell
  indexes or coordinates in the report, and zeroize component labels, masks,
  queues, bounded-distance visits, and class-presence scratch on success and
  failure;
- bind the single dormant Tier III throne anchor as private atlas geometry and
  private manifest coordinates; expose only its boolean proof publicly;
- fail closed on a stale lock, substitution, permission drift, oversized
  package, unknown file, or digest mismatch.

Private paths are also ignored defensively. Ignore rules are not the security
boundary: a tracked-file scanner independently rejects private magic,
extensions, fields, images, or directories in Git and release surfaces.
Because compressed containers are opaque to exact marker and field inspection,
that scanner also rejects archive extensions and ZIP, GZIP, 7z, RAR, XZ,
Bzip2, Zstandard, or tar magic even after a file is renamed, including a ZIP
appended to a self-extracting prefix. Ordinary runtime media signatures such
as PNG and GLB remain permitted and are scanned normally.

Owned `Buffer` and typed-array copies are overwritten in `finally` blocks when
their lifetime ends, including temporary seed digests and failed atlas
serialization or persistence. Private candidate retirement also clears the
coordinate lookup captured by its indexed grid before clearing canonical field
arrays.

Single-world checkpoints, their owner key, and the seed-free completion receipt
use no-clobber atomic files whose inode and parent directory are both synced
before success is reported. Generation and per-publication locks carry a
validated process identifier: a live owner remains exclusive, while a complete
dead-owner record or strict pre-operation prefix can be retired and synced after
a hard process crash. Pending package stages are grouped by a domain-separated
digest of their exact logical target and protected by the same live lock, so
resume overwrites and unlinks only that target's orphan files. Checkpoint and
stage retirement overwrites the pinned open inode, syncs it, unlinks it, and
syncs each removed parent directory. Every checkpoint lifecycle entry first
inventories and securely finishes any exact owner-only retired UUID directory
left between the durable rename and deletion by a hard crash; malformed,
substituted, or special entries fail closed.

Natural-composition review derives only coordinate-free scalar summaries and
five public proof booleans from final private terrain authority. Temporary land,
saltwater, dry-ground, forest, mountain, vegetation, groundcover, wildflower,
route, site, habitat, distance, component, queue, and raster
buffers are scoped to the measurement and overwritten on both success and
failure. Owner-supplied visual references remain outside the repository and are
used only as review criteria; their files, names, paths, and pixels never enter
a candidate package or sanitized report.

The `three-stylized` review is pinned to
`3275628b85b51b6d611703e8a956a05f43b31645` and its MIT license for provenance.
Its credited MIT upstream is pinned separately to `stylized-components` commit
`b182d81bff64531e584f50d71f046ae05fab3c87`.
It contributes clean-room concepts only. No third-party implementation or
artifact enters the private package, public tree, dependency graph, or runtime;
any later code adaptation requires a separate license and integrity review.

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
  before launching the pinned absolute `tsx` entrypoint. The CLI repeats the
  complete attestation after candidate/package construction and immediately
  before its staged directory may be published; after a successful child exit,
  the bootstrap repeats it once more. Package-manager
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

The versioned pending-owner-report helper is a projection over the canonical
sanitized review, not another sanitizer and not a redaction routine. Its input
has exactly two fields: the already-sanitized review and a literal assertion
that the caller's private-package verification completed. The helper reparses
the review, reconstructs and verifies its source report digest, requires exactly
one eligible in-range candidate with all hard proofs true, and refuses selected
or multi-candidate reviews. Its output is an exact allowlist with pending owner
validation and selection, inactive activation, and production-untouched status.
Accessors, unknown fields, raw arrays, coordinates, seeds, package structures,
paths, and reconstructive material cannot enter through this API.

The assertion is an API precondition, not an independent proof of package
verification. Command integration invokes the helper only after
`verifyPrivateReviewBatch` has successfully rebound the canonical sanitized
aggregate to the regenerated private package. It serializes and reparses the
exact `warpkeep.greater-realm.pending-owner-report.v1` document before the
pinned public-evidence writer installs it at
`docs/evidence/greater-realm/pending-owner-review-v1.json`. No real public owner
report exists or is published until the final verified generation workflow
runs.

## Determinism and integrity

Generation uses named, counter-addressed random channels and canonical cell
ordering. Adding a later random consumer cannot perturb an existing stage.
Stable queues include a complete cell-index tie-break. Thermal and erosion
passes use double buffers rather than scan-order mutation. Persistable fields
use checked integers/fixed point; visual previews may use floating-point
presentation only.

The generator algorithm version and deterministic terrain-seed namespace are
separate authorities. Algorithm/package revisions may change how a rejected
candidate is evaluated without silently rerolling every root-seed ordinal; a
world reroll requires an explicit seed-namespace change. The private manifest
binds both values, and verification re-derives the candidate seed from the
declared namespace. The namespace constant is public source, but its package
binding is owner-only provenance and is not admitted to sanitized candidate
evidence.

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

The intended package contract contains seven private previews: silhouette,
hillshade, biome, hydrology, region-topology/outer-ocean, mountain/gate, and
dressing. The dressing preview may visualize only the private semantic layers;
it neither imports an asset nor proves any runtime or SpacetimeDB behavior.

Owner review is deterministic but is not selection. Only metrics captured from
the regenerated, byte-for-byte verified private candidate package may enter its
review vector. It covers coordinate-free outer-boundary/coastal,
route/playability, chunk-balance, geological/topographic, climate/landform, and
biome axes. Per the owner’s one-world direction, it writes a private, unranked
single-candidate review record containing one opaque handle and
axis/constraint labels—not metric values—after enforcing route redundancy,
4–8-cell barrier width, zero incompatible visual adjacencies, and zero
incompatible biome/landform pairs. The record remains
`selectionStatus: pending`, with no recommendation and no automatic selection.
Recording a choice requires a separate explicit owner approval and private
receipt; PR A does not record one.

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
- archive extensions and renamed opaque archive/container magic from both the
  worktree and exact staged blob, without classifying ordinary PNG/GLB media;
- a private marker encoded as UTF-8, UTF-16LE/BE, or UTF-32LE/BE, including
  when it crosses a streamed scan boundary; unknown/binary surfaces fail closed
  on any exact living-world authority or distinctive relief-metric alias in
  those encodings, while source and documentation keep value-aware rules;
- BOM-marked or BOM-less streamed UTF-16/UTF-32 private text, including trailing
  junk and decoded-text/binary polyglots, plus initialized JSON authority under
  a renamed extension;
- any initialized distinctive private final-relief matrix, vector, or named
  subproof on a text surface, including raw, typed-array, `.from`, Buffer, and
  object-shaped initializers, plus ambiguous eligible-cell scalars in data;
- a markerless single-field living-world authority in JSON, including encoded
  string/object values, or a numeric table/key-value row in CSV, TSV, NDJSON,
  DAT, DATA, TXT, or an unfamiliar text extension, including case-folded names
  and quoted delimiters; this includes both camel- and kebab-case groundcover
  and wildflower density aliases, final-water metadata, and the private domain
  base-thickness/rock-family fields;
- an exact living-world field in source/config initialized from a numeric
  array, numeric typed-array factory, one-level nested Buffer/typed-array
  constructor, inline encoded Buffer/`atob`/typed-array call, or encoded object;
  value-free declarations and size-only typed-array allocation remain
  reviewable source controls outside deploy roots, while local public serving
  fails closed on the authority aliases themselves;
- a markerless extracted geology, final-hydrology, strategic-audit, regional-QA,
  chunk-benchmark, or topography-patch metric, including typed-array,
  `Object.freeze`, Buffer/`atob`, encoded-object, and nested source initializers;
- source/config/seed/package substitution;
- a malformed or wrongly typed seed envelope, including a renamed private seed
  that still carries the private marker;
- chunk, topography-patch, process-field, cell-index, inventory, or toolchain
  substitution;
- dressing-field substitution; biome/landform-incompatible vegetation,
  groundcover, or wildflowers; flowers outside groundcover; either density on
  water or a protected clearance; grass patch, diversity, woody-separation, or
  overlap evidence outside the bound quality limits; an anchor on unsupported
  terrain; a road/ford corridor through forbidden water; or an ambient-life
  potential without its required habitat, route, clearance, or site evidence;
- a changed `tsx` or native dependency tree and package-lock integrity drift,
  before any injected dependency code executes;
- nondeterministic stage output, integer overflow, flow cycles, uphill routing,
  inconsistent generated lake surfaces/spills, or Lowlands catalog drift. A
  generated standing-water failure remains fatal; only a proved valid-to-invalid
  transition caused by projecting the immutable Lowlands overlay is recorded as
  typed candidate-geography exhaustion and retried at the next ordinal.

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
generated asset, imported asset, spawned actor, persistence record, deployment,
or production authority. In particular, no per-blade or per-flower state is
stored in SpacetimeDB; the current Lowlands is untouched.
The CI workflow hardening only copies GitHub-hosted Node into an ephemeral
runner-private executable path before dependency installation and re-attests it
afterward. It does not alter the deployment target, inputs, artifact, domain, or
release authority.
