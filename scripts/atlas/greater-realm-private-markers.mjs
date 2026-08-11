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
  'WKGR-PRIVATE-CHECKPOINT-OWNER-KEY-V1',
  'WKGR-PRIVATE-ATTEMPT-CHECKPOINT-V1',
  'WKGR-PRIVATE-ATTEMPT-COMPLETION-V1',
  'warpkeep.greater-realm.private-attempt-checkpoint.v1',
  'warpkeep.greater-realm.private-attempt-completion.v1',
]);

function utf16BigEndian(text) {
  const bytes = Buffer.from(text, 'utf16le');
  for (let offset = 0; offset < bytes.length; offset += 2) {
    const first = bytes[offset];
    bytes[offset] = bytes[offset + 1];
    bytes[offset + 1] = first;
  }
  return bytes;
}

function utf32Bytes(text, bigEndian) {
  const codePoints = [...text];
  const bytes = Buffer.allocUnsafe(codePoints.length * 4);
  for (let index = 0; index < codePoints.length; index += 1) {
    const value = codePoints[index].codePointAt(0);
    if (bigEndian) bytes.writeUInt32BE(value, index * 4);
    else bytes.writeUInt32LE(value, index * 4);
  }
  return bytes;
}

// A renamed private artifact can be wrapped in UTF-16 without changing its
// semantic payload. Keep the exact marker inventory encoded in all text
// representations that public scanners accept or content-sniff.
const GREATER_REALM_PRIVATE_MARKERS = Object.freeze(
  GREATER_REALM_PRIVATE_MARKER_TEXT.flatMap(marker => Object.freeze([
    Buffer.from(marker, 'utf8'),
    Buffer.from(marker, 'utf16le'),
    utf16BigEndian(marker),
    utf32Bytes(marker, false),
    utf32Bytes(marker, true),
  ])),
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
