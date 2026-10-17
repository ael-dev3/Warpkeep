# Public source archive

Development halted on 17 October 2026. This repository is available for reuse
under the licenses described in [README.md](README.md) and
[ASSET-REUSE.md](ASSET-REUSE.md).

## Automation and services

The repository's existing Actions pause is preserved. Jobs that use private
self-hosted production runners additionally require a private repository, so
making this source public does not activate an operator's machine. Local
validation and its workflow definitions remain available.

Historical deployment manifests and signed receipts retain their original
source scopes. They have not been regenerated for this public archive; the
production policy commands intentionally reject a stale deployment closure.
Continuing an installation requires a fresh review and valid release evidence.

Historical deployment and recovery tooling documents a particular installation.
It is not a turnkey hosted-service entitlement. Fork operators must configure
their own accounts, isolated runners, databases, secrets, and access policies.
Do not connect untrusted pull requests to a self-hosted production runner.

Keep credentials, account sessions, signing material, raw player records,
private generation seeds, and operator output outside Git. The example files
use placeholders; store real values in private local configuration or a secret
manager. Repository and service identifiers are not authentication credentials.

## Historical records

Existing commits, tags, immutable asset manifests, and public license grants
are preserved. Dated plans and acceptance records describe their original
scope and do not authorize deployments or continued development. Current
source documents use generic local home paths for portability and privacy.

This public-source cleanup does not establish a new production release or
change player-state compatibility requirements. Review the code and configure
your own environment before running operational scripts.
