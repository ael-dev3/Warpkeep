export type LocalProgramArtifact = Readonly<{
  profile: 'warpkeep-local-program-artifact-v1'; realm: 'genesis001' | 'genesis002';
  sourceCommit: string; sourceTree: string; moduleSourceCommit: string; moduleTreeId: string;
  dependencyClosureDigest: string; nodeVersion: '24.19.0' | '22.22.3';
  programArtifactSha256: string; programHashAlgorithm: 'keccak-256'; programKeccak256: string;
  artifactBytes: number; artifactBase64: string;
}>;
export function retainLocalProgramArtifact(input: Readonly<{
  realm: string; sourceCommit: string; sourceTree: string; moduleTreeId: string;
  dependencyClosureDigest: string; bundle: Uint8Array; bundleSha256: string;
}>, keccak256: (bytes: Uint8Array) => Uint8Array): LocalProgramArtifact;
