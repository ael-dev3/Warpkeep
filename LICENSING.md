# Warpkeep Licensing

This document is the human-readable source of truth for Warpkeep's release-based licensing policy. It records a forward-looking transition; it does not provide individualized legal advice.

## Current release policy

Warpkeep Alpha `0.3.0` establishes the active forward-looking policy:

- Active software license: Apache-2.0
- Active project-owned creative-content license: CC-BY-4.0
- Third-party, externally governed, generated, or uncertain-provenance material keeps its own applicable terms and is not relicensed by this policy.

## Historical releases

The historical boundary is:

```text
v0.2.0 and earlier = legacy 0BSD + CC0-1.0 policy
v0.3.0 and later   = Apache-2.0 + CC-BY-4.0 policy for new or modified Warpkeep work
```

Historical `0BSD` and `CC0-1.0` grants are not revoked. A person may obtain and reuse an older version under the terms that applied to that version. Moving an old file into a later release does not cancel the permission already granted for the historical snapshot.

## Policy beginning with v0.3.0

Beginning with the first `v0.3.0` development/release commit:

- New or modified Warpkeep software is intended to be licensed under `Apache-2.0`.
- New or modified project-owned documentation, lore, images, audio, video, models, reference material, manifests, and other creative material is intended to be licensed under `CC-BY-4.0`.
- Third-party or externally governed material remains under its original terms.
- The Warpkeep name, logos, official domain, official accounts, and canonical deployment identity are not granted by either software or creative-content licenses.

Apache-2.0 remains permissive, commercially reusable, forkable, and mod-friendly, and includes an express contributor patent grant. CC-BY-4.0 permits commercial sharing and adaptation with reasonable attribution, a license link, and an indication of changes.

## Release matrix

| Repository material | Through v0.2.0 | Beginning v0.3.0 |
| --- | --- | --- |
| Software source, scripts, tests, configuration, workflows | `0BSD` | `Apache-2.0` for new or modified versions |
| Generated Warpkeep bindings and generated project output | `0BSD` where covered by the historical software policy; generator/upstream terms remain separate | `Apache-2.0` only when Warpkeep has the right to license the generated output |
| Project-owned documentation and lore | `CC0-1.0` | `CC-BY-4.0` for new or modified versions |
| Project-owned images, audio, video, models, and manifests | `CC0-1.0` where ownership and authority are confirmed | `CC-BY-4.0` for new or modified versions where ownership and authority are confirmed |
| Third-party or externally governed files | Original terms | Original terms |
| Warpkeep name, logos, official domains, and canonical deployment identity | Not granted | Not granted |

## Path and material classification

- `src/**`, `scripts/**`, `tests/**`, `.github/**`, root configuration, and project-authored service/module source are software. Dependencies and upstream generated tooling are separate.
- Root and `docs/**` Markdown, lore, and project-authored manifests are creative/documentary material only to the extent Warpkeep contributors have the right to license them.
- `src/spacetime/module_bindings/**` is generated output. Its headers identify SpacetimeDB generation; its future treatment depends on the rights in the Warpkeep module schema and upstream generator terms.
- `public/**` and `docs/reference/**` are not automatically project-owned merely because they are present in the repository. The detailed classification and exceptions are in [`ASSETS-LICENSE.md`](ASSETS-LICENSE.md) and [`docs/legal/license-inventory.md`](docs/legal/license-inventory.md).
- Package manifests and lockfiles describe software and dependencies. They do not relicense npm, pnpm, SpacetimeDB, Three.js, Farcaster, Cloudflare, or any other upstream dependency.

## Historical grants remain valid

Historical 0BSD and CC0 grants are not revoked. This transition applies to future versions and to new or modified work beginning with v0.3.0; it does not rewrite the license of an older distributed snapshot or claim that a later path move changes an earlier grant.

The cutover uses two commits. Commit A replaces the active software license, updates every package manifest, adds the active CC-BY-4.0 text and path metadata, and preserves the historical license texts under unambiguous legacy paths. Commit B then records Commit A's full SHA in `docs/legal/v0.3.0-cutover.json`. The verifier checks Commit A from Git history and rechecks the same invariants at current `HEAD`; it never trusts a SHA-like string in prose.

This protocol applies to every complete SemVer value on the v0.3 line or later. A valid `0.3.0` prerelease or build form is treated as part of the cutover line so a prerelease cannot bypass the new policy. Commit A and Commit B are created on the intended final base and must be merged without squash, rebase, amend, cherry-pick, or any other SHA-rewriting operation after the attestation is written.

## Third-party and uncertain provenance

Do not infer ownership from repository presence, filename, generation tool, or the fact that Ael supplied an attachment. Third-party libraries, fonts, models, audio, video, images, reference material, and generated output retain their original terms unless the provenance record establishes Warpkeep's licensing authority.

Where authority or original terms are incomplete, the repository preserves the file-specific notice and classifies the item as externally governed or unresolved. It is not assigned Apache-2.0 or CC-BY-4.0 by assumption.

## Contributions

Contributors must have the right to submit their work. Contributions included in a release follow that release's policy for their material category. From v0.3.0, Warpkeep code contributions are intended to be Apache-2.0 and project-owned creative contributions are intended to be CC-BY-4.0. Contributors retain their copyright; no copyright assignment or heavyweight CLA is required. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Trademarks and official project identity

The open-source and Creative Commons licenses do not grant trademark rights or permission to imply official status. See [`TRADEMARKS.md`](TRADEMARKS.md) for the community-friendly naming and branding policy.

## Where to find exact license texts

- Active software text: [`LICENSE`](LICENSE) (`Apache-2.0`).
- Active creative-content text: [`LICENSE-CC-BY-4.0`](LICENSE-CC-BY-4.0) (`CC-BY-4.0`).
- Historical software text: [`licenses/legacy/LICENSE-0BSD-v0.2.0`](licenses/legacy/LICENSE-0BSD-v0.2.0) (`0BSD`).
- Historical creative-content text: [`licenses/legacy/LICENSE-CC0-1.0-v0.2.0`](licenses/legacy/LICENSE-CC0-1.0-v0.2.0) (`CC0-1.0`).
- Cutover protocol: [`docs/legal/v0.3.0-license-cutover.md`](docs/legal/v0.3.0-license-cutover.md).
- SPDX identifiers: `0BSD`, `CC0-1.0`, `Apache-2.0`, and `CC-BY-4.0`.

Canonical legal texts must be copied unmodified from their official sources during the v0.3.0 cutover. No custom license, copyleft, noncommercial, field-of-use, AI-use, blockchain, token, or source-available restriction is introduced by this policy.
