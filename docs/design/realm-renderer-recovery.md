# Realm renderer recovery

The Realm renderer is presentation only. Admission, resources, Workers, and
other durable world state remain under SpacetimeDB authority while a browser
graphics process is interrupted or rebuilt.

## Lifecycle and fallback

The explicit renderer states are `probing`, `loading`, `ready`, `recovering`,
`static-unsupported`, `static-degraded`, and `failed`.

- `static-unsupported` means WebGL 2 was unavailable before the first 3D scene.
- `static-degraded` means bounded 3D repair was exhausted after a classified
  failure. It preserves a read-only illustrated overview with explicit Retry
  and Return actions instead of an endless restoration overlay.
- `failed` remains the fail-closed state for a future failure that cannot use
  the illustrated view.

A retryable graphics-pressure failure follows this session-only ladder:

`requested tier -> lighter tier -> reduced fresh-canvas retry -> 2D safety view`

The player's saved graphics preference is not overwritten. Balanced and
reduced renderers let the browser choose its default graphics adapter; only the
high tier requests the high-performance adapter. Minimum-capability WebGL 2
implementations begin on the lightest automatic profile.

## Context loss and deadlines

Context loss pauses rendering and map input while retaining React selection,
camera intent, and compatible Worker presentation continuity. The original
canvas keeps its restore listener for one bounded restore window. A recovered
context rebuilds the scene at a lighter session tier. A stalled generation is
disposed once and the next retry uses the alternate canvas so a lost context
cannot poison every attempt.

The first blocking scene has a 30-second visible construction window; restored
scenes use a 20-second visible rebuild window. Both grant a fresh foreground
budget after an Android or embedded WebView resumes. A 120-second wall-clock
guard still retires abandoned hidden generations. Late callbacks carry their
renderer generation and cannot publish state after that generation is retired.
A recovered scene must remain healthy and visible for a 12-second stability
window before its retry budget resets; background time does not count. A
renderer that produces one frame and immediately loses its context therefore
remains inside the same bounded repair sequence.
Nonblocking quality or reduced-motion replacements also have a 20-second
deadline; a stalled candidate is retired while its healthy predecessor remains
active.

Worker motion continuity may cross a graphics-quality change only when the
canonical scene topology key is unchanged. Camera restoration occurs after
that continuity attempt and before the replacement becomes active.

## Player diagnostics and privacy

Every renderer failure maps to a stable `WK-GFX-001` through `WK-GFX-013`
reference with a curated explanation, likely causes, the automatic response,
and a suggested next step. The screen also offers a bounded retry, a route back
when recovery blocks or degrades a previously ready Realm, and a public support
link.

Browsers do not reliably reveal why a graphics context was lost or whether a
specific driver is faulty. Device age, browser lifecycle, memory pressure,
thermal pressure, and driver resets are described only as possibilities.
Player-facing reports use coarse capability bands and never include raw
exceptions, URLs, user agents, GPU vendor or renderer strings, exact hardware
values, identity data, credentials, or private Realm records.

## Compatibility evidence

Unit and rendered-component tests emulate Android Chrome and Farcaster Android
WebView viewport, touch, background/resume, context-loss, canvas-rotation, tier
descent, timeout, stale-callback, and safety-view behavior. This is deterministic
browser lifecycle coverage, not proof for every physical GPU or vendor driver.
The supported safety boundary is a current JavaScript-capable browser with an
explicit 2D view when stable WebGL 2 is unavailable.
