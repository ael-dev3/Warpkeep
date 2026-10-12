import type { GreaterRealmPrivateCandidate } from './greater-realm-candidate-generator';

// Candidate authority arrays are top-level fields; grid coordinates/neighbors
// and gate geometry have their own owners. Share retirement between generation
// repair and packaging without making the generator depend on the package.
export function retireGreaterRealmCandidateBuffers(
  candidate: GreaterRealmPrivateCandidate,
): void {
  candidate.seedMaterial.fill(0);
  candidate.candidateSeed.fill(0);
  try {
    for (const gate of candidate.gates) {
      for (const path of [
        gate.firstApproachPath,
        gate.firstAlternateApproachPath,
        gate.secondApproachPath,
        gate.secondAlternateApproachPath,
      ]) (path as number[]).fill(0);
    }
    for (const section of candidate.barrierCrossSections) {
      (section.cells as number[]).fill(0);
    }
  } finally {
    try {
      candidate.grid.clearIndex?.();
    } finally {
      // A failing geometry or optional index hook must not prevent retirement.
      for (const value of [
        candidate.grid.q,
        candidate.grid.r,
        candidate.grid.neighbors,
        ...Object.values(candidate),
      ]) {
        if (!ArrayBuffer.isView(value)) continue;
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength).fill(0);
      }
    }
  }
}
