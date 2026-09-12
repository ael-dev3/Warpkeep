export const PTR_RAW_V10_PROFILE: 'warpkeep-raw-v10-normalized-no-views-rls-http-defaults-v1';
export type PtrRawV10Definition = Readonly<{
  sections: readonly Readonly<Record<string, unknown>>[];
}>;
export type PtrArtifactDescription = Readonly<{
  profile: 'warpkeep-ptr-artifact-description-v1';
  artifactSha256: string;
  rawModuleDefVersion: 10;
  standaloneExecutableSha256: string;
  rawExtractionSha256: string;
  canonicalizationProfile: typeof PTR_RAW_V10_PROFILE;
  descriptionSha256: string;
  definition: PtrRawV10Definition;
}>;
export function canonicalizePtrRawV10(bytes: Uint8Array): Readonly<{
  profile: typeof PTR_RAW_V10_PROFILE;
  definition: PtrRawV10Definition;
  digest: string;
}>;
export function describePtrArtifact(
  input: Readonly<{
    artifactDescriptor: number;
    artifactSha256: string;
    assertArtifact: () => void;
    cli: Readonly<{
      directory: string;
      provenance: Readonly<{ standaloneExecutableSha256: string }>;
      verify: () => void;
    }>;
    spawn?: (...args: any[]) => unknown;
  }>,
): PtrArtifactDescription;
