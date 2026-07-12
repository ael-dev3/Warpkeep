# Changelog

All notable Warpkeep player-facing releases are recorded here. The product uses semantic versioning; the exact deployed source is always identified by its build SHA.

## [Unreleased]

- The closed-alpha server chain is live from activation head `83bc36c` and Worker source `63336dd`: discovery/JWKS, distributed rate control, the private Worker-to-Maincloud auth-epoch procedure, and the non-destructively published module passed their remote gates. Maincloud holds exactly 61 world cells with an empty allowlist and zero players or castles; owner denial QA remains pending.
- The stacked activation code adds distributed authentication rate control,
  explicit re-enable epoch rotation, post-upstream challenge-expiry checks, and
  bounded activation tooling. The additional assurance fixes on this branch are
  not represented as deployed until their exact consolidated head is deployed
  and the protected production verifier passes again.

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

[Unreleased]: https://github.com/ael-dev3/Warpkeep/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ael-dev3/Warpkeep/compare/f50a277...v0.2.0
