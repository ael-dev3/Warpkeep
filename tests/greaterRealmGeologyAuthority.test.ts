import { describe, expect, it, vi } from "vitest";

import {
  deriveGreaterRealmDomainMaterialAuthority,
  GREATER_REALM_GEOLOGY_AUTHORITY_VERSION,
  GREATER_REALM_ROCK_FAMILY_ID,
  type GreaterRealmPseudoTectonicDomainBasis,
} from "../scripts/atlas/greater-realm-geology-authority";

const SEED = new Uint32Array([
  0x1020_3040, 0x5060_7080, 0x90a0_b0c0, 0xd0e0_f001,
]);

function domains(): GreaterRealmPseudoTectonicDomainBasis[] {
  return [
    {
      id: 0,
      q: -140,
      r: 20,
      crustClass: 0,
      motionQ: 2,
      motionR: -2,
      buoyancy: 1_200,
      resistance: 7_300,
      volcanicPotential: 1_000,
      age: 8_000,
    },
    {
      id: 1,
      q: -90,
      r: 110,
      crustClass: 1,
      motionQ: 0,
      motionR: -3,
      buoyancy: -1_500,
      resistance: 4_200,
      volcanicPotential: 8_500,
      age: 2_300,
    },
    {
      id: 2,
      q: -35,
      r: -80,
      crustClass: 2,
      motionQ: -2,
      motionR: 2,
      buoyancy: -200,
      resistance: 5_800,
      volcanicPotential: 4_000,
      age: 4_500,
    },
    {
      id: 3,
      q: 10,
      r: 25,
      crustClass: 0,
      motionQ: 3,
      motionR: 0,
      buoyancy: 900,
      resistance: 6_900,
      volcanicPotential: 7_900,
      age: 6_700,
    },
    {
      id: 4,
      q: 55,
      r: -130,
      crustClass: 1,
      motionQ: -1,
      motionR: 0,
      buoyancy: -1_800,
      resistance: 3_500,
      volcanicPotential: 2_000,
      age: 1_900,
    },
    {
      id: 5,
      q: 95,
      r: 45,
      crustClass: 2,
      motionQ: 0,
      motionR: 2,
      buoyancy: 300,
      resistance: 5_100,
      volcanicPotential: 6_000,
      age: 3_800,
    },
    {
      id: 6,
      q: 135,
      r: -40,
      crustClass: 0,
      motionQ: -3,
      motionR: 3,
      buoyancy: 1_500,
      resistance: 8_200,
      volcanicPotential: 500,
      age: 9_000,
    },
    {
      id: 7,
      q: 165,
      r: -150,
      crustClass: 1,
      motionQ: 1,
      motionR: -1,
      buoyancy: -1_000,
      resistance: 4_800,
      volcanicPotential: 9_200,
      age: 2_700,
    },
  ];
}

describe("Greater Realm pseudo-tectonic domain material authority", () => {
  it("adds bounded thickness and an explicit compatible rock family deterministically", () => {
    const basis = domains();
    const snapshot = structuredClone(basis);
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("MATH_RANDOM_MUST_NOT_BE_USED");
    });
    try {
      const first = deriveGreaterRealmDomainMaterialAuthority({
        seed: SEED,
        domains: basis,
      });
      const replay = deriveGreaterRealmDomainMaterialAuthority({
        seed: SEED,
        domains: [...basis].reverse(),
      });

      expect(GREATER_REALM_GEOLOGY_AUTHORITY_VERSION).toBe(
        "greater-realm-geology-authority-v1",
      );
      expect(first.baseThickness).toEqual(replay.baseThickness);
      expect(first.rockFamily).toEqual(replay.rockFamily);
      expect(first.metrics).toEqual(replay.metrics);
      expect(first.metrics).toMatchObject({
        domainCount: 8,
        thicknessRangeProof: true,
        crustRockCompatibilityProof: true,
        proof: true,
      });
      expect(
        first.metrics.rockFamilyCounts.reduce(
          (total, count) => total + count,
          0,
        ),
      ).toBe(basis.length);
      for (const domain of basis) {
        const thickness = first.baseThickness[domain.id]!;
        if (domain.crustClass === 0) {
          expect(thickness).toBeGreaterThanOrEqual(28_000);
          expect(thickness).toBeLessThanOrEqual(52_000);
        } else if (domain.crustClass === 1) {
          expect(thickness).toBeGreaterThanOrEqual(6_000);
          expect(thickness).toBeLessThanOrEqual(16_000);
          expect([
            GREATER_REALM_ROCK_FAMILY_ID.BASALTIC,
            GREATER_REALM_ROCK_FAMILY_ID.ULTRAMAFIC,
            GREATER_REALM_ROCK_FAMILY_ID.VOLCANIC_ARC,
          ]).toContain(first.rockFamily[domain.id]);
        } else {
          expect(thickness).toBeGreaterThanOrEqual(18_000);
          expect(thickness).toBeLessThanOrEqual(36_000);
        }
      }
      expect(basis).toEqual(snapshot);
      expect(randomSpy).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("rejects malformed domains and wipes partial typed authority on failure", () => {
    const malformed = domains();
    malformed[5] = { ...malformed[5]!, id: 4 };
    const uint8Fill = vi.spyOn(Uint8Array.prototype, "fill");
    const uint16Fill = vi.spyOn(Uint16Array.prototype, "fill");
    try {
      expect(() =>
        deriveGreaterRealmDomainMaterialAuthority({
          seed: SEED,
          domains: malformed,
        }),
      ).toThrow("GREATER_REALM_GEOLOGY_DOMAIN_ID_INVALID");
      const wipedUint8 = (
        uint8Fill.mock.instances as unknown as Uint8Array[]
      ).filter(
        (values) => values.length === malformed.length || values.length === 7,
      );
      const wipedUint16 = (
        uint16Fill.mock.instances as unknown as Uint16Array[]
      ).filter((values) => values.length === malformed.length);
      expect(wipedUint8.length).toBeGreaterThanOrEqual(2);
      expect(wipedUint16.length).toBeGreaterThanOrEqual(1);
      expect(
        wipedUint8.every((values) => values.every((value) => value === 0)),
      ).toBe(true);
      expect(
        wipedUint16.every((values) => values.every((value) => value === 0)),
      ).toBe(true);
    } finally {
      uint8Fill.mockRestore();
      uint16Fill.mockRestore();
    }
  });

  it("supports explicit retirement of successful private authority arrays", () => {
    const authority = deriveGreaterRealmDomainMaterialAuthority({
      seed: SEED,
      domains: domains(),
    });
    expect(authority.baseThickness.some((value) => value !== 0)).toBe(true);
    expect(authority.rockFamily.some((value) => value !== 0)).toBe(true);
    authority.clear();
    expect(authority.baseThickness.every((value) => value === 0)).toBe(true);
    expect(authority.rockFamily.every((value) => value === 0)).toBe(true);
    expect(
      authority.metrics.rockFamilyCounts.reduce(
        (total, value) => total + value,
        0,
      ),
    ).toBe(domains().length);
  });
});
