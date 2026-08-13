# Realm Chat V1 contract

Status: **proposal only; disabled**

Policy version: `2026-08-03-realm-chat-policy-v1`

Realm channel: `realm:genesis-001`

This document fixes the product, authority, privacy, and moderation boundaries
for the first Warpkeep chat implementation. It does not activate chat, publish a
database, seed a channel, or authorize a client entry point.

## Release gates

Realm Chat must remain unavailable until all of these are complete:

1. The project owner and a qualified legal reviewer approve the proposed Terms,
   Social Contract, Privacy Notice, persistence language, moderation process,
   and an explicit age/minor-participation policy.
2. The additive SpacetimeDB authority, private archive/cache, caller-bounded
   procedures, reducers, indexes, and report records pass independent review.
3. The prepared portrait and desktop clients pass review without creating
   browser-side identity, sequence, time, or visibility authority.
4. Operator moderation procedures, evidence handling, release checks, and a
   tested kill switch exist.
5. A separate activation record names the reviewed versions, exact deployment,
   seeded channel, canary evidence, rollback owner, and timestamp.

Merging this contract alone must not make a chat control visible or callable.
The client-side `false` constant is documentary defense in depth, not an
activation mechanism. Server channel state remains authoritative.

Warpkeep's selected production agreement remains the approved
`2026-07-31-hegemony-entry-agreement-v4` bundle. Its `production-approved`
status authorizes only those exact public Terms and Social Contract bytes; it
does not approve Realm Chat, its proposed conduct terms, or either Chat
activation gate. No V5 Chat agreement is selected by this source tree.

The generic Pages and SpacetimeDB agreement-status guards must continue to
reject any selected bundle whose status is not `production-approved`. A future
Chat release must introduce an independently reviewed agreement revision,
update browser, tooling, and module mirrors atomically, and preserve exact
browser/module compatibility. Read-only publisher dry runs remain available
for compatibility evidence, but neither they nor the selected V4 status can
make a Chat control visible or callable.

## V1 product boundary

- One admitted-Realm channel only: `realm:genesis-001`.
- No direct messages, guild channels, trading chat, links with rich previews,
  attachments, voice, or cross-Realm federation.
- Mobile uses a full-screen portrait surface. Desktop uses a bounded dock.
- Recent messages are live; older retained messages are paginated.
- A player can locally mute another sender for the current browser session.
  Local mute is not a server punishment and does not alter other players' view.
- A report attaches to one exact message and preserves its relevant context for
  private review. A report never triggers automatic punishment.

Comparable games commonly separate world/guild audiences and provide reporting
from the relevant player or message surface. See the official
[Forge of Empires chat overview](https://support.innogames.com/kb/ForgeOfEmpires/en_DK/963),
[Forge of Empires reporting flow](https://support.innogames.com/kb/ForgeOfEmpires/en_DK/964),
[Travian messaging overview](https://support.travian.com/en/articles/11-interacting-with-other-players),
and [Travian report guidance](https://support.travian.com/en/articles/121-i-think-a-player-is-violating-game-rules-what-can-i-do).
Warpkeep V1 deliberately starts with fewer channel types.

## Server authority and visibility

The browser supplies only intended message text and an operation request. The
server derives the admitted sender FID, public-profile reference, channel,
sequence, authoritative time, and any visibility state. It validates the exact
current entry agreement and active channel before accepting a message.

The permanent message archive and bounded recent cache must be private. Clients must not be able
to subscribe to or enumerate the full archive, report records, moderator notes,
or internal enforcement state. The only public Chat table is body-free channel
status. A caller-authenticated recent procedure may expose up to 128 permitted
messages and must recheck admission, the current agreement, resource ownership,
and active-channel state on every call. A caller-specific paginated history
procedure may expose at most 50 permitted messages per request and must use
indexed lookups. SpacetimeDB documents that private tables are unavailable to
clients; that is the required authority pattern:
[table access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
and [views](https://spacetimedb.com/docs/functions/views/).

Messages currently form persistent Realm history and have no implemented
routine expiry or deletion path.
That is not a promise of immutable public display or universal physical
retention. Authorized moderation, safety, privacy, legal, service-integrity, or
Realm-reset work may restrict, tombstone, anonymise, or erase a record. Provider
backup lifecycles may differ from active database state.

## Candidate limits requiring owner review

The following are implementation candidates, not approved live limits:

- 500 Unicode scalar values;
- 2,048 UTF-8 bytes;
- 8 lines;
- 2 seconds between accepted messages;
- 10 accepted messages per rolling minute;
- 60 accepted messages per rolling hour; and
- rejection of the same normalized body from one sender within 60 seconds.

The authority PR must define normalization, Unicode handling, counting windows,
retry responses, and adversarial tests before these numbers become enforceable.

The review-only report-ingress envelope is deliberately bounded even while
activation remains forbidden: optional details are capped at 250 Unicode
scalars and 512 UTF-8 bytes; one reporter may submit at most 5 reports per
rolling hour and 20 per rolling day; one message may receive at most 20 reports;
and the service may accept at most 250 reports per rolling hour and 1,000 per
rolling day. At 4,000 pending reports new Chat sends stop, and at 5,000 pending
reports new reports stop. These are safety ceilings, not production retention or
moderation-service commitments.

## Conduct and moderation

Good-faith criticism of Warpkeep, its maintainer, rules, or features is allowed.
The project may still restrict disruptive conduct contextually, including
political or controversial discussion that overwhelms the game's shared space.
The maintainer exercises broad good-faith judgment but does not claim to make a
definitive legal determination.

High-risk categories include credible threats or incitement; doxxing, stalking,
or targeted harassment; sexual exploitation or child sexual abuse material;
terrorism or instructions for serious harm; fraud, phishing, malware, account
compromise, or illegal trade; non-consensual intimate content; unlawful hate or
discriminatory abuse; and attempts to obtain or publish non-public personal or
authentication data.

A warning is not required or guaranteed. Internal reasons remain private. Where
safe and applicable, the affected player should receive a brief understandable
notice that does not expose reporters, personal data, security methods, or an
active investigation. The Alpha does not promise a formal appeal system; it
offers a private reconsideration/legal-contact route without limiting rights
available under applicable law. Knowingly false, retaliatory, or abusive reports
may themselves affect access. Security research reported through the repository
[Security Policy](https://github.com/ael-dev3/Warpkeep/security/policy) remains
protected and distinct from ordinary chat moderation.

## Privacy boundary

If activated, the feature processes message body, verified FID, public profile
link, server time and sequence, recipients or visibility scope, report data, and
private moderator decisions. It uses these records to deliver shared Realm
communication, prevent abuse, investigate reports, protect the service, enforce
the agreement, and meet applicable legal obligations. It does not sell them or
use them for advertising.

The Privacy Notice must identify providers and processing locations, retention
and exceptions, lawful bases where applicable, and available access,
rectification, erasure, restriction, objection, portability, and complaint
rights. The EDPB's small-business guidance emphasizes an identified legal basis,
data minimisation, transparent purposes, security, storage limits, and procedures
for individual rights: [data protection basics](https://www.edpb.europa.eu/sme/learn-the-basics/data-protection-basics_en),
[lawful processing](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en),
and [individual rights](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_ga).

The exact normalized visible Privacy Notice text is integrity-pinned alongside
the Terms and Social Contract even though the notice is not treated as blanket
consent.

The age/minor-participation policy is intentionally unresolved. This contract
sets no age threshold. Activation is blocked until the owner and qualified legal
reviewer approve the applicable policy and any required parent/guardian, notice,
consent, or access measures.

A proposed 90-day erasure/anonymization workflow is also unresolved release
work, not an approved retention rule. No production timer, message/report
erasure reducer, or operator approval is introduced by this implementation. Before activation, the
owner and qualified legal reviewer must decide the exact scope, start event,
moderation/legal-hold exceptions, anonymization semantics, backup treatment,
data-subject handling, and auditable operator procedure, then the project must
implement and test that decision separately.

## Planned PR sequence

1. Legal/product contract (this PR; disabled).
2. Additive SpacetimeDB authority and generated bindings.
3. Client portrait/mobile and desktop-dock experience.
4. Desktop/accessibility/abuse QA.
5. Operator moderation and release integration.
6. Separate, evidence-backed activation record.

Each PR must remain independently reviewable. No implementation PR may weaken
the legal gate, expose the permanent archive, or collapse private moderation
records into public game state.
