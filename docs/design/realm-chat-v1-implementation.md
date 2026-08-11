# Realm Chat V1 implementation

Status: **review-only; client, server activation, and production publication disabled**

Policy version: `2026-08-03-realm-chat-policy-v1`

Realm channel: `realm:genesis-001`

This document records the product research, technical design, security model,
and release boundary for Warpkeep's first persistent in-game chat. The legal
and product contract remains the controlling source for whether the feature may
ever be activated: [Realm Chat V1 contract](realm-chat-v1-contract.md).

## Research translated into Warpkeep

The implementation follows recurring patterns from established live games,
while avoiding features that would create false expectations in an early Alpha.

| Established pattern | Warpkeep V1 decision |
| --- | --- |
| Final Fantasy XIV lets players create chat tabs and choose which message categories appear in each tab. | V1 has one clearly named Realm channel, but its channel key, status row, and isolated subscription leave room for later user-defined views without changing message authority. |
| Fortnite distinguishes game/party text chat, exposes privacy settings, and places reporting close to the relevant conversation. | The Realm dock makes audience scope explicit, keeps mute local to the browser session, and attaches reporting to one exact message rather than to an unstructured player form. |
| Minecraft's reporting flow includes surrounding chat context and allows players to preview what will be submitted. | Warpkeep records a bounded context range at report time, discloses that behavior before submission, prevents later messages from entering the report, and keeps the evidence private for authorized review. |
| Modern game chat preserves play space: a bounded desktop surface and a dedicated compact/mobile destination are more usable than a full-screen overlay everywhere. | Desktop uses a lower-left dock; compact web and Farcaster Mini Apps use the Realm's existing full-screen destination and single Back-navigation owner. |

Primary product references:

- [Final Fantasy XIV: creating a chat log tab](https://na.finalfantasyxiv.com/uiguide/communication/communication-chat/chat_owntab.html)
- [Fortnite: managing text chat options](https://www.epicgames.com/help/c-1/a202300000011592?lang=en-US)
- [Fortnite: reporting bad player behavior](https://www.epicgames.com/help/c-5719350646299/a202300000017678?lang=en-US)
- [Minecraft: addressing player chat reporting](https://www.minecraft.net/en-us/article/addressing-player-chat-reporting-tool)
- [Minecraft Java 1.19.1 report-context notes](https://feedback.minecraft.net/hc/en-us/articles/34593554333197-Minecraft-Java-Edition-1-19-1)
- [Minecraft accessibility settings](https://help.minecraft.net/hc/en-us/articles/43045760611469)

## Authority model

The browser expresses intent. SpacetimeDB decides identity, admission,
agreement eligibility, channel, message ID, order, time, visibility, rate
limits, report linkage, and moderation state.

```text
admitted player
  -> send/report reducer (private intent, caller-derived FID)
  -> private archive / recent cache / receipt / rate / report tables
  -> body-free public status subscription
  -> caller-authenticated recent/history procedures
  -> visibility-gated browser polling
  -> desktop dock or compact Realm destination
```

The implementation uses the official SpacetimeDB model deliberately:

- reducers are the only message/report mutation boundary;
- the only public Chat table is body-free channel status;
- private tables contain the permanent archive, bounded recent cache, channel
  sequence, message/report rate events, idempotency receipts, and reports;
- the recent procedure re-runs gameplay admission/current-agreement and active
  channel checks on every read, returns at most 128 rows, and is polled only
  while the document is visible (two-second cadence with bounded exponential
  failure backoff and full-window hydration after backgrounding);
- older history is a caller-gated procedure with an exclusive indexed cursor,
  at most 50 sequence lookups, and no full-table scan;
- moderator procedures are admin-only, bounded, and read-only unless the named
  reducer records an audited state change; and
- generated browser bindings expose only one body-free public Chat table, two
  self-service reducers, and two caller-safe recent/history procedures.

Relevant platform references:

- [SpacetimeDB TypeScript client and subscriptions](https://spacetimedb.com/docs/clients/typescript/)
- [SpacetimeDB table model](https://spacetimedb.com/docs/tables/)
- [SpacetimeDB table access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB reducers](https://spacetimedb.com/docs/functions/reducers/)
- [SpacetimeDB views and caller-scoped reads](https://spacetimedb.com/docs/functions/views/)

Chat is not joined to Warpkeep's large Realm snapshot. Its status-only
subscription and bounded polling loop have their own observer/failure boundary,
so Chat reconnects or malformed procedure output cannot invalidate terrain,
keeps, resources, or Workers.

## Persistence and migration

Protocol V16 appends exactly eight tables after the frozen V15 schema:

| Table | Visibility | Purpose |
| --- | --- | --- |
| `realm_chat_status_v1` | Public | Policy, mode, and projection limits |
| `realm_chat_channel_v1` | Private | Canonical sequence and channel state |
| `realm_chat_message_v1` | Private | Authoritative message archive and moderation evidence |
| `realm_chat_recent_v1` | Private | Exact newest cache, capped at 128 rows and exposed only by the caller-gated procedure |
| `realm_chat_rate_event_v1` | Private | Bounded rolling anti-spam evidence |
| `realm_chat_send_receipt_v1` | Private | Exactly-once retry receipts |
| `realm_chat_report_v1` | Private | One caller/message report, indexed pending state, and frozen context range |
| `realm_chat_report_rate_event_v1` | Private | Globally bounded rolling one-day report-ingress ledger |

The V15 fixture stays frozen. A separate V16 fixture, static schema checks, and
a disposable populated-database proof establish additive preservation,
idempotent republish, all-eight-table row retention, and refusal of destructive
V16-to-V15 rollback. The canonical production publisher intentionally has no
V16 publication lane in this branch.

## Message and abuse policy

The server normalizes CRLF and Unicode NFC before validation. Candidate V1
limits are 500 Unicode scalars, 2,048 UTF-8 bytes, and eight lines. Controls
that can forge or visually reorder moderation evidence are rejected while
ordinary right-to-left language remains supported.

Accepted messages are limited to one every two seconds, ten in a rolling
minute, sixty in a rolling hour, and no duplicate normalized body from the same
sender within sixty seconds. Rejected attempts consume no quota. State is
bounded per FID and corrupt or oversized ledgers fail closed.

Each send uses a canonical UUID request key. A client retries an ambiguous
timeout with the same key and body for a bounded window; the server either
returns the original success or rejects a conflicting replay. Message IDs are
server-generated UUIDv7 values and sequence/time are server-authored.

Reports are message-local, caller-bound, private, and idempotent. Self-reporting
and duplicate report mutation are rejected. The recorded context ends at the
last sequence that existed when the report was created, so later conversation
cannot silently alter evidence. Public moderation replaces the body with a
tombstone while the private admin evidence procedure retains the original text.
Reporting never automatically hides a message or punishes a player.

Report details are capped at 250 Unicode scalars and 512 UTF-8 bytes. Atomic
server-time quotas enforce 5 reports/reporter/hour, 20/reporter/day,
20/message, 250/global/hour, and 1,000/global/day. The one-day ledger is bounded
to 1,000 rows. A private channel counter stops new sends at 4,000 pending
reports and stops new reports at 5,000; resolution decrements it atomically.
Admin health counts pending rows through the private `status` index with the
same 5,000-row ceiling.

## Player experience

- The launcher shows unread count without stealing focus.
- Opening at the bottom marks the current live window read. New messages do not
  force-scroll a player who is reading earlier history.
- The composer preserves a failed draft, sends on Enter, inserts a line break
  with Shift+Enter, and does not send during IME composition.
- Sender portraits open a small keeper card with keep location, session mute,
  exact-message report, and safe plain-text copy controls.
- Messages are rendered as text only. V1 has no HTML, automatic links, embeds,
  attachments, or rich previews.
- Compact chat participates in the Realm's single Farcaster Back boundary:
  Back closes a report first, then chat, then resumes normal Realm navigation.
- The message log, status announcements, report dialog, focus containment,
  expanded relationships, reduced motion, safe areas, and focus restoration
  are keyboard and assistive-technology aware.

## Deliberate V1 non-goals

V1 does not claim typing indicators, online presence, delivery/read receipts,
direct messages, guild chat, proximity chat, voice, translation, reactions,
editing, deletion by players, link previews, attachments, or push
notifications. In particular, it does not infer presence from a socket or
invent typing state that SpacetimeDB does not authoritatively persist.

These can be evaluated later as separate privacy, retention, moderation, and
authority changes. Channel extensibility is preserved without exposing those
features prematurely.

## Activation checklist

Merging this implementation must not activate or publish chat. Activation
requires a separate reviewed change that records all of the following:

1. owner and qualified legal approval, including the unresolved age/minor
   policy and an explicit retention/erasure schedule;
2. exact approved legal, policy, client, server, schema, and generated-binding
   versions;
3. a V15 production predecessor, V16 additive migration receipt, protected
   admin inspection, and exact post-publication checkpoint;
4. staged channel health, bounded projection/archive parity, moderator access,
   kill-switch, and canary evidence;
5. desktop, compact web, and Farcaster Mini App accessibility/abuse QA;
6. named rollback owner and evidence-preserving incident procedure; and
7. a separate commit changing both the server activation compile gate and the
   client entry gate only after the active channel is verified.

Until then, the client flag is `false`, server activation is not compiled, the
channel is unseeded, the production publisher rejects V16 mutation, and no chat
data is collected.

In particular, a proposed 90-day erasure/anonymization workflow remains
unapproved and unimplemented release work. This schema introduces no message
deletion or retention scheduler. Its scope, legal/moderation holds,
anonymization behavior, backup handling, and audited operator path require a
separate owner/legal decision and implementation before activation.
