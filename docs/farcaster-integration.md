# Farcaster Integration

Warpkeep uses standard website Sign In with Farcaster (SIWF) as its prototype identity path. This milestone is not a Farcaster Mini App and does not use Mini App context, Quick Auth, a wallet connector, or a stock AuthKit modal.

## Player flow

Authentication starts only after the player reaches the live Hegemony menu and explicitly selects `ENTER REALM`:

```text
Title screen
→ galaxy gateway
→ Hegemony main menu
→ ENTER REALM
→ Farcaster QR/deep link
→ verified FID and profile
→ authenticated Hegemony confirmation
→ current prototype realm-entry callback
```

The title screen and passive menu load do not create a relay channel or display a QR code. Continue, Settings, Credits, and Exit remain development-notice actions. On mobile web, the same relay-returned channel URL is also exposed as **Open in Farcaster**, so the player does not need to scan their own screen.

## Realm route gate

`#realm` is a convenience route, never a credential. An anonymous direct load, refresh, Back, or Forward navigation to `#realm` follows this sequence:

```text
#realm
→ replace the visible route with #menu
→ keep `realm` only as an in-memory pending destination
→ open the native right-side Farcaster authentication rail
→ create one fresh on-demand relay channel
→ show verified identity confirmation
→ let the player choose ENTER REALM
```

The pending destination remains through creation, waiting, verification, expiry/error, retry, and the verified confirmation. It is cleared if the player cancels or goes back to the title, signs out, or actually enters the realm. An ordinary direct `#menu` remains passive and does not create a channel. An already authenticated session may still use `#realm` during the same mounted app session. Because the session is memory-only, refresh always starts anonymous and therefore takes the gate again.

## Implementation

The low-level implementation uses:

- `@farcaster/auth-client` `0.7.1` (package range `^0.7.1`);
- `viem` `2.55.0` (package range `^2.55.0`);
- `qrcode` `1.5.4` (package range `^1.5.4`);
- `@types/qrcode` `1.5.6` for development.

The official app client is created once, on demand:

```ts
createAppClient({
  relay: 'https://relay.farcaster.xyz',
  ethereum: viemConnector({
    rpcUrl: 'https://mainnet.optimism.io'
  })
});
```

Both services are public endpoints. Warpkeep does not require or embed an API key, wallet private key, or arbitrary RPC-service secret.

The implemented relay flow is:

1. Generate a cryptographically secure request ID and 24-byte nonce with Web Crypto.
2. Set an absolute five-minute expiration.
3. Call `createChannel` with the canonical domain/SIWF URI and `acceptAuthAddress: true`.
4. Encode only the relay-returned channel URL as a high-contrast SVG QR code.
5. Keep the standalone channel token in the private controller and use it with `status` polling.
6. Require a completed status containing the nonce, SIWF message, signature, and finite positive FID.
7. Call `verifySignInMessage` with the expected nonce/domain and `acceptAuthAddress: true`.
8. Accept the browser session only when verification succeeds and its FID exactly matches the completed relay FID.

`acceptAuthAddress: true` permits an approved Farcaster auth address as well as the custody address. This is signature authentication only; Warpkeep does not connect a wallet, request a transaction, or infer token/NFT ownership.

The live relay currently returns `url` as an official `https://farcaster.xyz/~/siwf` universal link with an opaque short channel token, and also includes a legacy `connectUri` field that is not declared by `@farcaster/auth-client` 0.7.1. Warpkeep deliberately encodes the documented `url` field, validates its exact official host/path and token binding, and keeps compatibility with the package's earlier `farcaster://connect` URL shape. It does not depend on or expose the undeclared `connectUri` field.

The QR is rendered as a dark-on-ivory SVG with a four-module quiet zone and no logo or animation. The custom auth presentation, official SDK/verification transitives, and QR encoder are deferred from the explicit `ENTER REALM` path. A small provider/client wrapper remains in the startup bundle, but the title screen and ordinary menu do not pay the full auth/UI stack cost.

## Domain and canonical SIWF URI

The domain is derived from `window.location.host`, including a localhost port. The URI is derived from the current origin plus Vite's `BASE_URL`; it never uses `location.href` and therefore does not include `#menu`, `#realm`, or a query string.

Expected values:

| Environment | Domain | SIWF URI |
| --- | --- | --- |
| Local Vite default | `localhost:5173` | `http://localhost:5173/` |
| GitHub Pages build | `ael-dev3.github.io` | `https://ael-dev3.github.io/Warpkeep/` |

If Vite selects a different local port, both local values use that actual port. A direct `#menu` load and normal title-to-menu navigation produce the same canonical SIWF URI. Build the Pages variant with `GITHUB_PAGES=true npm run build` so Vite uses `/Warpkeep/` as its base.

## Identity rule

The verified FID is Warpkeep's stable identity key. Username, display name, profile image, custody address, verification-address list, and reported authentication method are profile/display metadata. They can change and must never be used as keep ownership keys.

The public authenticated view contains only the verified identity fields needed by the UI. It does not authenticate from a relay profile, query-string FID, manually entered FID, browser-storage FID, or any development fixture.

## Polling and cancellation

The controller uses a cancellable, generation-tagged polling loop rather than a permanent render loop:

- pending requests poll at approximately 1.5-second intervals;
- only one status request and one timer may be active;
- polling pauses while the document is hidden and resumes immediately when visible;
- the absolute five-minute deadline is checked independently of browser timer throttling;
- leaving the panel/menu, returning to title, generating a replacement QR, signing out, or unmounting cancels the active generation;
- responses from cancelled or superseded generations are ignored;
- duplicate `ENTER REALM` activation cannot create racing channels.

The visibility behavior is especially important on mobile: opening Farcaster hides the browser page, and returning to the browser resumes status checking without starting another channel.

## Session and proof handling

The authenticated session is intentionally in memory. It survives closing the confirmation and normal title/menu/realm transitions while the React app remains mounted. A full refresh, closed tab, or new browser session requires another sign-in. Warpkeep does not implement “remember me” and does not restore an authenticated session from `localStorage` or `sessionStorage`.

Private request/proof material is separated from the React view state:

- the standalone `channelToken` used for status polling is kept only by the active controller;
- outside the relay-returned QR/deep-link URL, the nonce is not separately rendered, and it is never copied into Warpkeep's page URL or history;
- the raw SIWF message and signature are never persisted or placed in Warpkeep's page URL/history;
- raw completed proof is held only long enough to call `verifySignInMessage`;
- success copies an allowlisted verified identity into session state, then releases the channel/proof references;
- cancel, expiry, error, retry, and unmount invalidate the active generation, clear controller references/timers, and ignore late results; because the SDK exposes no abort signal, local material in an already in-flight call remains until that call settles;
- human-readable errors use stable categories and do not interpolate relay payloads.

The relay-returned channel URL is necessarily present while awaiting approval because it is the QR/deep-link payload. Treat an active QR as ephemeral: do not publish or archive it. The standalone status token and raw proof are not separately rendered, logged, persisted, or exposed through public component props.

Sign out clears only Warpkeep's in-memory identity and active request. It does not attempt to sign the player out of the Farcaster app.

## Security boundary

The official client verifies the SIWF signature/signer against the expected domain and nonce, including approved auth-address signers, and returns the signed FID/auth method. Warpkeep then binds the verified message to the expected URI, request ID, expiration, Optimism chain, and FID resource; rechecks the local deadline; and requires the relay FID to match the cryptographically verified FID. That is sufficient for demonstrating the QR flow, displaying a verified FID/profile, and gating prototype UI in this static GitHub Pages deployment.

It is not server authority. A player controls the browser and can modify JavaScript memory or client-side game state. The current session must not authorize:

- permanent keep ownership;
- resources, upgrades, queues, or units;
- combat, rankings, rewards, or seasonal results;
- multiplayer state or SpacetimeDB writes.

The site currently defines no Content Security Policy. No CSP was broadly added or weakened for this milestone. If a CSP is introduced later, its `connect-src` policy must narrowly account for the Farcaster relay and public Optimism RPC (`https://relay.farcaster.xyz` and `https://mainnet.optimism.io`) alongside any existing same-origin requirements. Remote profile images need an intentional `img-src` policy as well.

## Trusted production migration

Permanent game authority requires a trusted service boundary:

```text
browser obtains completed SIWF message/signature
→ browser sends proof to a trusted Warpkeep backend
→ backend validates domain, URI, nonce, signature, expiration, auth method, and FID
→ backend consumes the nonce once and maps the verified FID to one account/keep
→ backend issues a Secure HttpOnly SameSite session cookie
→ backend authorizes SpacetimeDB reads/writes for that verified FID
```

The backend should enforce nonce replay protection, short proof lifetimes, cookie rotation/revocation, CSRF protections appropriate to the chosen SameSite policy, and server-side authorization for every game-critical mutation. GitHub Pages cannot issue a trustworthy HttpOnly session cookie by itself; do not emulate one with browser storage.

## Testing

Automated checks use injected fake clients and never contact the live Farcaster relay:

```bash
npm install
npm test
npm run typecheck
npm run build
GITHUB_PAGES=true npm run build
npm audit
git diff --check
```

The test suite covers runtime context construction, secure request material, relay-response validation, signature/FID binding, proof-free state transitions, stale generations, cancellation, QR presentation, and accessibility. Polling/provider integration tests should use fake timers and deferred promises rather than real network calls.

For noninteractive real relay QA, verify that a freshly created relay channel reaches the pending state, then cancel it without publishing its QR or URL. Do not make a live account approval a prerequisite for deployment.

After deployment, a player can perform this remote manual check on their own schedule:

1. Open `https://ael-dev3.github.io/Warpkeep/#menu`; confirm no QR or relay request appears before selecting **ENTER REALM**.
2. Select **ENTER REALM**; confirm a fresh QR/deep link appears, then scan or select **Open in Farcaster** on mobile.
3. Approve in Farcaster and confirm the displayed FID is the approving account before selecting the confirmation's **ENTER REALM**.
4. Open `https://ael-dev3.github.io/Warpkeep/#realm` anonymously (or refresh while there); confirm it becomes `#menu`, opens the same rail, and does not mount Hegemony Lowlands until approval.
5. Verify cancellation, retry, sign out, browser Back/Forward, and the full five-minute timeout. On mobile, return from Farcaster and confirm polling resumes.
6. Test custody and approved auth-address flows when suitable accounts are available. The deployed signed URI must be `https://ael-dev3.github.io/Warpkeep/`.

Do not enable raw-response logging for QA. Do not share a live QR screenshot, console/network dump, or exported HAR; these can retain active channel data or proof material. Record only sanitized phase/result information. Real QR approval, mobile deep linking, custody/auth-address coverage, browser compatibility, and deployment verification require a user-controlled Farcaster account and device.

## Explicit non-goals

This milestone does not add:

- Farcaster Mini Apps, Mini App SDK/context, manifests, or frames;
- Quick Auth;
- wallet connection, WalletConnect, RainbowKit, or transaction signing;
- OAuth providers other than SIWF;
- social-graph, cast, follow, or channel-membership queries;
- a backend, persistent cookie, SpacetimeDB integration, or permanent keep claim.

Farcaster social graph and cast-native mechanics can later influence nearby castles, alliances, diplomacy, recruitment, battle reports, and season recaps, but they are separate milestones and must not become authentication inputs.

## Official references

- [Farcaster Auth client introduction](https://docs.farcaster.xyz/auth-kit/client/introduction)
- [Create a channel](https://docs.farcaster.xyz/auth-kit/client/app/create-channel)
- [Read channel status](https://docs.farcaster.xyz/auth-kit/client/app/status)
- [Verify a sign-in message](https://docs.farcaster.xyz/auth-kit/client/app/verify-sign-in-message)
