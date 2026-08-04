import { Buffer } from 'node:buffer';

/**
 * Exact byte markers embedded in every Greater Realm private envelope,
 * package, preview, and manifest family. Public-surface scanners share this
 * one list so a renamed artifact cannot exploit scanner drift.
 */
export const GREATER_REALM_PRIVATE_MARKER_TEXT = Object.freeze([
  'WKGR-PRIVATE-PACKAGE-V1',
  'WKGR-PRIVATE-CHECKPOINT-V1',
  'WKGR-PRIVATE-ATLAS-V1',
  'WKGR-PRIVATE-PREVIEW-V1',
  'WKGR-PRIVATE-SEED-V1',
  'warpkeep.greater-realm.private-candidate.v1',
  'warpkeep.greater-realm.private-checkpoint.v1',
  'warpkeep.greater-realm.private-batch.v1',
  'warpkeep.greater-realm.private-owner-selection.v1',
  'warpkeep.greater-realm.private-owner-shortlist.v1',
  'warpkeep.greater-realm.private-legacy-lowlands-patch.v1',
  'warpkeep.greater-realm.private-chunk-manifest.v1',
  'warpkeep.greater-realm.private-topography-patch.v1',
  'warpkeep.greater-realm.private-provenance.v1',
]);

const GREATER_REALM_PRIVATE_MARKERS = Object.freeze(
  GREATER_REALM_PRIVATE_MARKER_TEXT.map(marker => Buffer.from(marker, 'utf8')),
);

export const GREATER_REALM_PRIVATE_MARKER_OVERLAP_BYTES = Math.max(
  ...GREATER_REALM_PRIVATE_MARKERS.map(marker => marker.length),
) - 1;

export function containsGreaterRealmPrivateMarker(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError('GREATER_REALM_PRIVATE_MARKER_INPUT_INVALID');
  }
  return GREATER_REALM_PRIVATE_MARKERS.some(marker => bytes.indexOf(marker) !== -1);
}
