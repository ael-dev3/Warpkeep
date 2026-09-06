import { GAMEPLAY04_POLICY_VERSION } from '../../spacetimedb/gameplay04/policy';
import { GAMEPLAY04_LAYOUT_VERSION } from '../../spacetimedb/gameplay04/placement';
import { GAMEPLAY04_LAYOUT_DIGEST } from '../../spacetimedb/gameplay04/construction';
import type { ReadWire04 } from '../../src/ptr/gameplay04/ptrGameplay04Types';

export const EMPTY_WIRE04 = {
  policyVersion: GAMEPLAY04_POLICY_VERSION,
  layoutVersion: GAMEPLAY04_LAYOUT_VERSION, layoutDigest: GAMEPLAY04_LAYOUT_DIGEST,
  revision: 1n, lastAcceptedSequence: 1n,
  food: 0n, wood: 0n, stone: 0n, gold: 0n,
  workers: [0, 1, 2, 3].map(ordinal => ({ ordinal, assignmentRevision: 0n,
    assignment: undefined, lastReturn: undefined })),
  buildings: [], project: undefined,
  completedLevels: { mill: 0, lumberCamp: 0, stoneworks: 0, goldworks: 0, barracks: 0, cathedral: 0 },
  completedEffects: { foodYieldPerQuantum: 10n, woodYieldPerQuantum: 10n,
    stoneYieldPerQuantum: 10n, goldYieldPerQuantum: 10n,
    travelPerEdgeMicros: 2_000_000n, levelOneBuildDurationMicros: 120_000_000n },
} satisfies ReadWire04;
