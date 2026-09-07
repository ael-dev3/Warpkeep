# Workflow-attestation response bounds — 2026-09-07

Source inspection found that the protected workflow authority buffered GitHub
JSON with `arrayBuffer()` before applying its 512 KiB bound. Its ten-second
request timer was cleared after response headers, leaving body reads outside
that deadline. This was an execution-path defect within existing R12, not a new
product or admissions requirement.

The reader now accumulates bounded stream chunks, rejects declared/actual length
mismatches, and applies the request's abort signal throughout body consumption.
It cancels rejected bodies without waiting indefinitely for cancellation,
releases reader locks where possible, clears request timers on both fetch and
body failures, and wipes owned byte buffers. Fatal UTF-8 decoding and the existing
exact URL/status/media-type/redirect checks remain. Native Uint8Array brand
checking supports fetch chunks crossing JavaScript realms without accepting
arbitrary array-like objects.

Verification:

- Windows: workflow authority, workflow runtime and continuation suites passed
  all 73 tests; targeted strict TypeScript passed.
- WSL Ubuntu-24.04: the same 73 tests passed using an explicit two-file overlay
  in the older disposable Linux test clone, not the active assembly clone.
- New cases cover oversized chunked responses, a stalled body whose cancellation
  promise itself never settles, incorrect content lengths, malformed UTF-8, and
  timer cleanup when fetch rejects before headers.
- Existing opaque-permit, source/run identity, phase re-attestation and rejection
  tests remain passing. The code does not emit upstream errors or token values.

This does not implement the separate workflow-attested Verify evidence stub or
remove activation/Task 7 fences. It grants no new deployment authority. The
concurrent compiled-family probe is bound to source `8eb53f1` and does not include
this later transport change; its results must not be attributed to this source.
