import {
  greaterRealmCounterRandomU32,
  greaterRealmTerrainChannelId,
  type GreaterRealmTerrainSeed,
} from "./greater-realm-terrain";

export const GREATER_REALM_GEOLOGY_AUTHORITY_VERSION =
  "greater-realm-geology-authority-v1" as const;

/** Stable private package IDs. Never reorder or reuse an ID. */
export const GREATER_REALM_ROCK_FAMILY_ID = Object.freeze({
  SEDIMENTARY: 1,
  FELSIC_IGNEOUS: 2,
  METAMORPHIC: 3,
  BASALTIC: 4,
  VOLCANIC_ARC: 5,
  ULTRAMAFIC: 6,
} as const);

export type GreaterRealmRockFamilyId =
  (typeof GREATER_REALM_ROCK_FAMILY_ID)[keyof typeof GREATER_REALM_ROCK_FAMILY_ID];

export type GreaterRealmPseudoTectonicDomainBasis = Readonly<{
  id: number;
  q: number;
  r: number;
  crustClass: 0 | 1 | 2;
  motionQ: number;
  motionR: number;
  buoyancy: number;
  resistance: number;
  volcanicPotential: number;
  age: number;
}>;

export type GreaterRealmDomainMaterialMetrics = Readonly<{
  domainCount: number;
  minimumBaseThickness: number;
  maximumBaseThickness: number;
  rockFamilyCounts: readonly number[];
  thicknessRangeProof: boolean;
  crustRockCompatibilityProof: boolean;
  proof: boolean;
}>;

export type GreaterRealmDomainMaterialAuthority = Readonly<{
  /** Metres, indexed by stable pseudo-tectonic domain ID. */
  baseThickness: Uint16Array;
  /** `GREATER_REALM_ROCK_FAMILY_ID`, indexed by stable domain ID. */
  rockFamily: Uint8Array;
  metrics: GreaterRealmDomainMaterialMetrics;
  /** Best-effort retirement of private package authority arrays. */
  clear: () => void;
}>;

const INT32_MIN = -0x8000_0000;
const INT32_MAX = 0x7fff_ffff;
const MINIMUM_DOMAIN_COUNT = 7;
const MAXIMUM_DOMAIN_COUNT = 12;
const ROCK_FAMILY_COUNT = 6;
const THICKNESS_CHANNEL = greaterRealmTerrainChannelId(
  "tectonic-domain-base-thickness-v1",
);
const ROCK_FAMILY_CHANNEL = greaterRealmTerrainChannelId(
  "tectonic-domain-rock-family-v1",
);

const THICKNESS_RANGE_BY_CRUST = Object.freeze([
  Object.freeze({ minimum: 28_000, maximum: 52_000 }),
  Object.freeze({ minimum: 6_000, maximum: 16_000 }),
  Object.freeze({ minimum: 18_000, maximum: 36_000 }),
] as const);

const ROCK_FAMILIES_BY_CRUST = Object.freeze([
  Object.freeze([
    GREATER_REALM_ROCK_FAMILY_ID.SEDIMENTARY,
    GREATER_REALM_ROCK_FAMILY_ID.FELSIC_IGNEOUS,
    GREATER_REALM_ROCK_FAMILY_ID.METAMORPHIC,
    GREATER_REALM_ROCK_FAMILY_ID.VOLCANIC_ARC,
  ] as const),
  Object.freeze([
    GREATER_REALM_ROCK_FAMILY_ID.BASALTIC,
    GREATER_REALM_ROCK_FAMILY_ID.ULTRAMAFIC,
    GREATER_REALM_ROCK_FAMILY_ID.VOLCANIC_ARC,
  ] as const),
  Object.freeze([
    GREATER_REALM_ROCK_FAMILY_ID.SEDIMENTARY,
    GREATER_REALM_ROCK_FAMILY_ID.METAMORPHIC,
    GREATER_REALM_ROCK_FAMILY_ID.BASALTIC,
    GREATER_REALM_ROCK_FAMILY_ID.VOLCANIC_ARC,
  ] as const),
] as const);

function fail(code: string): never {
  throw new Error(code);
}

function isInt32(value: number): boolean {
  return (
    Number.isSafeInteger(value) && value >= INT32_MIN && value <= INT32_MAX
  );
}

function validateDomain(domain: GreaterRealmPseudoTectonicDomainBasis): void {
  if (
    !Number.isSafeInteger(domain.id) ||
    domain.id < 0 ||
    domain.id >= MAXIMUM_DOMAIN_COUNT ||
    !isInt32(domain.q) ||
    !isInt32(domain.r) ||
    (domain.crustClass !== 0 &&
      domain.crustClass !== 1 &&
      domain.crustClass !== 2) ||
    !isInt32(domain.motionQ) ||
    !isInt32(domain.motionR) ||
    !isInt32(domain.buoyancy) ||
    !Number.isSafeInteger(domain.resistance) ||
    domain.resistance < 0 ||
    domain.resistance > 10_000 ||
    !Number.isSafeInteger(domain.volcanicPotential) ||
    domain.volcanicPotential < 0 ||
    domain.volcanicPotential > 10_000 ||
    !Number.isSafeInteger(domain.age) ||
    domain.age < 0 ||
    domain.age > 65_535
  )
    fail("GREATER_REALM_GEOLOGY_DOMAIN_INVALID");
}

function rockFamilyForDomain(
  seed: GreaterRealmTerrainSeed,
  domain: GreaterRealmPseudoTectonicDomainBasis,
): GreaterRealmRockFamilyId {
  const allowed = ROCK_FAMILIES_BY_CRUST[domain.crustClass];
  const random = greaterRealmCounterRandomU32(
    seed,
    ROCK_FAMILY_CHANNEL,
    domain.q,
    domain.r,
    domain.id,
  );

  // Strong volcanic domains retain the same counter address but receive a
  // coherent volcanic family more often. Resistant old continental crust is
  // similarly biased toward metamorphic or felsic material.
  if (domain.volcanicPotential >= 7_500 && (random & 3) !== 0) {
    return GREATER_REALM_ROCK_FAMILY_ID.VOLCANIC_ARC;
  }
  if (
    domain.crustClass === 0 &&
    domain.resistance >= 6_500 &&
    domain.age >= 5_000
  ) {
    return (random & 1) === 0
      ? GREATER_REALM_ROCK_FAMILY_ID.METAMORPHIC
      : GREATER_REALM_ROCK_FAMILY_ID.FELSIC_IGNEOUS;
  }
  return allowed[random % allowed.length]!;
}

function rockFamilyMatchesCrust(
  crustClass: 0 | 1 | 2,
  rockFamily: number,
): boolean {
  return ROCK_FAMILIES_BY_CRUST[crustClass].some(
    (candidate) => candidate === rockFamily,
  );
}

/**
 * Add the two missing macro-geology authority fields without changing any
 * existing domain property or depending on mutable RNG traversal order.
 *
 * Both outputs are indexed by the stable domain ID, so callers may provide the
 * 7-12 basis records in any order and directly integrate the arrays into the
 * private domain manifest.
 */
export function deriveGreaterRealmDomainMaterialAuthority(
  input: Readonly<{
    seed: GreaterRealmTerrainSeed;
    domains: readonly GreaterRealmPseudoTectonicDomainBasis[];
  }>,
): GreaterRealmDomainMaterialAuthority {
  if (
    input.domains.length < MINIMUM_DOMAIN_COUNT ||
    input.domains.length > MAXIMUM_DOMAIN_COUNT
  )
    fail("GREATER_REALM_GEOLOGY_DOMAIN_COUNT_INVALID");

  const baseThickness = new Uint16Array(input.domains.length);
  const rockFamily = new Uint8Array(input.domains.length);
  const rockFamilyCountsWorking = new Uint8Array(ROCK_FAMILY_COUNT + 1);
  const seenIds = new Uint8Array(input.domains.length);
  const seenCoordinates = new Set<string>();
  let completed = false;
  try {
    for (const domain of input.domains) {
      validateDomain(domain);
      if (domain.id >= input.domains.length || seenIds[domain.id] !== 0) {
        fail("GREATER_REALM_GEOLOGY_DOMAIN_ID_INVALID");
      }
      seenIds[domain.id] = 1;
      const coordinateKey = `${domain.q},${domain.r}`;
      if (seenCoordinates.has(coordinateKey)) {
        fail("GREATER_REALM_GEOLOGY_DOMAIN_COORDINATE_DUPLICATE");
      }
      seenCoordinates.add(coordinateKey);

      const range = THICKNESS_RANGE_BY_CRUST[domain.crustClass];
      const random = greaterRealmCounterRandomU32(
        input.seed,
        THICKNESS_CHANNEL,
        domain.q,
        domain.r,
        domain.id,
      );
      baseThickness[domain.id] =
        range.minimum + (random % (range.maximum - range.minimum + 1));
      const family = rockFamilyForDomain(input.seed, domain);
      rockFamily[domain.id] = family;
      rockFamilyCountsWorking[family] += 1;
    }
    if (seenIds.some((value) => value !== 1)) {
      fail("GREATER_REALM_GEOLOGY_DOMAIN_ID_INVALID");
    }

    let minimumBaseThickness = 0xffff;
    let maximumBaseThickness = 0;
    let thicknessRangeProof = true;
    let crustRockCompatibilityProof = true;
    for (const domain of input.domains) {
      const thickness = baseThickness[domain.id]!;
      const family = rockFamily[domain.id]!;
      const range = THICKNESS_RANGE_BY_CRUST[domain.crustClass];
      minimumBaseThickness = Math.min(minimumBaseThickness, thickness);
      maximumBaseThickness = Math.max(maximumBaseThickness, thickness);
      if (thickness < range.minimum || thickness > range.maximum) {
        thicknessRangeProof = false;
      }
      if (!rockFamilyMatchesCrust(domain.crustClass, family)) {
        crustRockCompatibilityProof = false;
      }
    }
    if (!thicknessRangeProof || !crustRockCompatibilityProof) {
      fail("GREATER_REALM_GEOLOGY_AUTHORITY_INVARIANT");
    }

    const metrics = Object.freeze({
      domainCount: input.domains.length,
      minimumBaseThickness,
      maximumBaseThickness,
      rockFamilyCounts: Object.freeze(Array.from(rockFamilyCountsWorking)),
      thicknessRangeProof,
      crustRockCompatibilityProof,
      proof: true,
    });
    completed = true;
    return Object.freeze({
      baseThickness,
      rockFamily,
      metrics,
      clear() {
        baseThickness.fill(0);
        rockFamily.fill(0);
      },
    });
  } finally {
    seenIds.fill(0);
    rockFamilyCountsWorking.fill(0);
    seenCoordinates.clear();
    if (!completed) {
      baseThickness.fill(0);
      rockFamily.fill(0);
    }
  }
}
