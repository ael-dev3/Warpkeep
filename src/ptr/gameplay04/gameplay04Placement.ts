import { evaluatePlacement04, type Placement04, type PlacementResult04 } from '../../../spacetimedb/gameplay04/placement';
import type { Building04 } from '../../../spacetimedb/gameplay04/policy';

const SNAP = 500_000n;
const ROTATIONS = [0, 90_000, 180_000, 270_000] as const;

export function initialPlacement04(kind: Building04, occupied: readonly Placement04[]): Placement04 | null {
  // Exactly 145 rows by 177 columns, with no dependence on scenery or render geometry.
  for (let z = -40_000_000n; z <= 32_000_000n; z += SNAP) {
    for (let x = -44_000_000n; x <= 44_000_000n; x += SNAP) {
      const candidate = { kind, x, z, rotation: 0 };
      if (evaluatePlacement04(candidate, occupied).valid) return Object.freeze(candidate);
    }
  }
  return null;
}

export function nudgePlacement04(draft: Placement04, dx: -1 | 0 | 1, dz: -1 | 0 | 1): Placement04 {
  return Object.freeze({ ...draft, x: draft.x + BigInt(dx) * SNAP, z: draft.z + BigInt(dz) * SNAP });
}

export function rotatePlacement04(draft: Placement04): Placement04 {
  return Object.freeze({ ...draft, rotation: ROTATIONS[(ROTATIONS.indexOf(draft.rotation as typeof ROTATIONS[number]) + 1) % ROTATIONS.length] });
}

const MESSAGES: Readonly<Record<PlacementResult04['reason'], string>> = Object.freeze({
  valid: 'Ready to build.', invalid: 'Choose a valid building placement.', 'off-grid': 'Use the half-metre placement grid.',
  rotation: 'Use quarter-turn rotations.', outside: 'Keep the building inside the buildable grounds.',
  reserved: 'Keep roads and civic space clear.', occupied: 'Leave space between buildings.',
  'duplicate-kind': 'This building already exists. Select it to upgrade.', 'invalid-state': 'Refresh the keep before placing a building.',
});

export function placementMessage04(reason: PlacementResult04['reason']): string { return MESSAGES[reason]; }
