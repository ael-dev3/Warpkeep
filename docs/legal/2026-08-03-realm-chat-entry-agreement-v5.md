# Proposed Realm Chat entry-agreement V5

Status: **owner and qualified legal review required; do not activate chat**

Entry-agreement bundle `2026-08-03-hegemony-entry-agreement-v5` proposes these
exact public documents:

- Alpha Terms revision `2026-08-03-v5`;
- Hegemony Social Contract version
  `2026-08-03-HEGEMONY-SOCIAL-CONTRACT-V4`; and
- Privacy Notice revision `2026-08-03-v6` (notice only, not blanket consent).

The proposed agreement explains a future persistent Realm Chat, prohibited
high-risk conduct, contextual moderation, good-faith criticism, reports, local
mute, reconsideration, and the unresolved age/minor-participation policy. The
Privacy Notice conditionally discloses the message, identity, recipient,
reporting, moderation, provider, retention, and individual-rights data flows.

## Consequence of approval

The Terms and Social Contract wording changes materially. If this bundle is
approved, merged, and deployed as the current agreement, every Keeper must make
a fresh unchecked acceptance before authenticated entry. Earlier acceptance
evidence remains immutable historical evidence and cannot satisfy the V5 entry
gate.

The bundle change does not itself activate chat. This PR intentionally contains
no chat table, reducer, binding, UI, seeded channel, database publication,
operator action, or production-state claim. `WARPKEEP_REALM_CHAT_CLIENT_ENTRY_ENABLED`
remains `false`. Chat activation requires the later PR sequence and a separate
activation record described in
[`docs/design/realm-chat-v1-contract.md`](../design/realm-chat-v1-contract.md).

## Required approval record

Before merge, the owner and qualified legal reviewer must explicitly resolve
and approve:

- exact version identifiers and final visible wording;
- the age/minor-participation policy;
- persistence, deletion, tombstone, anonymisation, and backup language;
- prohibited-content and good-faith-discretion language;
- report handling, moderator notice, reconsideration, and evidence access;
- privacy purposes, lawful bases, recipients, locations, retention, and rights;
  and
- a private legal/privacy contact path suitable for production use.

This repository record is project-authored engineering documentation, not a
legal-compliance certification or substitute for qualified legal advice.
