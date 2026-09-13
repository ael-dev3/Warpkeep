import type { PtrArtifactDescription, describePtrArtifact } from './ptr-artifact-description.mjs';

export type Genesis002ArtifactDescription = Readonly<Omit<PtrArtifactDescription, 'profile'> & {
  profile: 'warpkeep-genesis002-artifact-description-v1';
}>;
export function describeGenesis002Artifact(input: Parameters<typeof describePtrArtifact>[0]): Genesis002ArtifactDescription;
