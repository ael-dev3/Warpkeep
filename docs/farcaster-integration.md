# Farcaster Integration Plan

Farcaster sign-in is the primary identity path for Warpkeep.

## Identity rule

Each FID gets one castle. Handles are display names and may change. FID is the stable key for castle ownership.

## Initial path

The current seed uses `src/farcaster/farcasterAuth.ts` as a placeholder session. Replace it with Sign In With Farcaster before production multiplayer.

## Future social graph mechanics

Farcaster can later influence:

- nearby castles
- regions
- alliance invitations
- diplomacy
- public battle reports
- social recruitment
- shared season recaps
- channel-based realm events

## Cast-native surfaces

Casts can later become:

- recruitment posts
- war declarations
- alliance propaganda
- season recaps
- shareable castle cards
- scout report teasers

## Token/currency note

Warpkeep may later explore optional Streme token or other Farcaster-native token integrations for cosmetics, season passes, alliance sponsorships, or optional sinks. The core game should not depend on token price, should avoid pay-to-win, and should avoid financialized mechanics in the initial seed.
