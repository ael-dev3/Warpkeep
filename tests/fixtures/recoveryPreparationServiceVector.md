# Synthetic preparation receipt codec vector

`recoveryPreparationServiceVector.json` was produced by the actual release-recovery service `choosePreparationIntent`, `signPreparationReceipt`, and `verifyPreparationReceipt` functions. The only signing configuration substitution was the existing public P-256 test key. It is synthetic cryptographic parity evidence, not a production reservation, OIDC authentication, or deployment authorization.

The JSON's SHA-256 is `cdefd2d70313b2fb9c8f267480da33cafad4b9b24973c593cb10c50f441a6db8`. Its request/source/tree/run coordinates and creation time are fixed test values. The root verifier consumes the stored compact JWS unchanged; it does not rewrap or normalize the service payload before verification.

The separately generated joined fixture uses the same test key and service wire contract with the genuine temporary Git source/tree. Full service producer input hashes and the standalone vector-generation command are retained with the development verification evidence.
