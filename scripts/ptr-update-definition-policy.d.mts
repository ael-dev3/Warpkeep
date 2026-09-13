import type { PtrRawV10Definition } from './ptr-artifact-description.mjs';
export const PTR_UPDATE_DEFINITION_POLICY: 'warpkeep-ptr-raw-v10-stable-row-schema-v1';
export const G002_UPDATE_DEFINITION_POLICY: 'warpkeep-g002-raw-v10-stable-row-schema-v1';
export function parsePtrUpdateDefinition(
  serverInnerBytes: Uint8Array,
): Readonly<{
  profile: typeof PTR_UPDATE_DEFINITION_POLICY;
  definition: PtrRawV10Definition;
  fullDigest: string;
}>;
export function comparePtrUpdateDefinitions(
  input: Readonly<{
    priorServerSchema: Uint8Array;
    candidateArtifactDefinition: PtrRawV10Definition;
  }>,
): Readonly<{
  profile: typeof PTR_UPDATE_DEFINITION_POLICY;
  priorDigest: string;
  candidateDigest: string;
  priorPreservationDigest: string;
  candidatePreservationDigest: string;
  addedTables: readonly string[];
  classification: 'tables-preserved' | 'tables-preserved-with-additions';
}>;
export function parseG002UpdateDefinition(
  serverInnerBytes: Uint8Array,
): Readonly<Omit<ReturnType<typeof parsePtrUpdateDefinition>, 'profile'> & {
  profile: typeof G002_UPDATE_DEFINITION_POLICY;
}>;
export function compareG002UpdateDefinitions(
  input: Parameters<typeof comparePtrUpdateDefinitions>[0],
): Readonly<Omit<ReturnType<typeof comparePtrUpdateDefinitions>, 'profile'> & {
  profile: typeof G002_UPDATE_DEFINITION_POLICY;
}>;
