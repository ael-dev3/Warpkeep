# Contributing to Warpkeep

Thank you for helping build Warpkeep in the open. Contributions should keep the project commercially reusable, forkable, mod-friendly, and clear about provenance.

## Before submitting

- Only submit work you have the right to contribute.
- Do not submit secrets, private keys, personal data, live Farcaster proofs, QR payloads, channel tokens, or private authentication material.
- Do not copy third-party code, fonts, models, audio, video, images, or references without compatible terms and a provenance record.
- Generated or AI-assisted work must be reviewed by the contributor and must not knowingly include incompatible third-party material. AI assistance does not automatically determine copyright status or licensing.

## Realm Council intake

Use the [Warpkeep Farcaster channel](https://farcaster.xyz/~/channel/warpkeep)
for open conversation, early ideas, and community stories. Use the
[Realm Council issue forms](https://github.com/ael-dev3/Warpkeep/issues/new/choose)
for a durable public bug report or realm wish that contributors can triage.

Keep every public report privacy-safe. Describe only public product behavior or
a reproduction using synthetic/local data. Do not attach private logs or
screenshots, and never include tokens, proofs, QR payloads, wallet/account
identifiers, personal data, or credentialed URLs. Security-sensitive behavior
does not belong in Realm Council intake; follow [SECURITY.md](SECURITY.md) and
wait for a private reporting channel.

## Licensing of contributions

Contributions included in a release follow the licensing policy for that release and material category:

- Through v0.2.0, Warpkeep software follows the historical `0BSD` policy and confirmed project-owned creative material follows the historical `CC0-1.0` policy.
- Active software license: Apache-2.0
- Active project-owned creative-content license: CC-BY-4.0
- Beginning with v0.3.0, those policies apply to new or modified Warpkeep work in their respective categories.
- Third-party, externally governed, generated, and uncertain-provenance material keeps its original terms unless the project has documented the right to license it.

Contributors retain their copyright. No copyright assignment is required, and Warpkeep does not use a heavyweight CLA. By submitting a contribution for inclusion, you confirm that you have the right to submit it and agree that it may be distributed under the applicable release policy.

See [`LICENSING.md`](LICENSING.md), [`ASSETS-LICENSE.md`](ASSETS-LICENSE.md), and [`TRADEMARKS.md`](TRADEMARKS.md) for the full policy and provenance boundary.

## Development checks

From the repository root:

```sh
npm ci
npm run verify:licenses
npm test
npm run typecheck
npm run build
```

When changing the auth bridge or SpacetimeDB module, also run the project-specific checks documented in their READMEs and in the CI workflow.

## Pull requests

Keep pull requests focused. Explain the user-facing or infrastructure purpose, identify generated files, include provenance for external material, and call out any security-sensitive behavior. Do not include raw authentication responses, live QR screenshots, tokens, private keys, or exported HAR/network files.
