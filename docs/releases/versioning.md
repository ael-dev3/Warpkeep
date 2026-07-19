# Versioning and releases

Warpkeep uses semantic versions for the product and Git commit SHAs for builds.
The current Alpha is `0.3.13`.

## Version numbers

- Patch releases (`0.3.x`) may fix defects, improve presentation, harden
  operations, or add a backward-compatible Alpha feature.
- A minor release represents a broader player-facing milestone or compatibility
  change.
- `1.0.0` is reserved for a stable core game loop and public release.

The version in `package.json` is displayed by the client. The deployed commit
SHA identifies the corresponding browser build. World generation, auth contract,
and backend protocol versions are separate compatibility values.

## Release process

1. Merge a reviewed change to `main` after required checks pass.
2. Deploy the intended service or client from that commit. A frontend merge does
   not authorize a Worker or database publication.
3. Confirm the public build reports the intended commit.
4. Create a `vX.Y.Z` tag and GitHub Release.
5. Summarize player-facing changes in [`CHANGELOG.md`](../../CHANGELOG.md).

Draft branches and pull requests describe work in progress. They are not part
of the live Alpha until they are merged and deliberately deployed.
