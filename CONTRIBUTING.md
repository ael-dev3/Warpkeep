# Contributing to Warpkeep

Thank you for helping build Warpkeep in the open. Contributions should keep the project commercially reusable, forkable, mod-friendly, and clear about provenance.

## Before submitting

- Only submit work you have the right to contribute.
- Do not submit secrets, private keys, personal data, live Farcaster proofs, QR payloads, channel tokens, or private authentication material.
- Do not copy third-party code, fonts, models, audio, video, images, or references without compatible terms and a provenance record.
- Generated or AI-assisted work must be reviewed by the contributor and must not knowingly include incompatible third-party material. AI assistance does not automatically determine copyright status or licensing.

## Licensing of contributions

Contributions included in a release follow the licensing policy for that release and material category:

- Through v0.2.0, Warpkeep software follows the historical `0BSD` policy and confirmed project-owned creative material follows the historical `CC0-1.0` policy.
- Beginning with v0.3.0, new or modified Warpkeep code, scripts, tests, configuration, and workflows are intended to be `Apache-2.0`.
- Beginning with v0.3.0, new or modified confirmed project-owned documentation, lore, images, audio, video, models, reference material, and manifests are intended to be `CC-BY-4.0`.
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
