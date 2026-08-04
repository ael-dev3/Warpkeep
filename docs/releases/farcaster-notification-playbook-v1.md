# Farcaster Mini App Notifications — Production Playbook

Warpkeep has completed an owner-controlled Farcaster notification canary and is
publishing the implementation lessons as a reusable guide for other Mini App
developers. The visible canary used the legacy already-admitted reconciliation
path; it proved real transport, while the accompanying notification-first path
corrects the admission ordering for future requests.

Warpkeep's alert now carries the Hegemony voice without exposing a world or
realm identifier:

> **Welcome to the Hegemony Empire**
>
> The gates have answered your name. Cross the threshold, Founder—your legacy awaits.

The transport success was observed in the real Farcaster client. The
notification-first admission repair then separates five facts that are often
accidentally treated as one:

1. signed notification consent was recorded;
2. the Farcaster notification provider accepted the token handoff;
3. the Mini App was launched with the matching notification ID;
4. Quick Auth verified the same FID and domain; and
5. the application's authority layer committed the intended state transition.

The guide includes the webhook lifecycle, safe token storage, provider response
handling, deduplication and rate limits, notification-context verification,
Quick Auth binding, one-use grants, retry controls, token-free diagnostics, a
failure map, and a production canary checklist.

Read the full guide:

- [Reliable Farcaster Mini App notifications](https://github.com/ael-dev3/Warpkeep/blob/farcaster-notifications-v1/docs/farcaster-notification-playbook.md)

The accompanying source keeps provider acceptance separate from admission. A
visible alert was confirmed by the owner canary, but the release does not claim
that an API response can prove OS display or human reading. The protected action
still requires the exact launch context, same-FID authentication, and current
application state.

Useful official references:

- [Sending Notifications](https://miniapps.farcaster.xyz/docs/guides/notifications)
- [Notification launch context](https://miniapps.farcaster.xyz/docs/sdk/context)
- [Quick Auth](https://miniapps.farcaster.xyz/docs/sdk/quick-auth)

This is a technical publication, not a new Warpkeep game version.
