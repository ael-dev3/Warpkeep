# Warpkeep versioning

Warpkeep uses semantic product versions and a separate immutable build identity.

| Identity | Meaning | Example |
| --- | --- | --- |
| Product release | Player-facing semantic version | `ALPHA 0.3.0` |
| Build | Exact Git commit deployed to the browser | `BUILD abc1234` |
| Realm seed | World-generation identity, not software version | `GENESIS 001` |
| Backend protocol | Internal compatibility integer | `2` (local target; not deployed) |

## Release policy

- **Patch** releases fix defects and make small polish changes without changing the player-facing system boundary.
- **Minor** releases introduce a coherent new player-facing system.
- **Major `1.0.0`** is reserved for the stable core game loop and public release.

Versions use ordinary SemVer core numbers without padding: `0.3.0`, never `0.3.000`. The `0.3.x` patch line may contain fixes, presentation polish, documentation, and operational hardening that do not add a new player-facing system boundary.

The package version is the sole product-version source of truth. The browser receives it through the build-info module rather than duplicating a string in UI components. A production build must include a full Git SHA; the menu presents its seven-character prefix and links to the exact commit. Local builds deliberately say `LOCAL` instead.

Create an annotated `vX.Y.Z` tag and GitHub Release only after the matching merge commit is deployed and its public menu build stamp matches that commit.
