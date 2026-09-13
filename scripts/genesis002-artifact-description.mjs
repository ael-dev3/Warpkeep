import { describePtrArtifact } from './ptr-artifact-description.mjs';

/** Reuse the complete realm-neutral RawV10 grammar and attested extraction path. */
export function describeGenesis002Artifact(input) {
  try {
    const description = describePtrArtifact(input);
    return Object.freeze({ ...description, profile: 'warpkeep-genesis002-artifact-description-v1' });
  } catch {
    throw new Error('GENESIS_002_ARTIFACT_DESCRIPTION_INVALID');
  }
}
