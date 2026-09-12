# Warpkeep 0.4 realm access evidence

Status: **pending**. This record is the authoritative destination for R10 and
must be updated only from fresh authenticated G001, G002 and PTR observations.

Record the exact source and provider identities, G001 admission freeze and
existing-player preservation result, G002 sealed/zero-state and denial result,
PTR owner-only admission and access result, realm-menu presentation, and the
negative-write probes. Keep FIDs, JWTs, private session data and raw provider
responses in the private operations store; publish only privacy-safe summaries
and secure references.

What this record must not claim without fresh evidence: that a module is live,
that G002 is sealed, that PTR is owner-provisioned, or that unauthorized writes
were denied.

Evidence template:

```text
Date and gate:
Reviewed source / deployment identity:
G001 freeze and existing-player result:
G002 sealed state and denial probes:
PTR owner-only state and denial probes:
Realm selector and presentation result:
Privacy-safe evidence links:
Limitations and next gate:
```
