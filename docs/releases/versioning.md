# Warpkeep versioning

Warpkeep uses semantic product versions and a separate immutable build identity.

| Identity | Meaning | Example |
| --- | --- | --- |
| Checked-in product version | Player-facing semantic version in source; may still be a candidate | `ALPHA 0.3.7` (candidate) |
| Verified public release | Exact version currently released to players | `ALPHA 0.3.6` |
| Build | Exact Git commit deployed to the browser | `BUILD abc1234` |
| Realm seed | World-generation identity, not software version | `GENESIS 001` |
| Authentication contract | Browser/Worker compatibility integer | `2` |
| Backend protocol | Server/browser compatibility integer | `3` (active admission-gated boundary) |

## Release policy

- **Patch** releases are backward-compatible increments within the active
  pre-1.0 Alpha line. They may fix defects, polish presentation, harden
  operations, or add one bounded gameplay loop without breaking the existing
  authentication, backend-protocol, or realm-seed boundary.
- **Minor** releases advance the planned Alpha milestone and may introduce a
  broader coherent player-facing system or compatibility boundary.
- **Major `1.0.0`** is reserved for the stable core game loop and public release.

Versions use ordinary SemVer core numbers without padding: `0.3.0`, never
`0.3.000`. During pre-1.0 development, the `0.3.x` line represents one Alpha
milestone rather than a promise that every patch is maintenance-only. Any
bounded feature added within that line must remain additive and compatible with
the published boundary, be named explicitly in release notes, and stay a
candidate until its separate migration and deployment gates pass.

The package version is the sole product-version source of truth. The browser receives it through the build-info module rather than duplicating a string in UI components. A production build must include a full Git SHA; the menu presents its seven-character prefix and links to the exact commit. Local builds deliberately say `LOCAL` instead.

The checked-in package identifies the undeployed Alpha 0.3.7 candidate. Alpha
0.3.6 remains the verified public release until the complete 0.3.7 release
matrix, protected-main publication, separately approved additive module and
founder migration, exact Pages deployment, and post-deploy build checks pass.
The exact public commit is identified by the menu build stamp. Product version,
authentication contract, backend protocol, realm seed, and build SHA are
independent coordinates; changing one does not silently change another.

Create an annotated `vX.Y.Z` tag and GitHub Release only after the matching
merge commit is deployed and its public menu build stamp matches that commit.
Until those gates pass for a future version, changelog, release-note, README,
and in-menu language must say **candidate** and continue to name the previous
exact version as the verified public release.
