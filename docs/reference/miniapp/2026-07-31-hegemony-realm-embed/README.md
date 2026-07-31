# Hegemony realm Mini App embed

On 31 July 2026, the Warpkeep project owner supplied the source image in this
directory and instructed that it be used for Warpkeep's Mini App feed embed.
That instruction authorizes this repository and official Mini App use; it does
not independently establish copyright ownership or grant a general
open-content license.

The source is a 1402×1122 opaque RGB PNG, 2,008,823 bytes, with SHA-256
`26378fdcdb9dfccfdbcf5f25f9a70df1238ac494ab7ed89762ab06b6e2c46771`.
`scripts/prepare-farcaster-miniapp-assets.mjs` verifies that exact input,
center-crops it to the required 3:2 frame, and produces the 1200×800 opaque
runtime image with Lanczos3 resizing. The runtime derivative is 1,146,834
bytes with SHA-256
`53071821f4a2cd1bd6d71cd53f02e78331582a9fef88c9931833b459e25d5596`.

The artwork contains no profile image, FID, wallet address, QR payload,
authentication proof, token, credential, private log, or player state. The
source and derivative remain `LicenseRef-Warpkeep-Provenance-Required`; see
[`../../../../ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md).
