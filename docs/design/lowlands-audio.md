# Lowlands audio direction

Warpkeep treats sound as a scene layer, not a page-global loop:

```text
title score ──1.7 s──▶ Hegemony menu score ──2.3 s──▶ Lowlands score
     ▲                         ▲                         │
     └──────────────1.7 s──────┴──────────1.9 s──────────┘
```

The title and menu preserve their existing behavior. An authenticated `ENTER REALM` gesture prepares the Lowlands pair and begins the menu-to-realm handoff before the route changes. Returning to the menu retains both musical positions for the mounted session; sign-out fades realm audio to menu and resets Lowlands for a future account/session.

## Lowlands loop

`Lowlands of Hegemony` is a hot master with a deliberate quiet tail. Native looping would jump from near silence to the opening, so the director owns two cached realm audio elements and schedules an equal-power crossfade:

| Setting | Value |
| --- | --- |
| Runtime gain | `0.37` |
| Outgoing overlap start | `236.000000 s` |
| Decoded endpoint | `244.919979 s` |
| Overlap | `8.919979 s` |
| Menu → realm | `2300 ms` |
| Realm → menu | `1900 ms` |

The realm elements have no `src` until an authenticated realm is prepared. This prevents Lowlands audio requests from anonymous title, menu, QR, and deep-link views. The complete source and runtime integrity record lives in [`../reference/audio/2026-07-11-lowlands-of-hegemony/`](../reference/audio/2026-07-11-lowlands-of-hegemony/).

## Procedural interaction layer

Short interaction cues use Web Audio synthesis rather than downloaded samples.
This keeps the soundtrack inventory unchanged and makes the runtime boundary
easy to inspect:

- the context is created or resumed only after trusted player input;
- one shared noise buffer and fixed UI/world bus graph feed a modest master
  level under the existing mute preference;
- at most 16 event voices are active, with cooldowns, Worker-event clustering,
  and priority-based dropping at saturation;
- every oscillator and buffer source has a finite envelope and explicit stop;
- mute, hidden-tab, sign-out, and teardown paths stop pending voices;
- no identity, gameplay authority, network request, or new persistent record
  enters the SFX layer.

Keep, resource, Water, and ordinary interface selections are presentation
events. Worker confirmations come only from changes in the viewer-owned public
Worker projection, never from optimistic command submission. The current layer
does not add continuous river or ocean ambience.
