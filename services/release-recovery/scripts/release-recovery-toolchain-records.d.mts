export function validateToolchainSourcePolicy(value: unknown): any

export function parseToolchainSourcePolicyBytes(bytes: Uint8Array): Readonly<{
  policy: any
  sha256: string
}>

export function validateToolchainEvidence(
  value: unknown,
  parsedPolicy: unknown,
  sourceCoordinates: unknown,
): any

export function parseToolchainEvidenceBytes(
  bytes: Uint8Array,
  parsedPolicy: unknown,
  sourceCoordinates: unknown,
): any
