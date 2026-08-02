# Genesis 001 founder-realm Mini App embed

On 2 August 2026, the Warpkeep project owner supplied the source image in this
directory and instructed that it replace Warpkeep's Mini App feed embed. That
instruction authorizes repository and official Mini App use; it does not
independently establish copyright ownership or grant a general open-content
license.

The source is a 1536×1024 opaque RGB PNG, 3,504,459 bytes, with SHA-256
`1cef5f67aa17a4fa812518c8c376a5f57a1c4c6509c0788e332ab97568a4a783`.
`scripts/prepare-farcaster-miniapp-assets.mjs` verifies that exact input and
resizes its existing 3:2 frame to a 1200×800 opaque PNG with Lanczos3. The
runtime derivative is 2,163,184 bytes with SHA-256
`a07da89d7df56da96ce220043f5355b0bbe383cd9d8ff80e9547736b44fd560e`.
Its content-addressed filename prevents stale Mini App and social-preview
caches from presenting the superseded image.

The same reviewed source now supplies the Mini App directory hero and Open
Graph card. The deterministic preparation first resizes the 3:2 source to
1200×800, then extracts the 1200×630 region beginning 30 pixels below the top.
That framing retains all seven authored player labels while filling the
required wide card. The opaque derivative is 1,727,085 bytes with SHA-256
`d800619debbded6fff22b011160e9eecbeb02da1781ed8e4aecd6138de2f5de7`.
Its content-addressed filename is
`warpkeep-realm-card-1200x630-d800619debbded6f.png`.

This is promotional artwork rather than an exact gameplay screenshot. It
contains seven deliberately visible public Farcaster handles as authored
labels. It contains no FID, profile image, QR payload, authentication proof,
token, credential, private log, or private Realm record. The source and both
derivatives remain `LicenseRef-Warpkeep-Provenance-Required`; see
[`../../../../ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md).
