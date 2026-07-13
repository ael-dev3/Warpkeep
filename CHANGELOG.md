# Changelog

All notable Warpkeep player-facing releases are recorded here. The product uses semantic versioning; the exact deployed source is always identified by its build SHA.

## [Unreleased]

No unreleased player-facing changes.

## [0.3.1] — 2026-07-13

### Added

- An accessible, unchecked **ALPHA PARTICIPATION TERMS** gate before every
  authentication attempt, with one-shot in-memory acceptance and no identity or
  persistent acceptance record.
- S256 browser binding for Farcaster proof exchange, rotating HttpOnly session
  families, explicit remember-device opt-in, and server-side logout/revocation.
- Tokenless pending-admission sessions, positive admission epochs, a dedicated
  resolver authority, and private player-ownership mapping.

### Changed

- Anonymous mount, focus, visibility, pageshow, and direct `#realm` navigation
  no longer restore cookie authority or begin authentication. Direct realm URLs
  normalize to the menu until a fresh, accepted entry attempt succeeds.
- Retry, pending-admission checks, authenticated entry, cancellation, failure,
  expiry, browser Back, and unmount now consume or clear the current acceptance.

### Security and operations

- Added exact runtime/configuration attestation, defensive transport and response
  headers, least-privilege protocol-v2 claims, privacy-safe logging, and
  fail-closed browser/Worker/SpacetimeDB compatibility checks.
- Kept public authentication disabled by default. The schema, Durable Object,
  managed-secret, Worker, Pages, and public-enable stages remain separate owner
  approval gates; this source release alone changes no production user or world
  data.

See [Alpha 0.3.1 release notes](docs/releases/alpha-0.3.1.md).

## [0.3.0] — 2026-07-13

### Added

- Real Meshopt-compressed WARPKEEP stone-title assemblies with exact runtime integrity checks and a procedural fallback.
- One persisted graphics setting shared by the title and realm: Auto, Cinematic, Balanced, and Performance.
- A 2.06 MB balanced Hegemony keep tier that preserves the mobile silhouette and material boundaries.
- Public-safe engineering lessons plus workstation, service, asset, deployment, incident, and credential-recovery documentation.
- Explicit title-asset fetch/cache/offline preparation and CI checks for runtime hashes and oversized non-runtime files.

### Changed

- Normal phones now use the balanced profile; manual settings safely recreate renderers while preserving the selected realm cell.
- Realm fog sits farther from the camera, while restrained ACES exposure and warm/cool lighting improve keep contrast.
- Credits use a viewport-centered track independent of their vertical animation and include the stone-title attribution.
- The README and project voice now describe a live, persistent frontier rather than an outdated local scaffold.
- Large reference-only source binaries left the active repository tree. Unresolved-rights families were restricted rather than uploaded publicly.

### Removed

- The local-save-style **CONTINUE** menu command and its stale notices/tests.

### Fixed

- Corrected the deployed Workerd auth-epoch resolver's accidental method receiver binding by invoking the stored runtime `fetch` through a receiverless local binding.
- Added privacy-safe failure stages and a server-only synthetic resolver probe so deployed failures can be diagnosed without returning identity, token, epoch, URL, or upstream-body data.
- Preserved selected realm cells and disposed/recreated exactly one scene when graphics quality changes.

### Security and operations

- Preserved the fail-closed SIWF → Worker OIDC → SpacetimeDB admission boundary and the empty production admission state.
- Completed the history-preserving Apache-2.0/CC-BY-4.0 two-commit cutover while retaining the v0.2.0 0BSD/CC0 texts.
- Archived the authorized title sources and assemblies in the public Warpkeep-Assets release `title-stone-letters-2026-07-12` with verified download hashes.

## [0.2.0] — Alpha candidate

### Added

- The cinematic title, Hegemony menu, Lowlands presentation, first keep, soundtrack, and Credits flow.
- Farcaster SIWF with mobile deep-link support and an intentionally limited remembered-device alpha session.
- A secure closed-alpha path: Farcaster proof verification, an ES256 OIDC bridge, private admission records, generated SpacetimeDB bindings, and safe Hermes administration.
- A 61-cell Genesis 001 authority model ready for an empty-whitelist rejection test.

### Changed

- `warpkeep.com` is the canonical production target; legacy GitHub Pages path builds remain available for compatibility checks.
- The main menu reports the release channel, version, and exact deployed build SHA.

### Security

- Shared-alpha browser activity is disabled unless explicit, valid public configuration enables it.
- Credential-bearing bridge routes use distributed exact rolling-window limits, and disabled-to-enabled admissions rotate the authorization epoch before old player tokens can regain authority.
- No player, castle, or real Farcaster FID is created or admitted by this release candidate.

[Unreleased]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ael-dev3/Warpkeep/compare/d5f0748dbfff07064a736c2b8d273d6022a03050...v0.3.0
[0.2.0]: https://github.com/ael-dev3/Warpkeep/compare/f50a277044b8abe23df9fe8aae25dd82b49635b6...d5f0748dbfff07064a736c2b8d273d6022a03050
