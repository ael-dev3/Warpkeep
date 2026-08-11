import type { GenesisResourceTerrainKind } from './resourceAuthorityPolicy';

/**
 * Passive production for castles founded directly in the Greater Realm.
 *
 * `yieldClass` is already part of the reviewed, declassified v17 cell
 * contract. Keeping this projection onto the existing resource terrain
 * classes preserves the deployed ten-minute quantum, per-resource inventory
 * cap, reservation rules, and four-resource account shape. Gold therefore
 * remains expedition-only under every class, exactly as it is for v16.
 */
export const GREATER_REALM_FOUNDED_PASSIVE_YIELD_POLICY_VERSION =
  'greater-realm-founded-passive-yield-v1';

export const GREATER_REALM_FOUNDED_PASSIVE_TERRAIN_BY_YIELD_CLASS =
  Object.freeze({
    1: 'lowland',
    2: 'meadow',
    3: 'ridge',
  } as const satisfies Readonly<Record<number, GenesisResourceTerrainKind>>);

export class GreaterRealmFoundingPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmFoundingPolicyError';
  }
}

/**
 * Resolve only productive, passable founding classifications. Class zero is
 * reserved for cells without passive production and may never host a castle.
 */
export function greaterRealmFoundedPassiveTerrainForYieldClassV1(
  yieldClass: number,
): GenesisResourceTerrainKind {
  if (!Number.isSafeInteger(yieldClass)) {
    throw new GreaterRealmFoundingPolicyError(
      'GREATER_REALM_FOUNDED_YIELD_CLASS_INVALID',
    );
  }
  const terrain = GREATER_REALM_FOUNDED_PASSIVE_TERRAIN_BY_YIELD_CLASS[
    yieldClass as keyof typeof GREATER_REALM_FOUNDED_PASSIVE_TERRAIN_BY_YIELD_CLASS
  ];
  if (terrain === undefined) {
    throw new GreaterRealmFoundingPolicyError(
      'GREATER_REALM_FOUNDED_YIELD_CLASS_INVALID',
    );
  }
  return terrain;
}

export function greaterRealmFoundingPolicyErrorCode(
  error: unknown,
): string | undefined {
  return error instanceof GreaterRealmFoundingPolicyError ? error.code : undefined;
}
