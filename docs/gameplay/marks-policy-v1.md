# Community Marks policy

Status: **Current Alpha policy**

Policy ID: `admitted-daily-mark-v1`

Last reviewed: 31 July 2026

Marks are Warpkeep's experimental Hegemony game-accounting unit. They are not
a token, payment instrument, investment, transferable asset, or promise of a
future benefit. Marks have no cash value, cannot be redeemed or transferred,
and may be corrected, changed, or reset while the Alpha is experimental.

## Daily grant

Each admitted player receives one Mark for each eligible daily grant processed
by the Realm. One Mark is stored as exactly `1,000,000` integer micro-units;
floating-point arithmetic is never accounting authority.

Eligibility is derived by SpacetimeDB from server-owned admission and founding
state. A browser cannot choose the recipient, amount, time, or policy. Disabled
or revoked admission retains the existing balance but is not eligible for new
daily grants. Re-entry does not create rewards for days spent outside the
admitted Realm.

Every grant is recorded and applied with replay protection. The private Mark
account and any enabled public community projection are updated together. A
retry for the same player and Realm day cannot issue a second Mark.

The Realm attempts the daily grant every hour so a temporary interruption can
recover within the same UTC day. It does not guess historical eligibility: if
the authority is unavailable for an entire UTC day, that day's grant is not
created later. This avoids crediting periods when admission may have been
revoked while the Realm was unavailable.

## Visibility and privacy

The authoritative Mark account and daily-grant receipts are private
SpacetimeDB state. After a player's intentional Alpha entry, a public Realm
profile may show the aggregate Mark balance. It does not expose private
ownership, admission, authentication, or receipt records.

Warpkeep does not scan a wallet or blockchain, request a transaction, or
connect Marks to token activity. Marks remain separate from Food, Wood, Stone,
and Gold and currently have no transfer, redemption, purchase, or financial
reward loop.

## Corrections and rollout

A malformed account, duplicate grant key, invalid schedule, or inconsistent
projection fails closed. Corrections require a reviewed additive authority
path and explicit production approval; they are not performed by browser code.
Module publication, activation, and any existing-account migration remain
separate operational steps.
