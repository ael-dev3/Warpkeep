export const GREATER_REALM_ATMOSPHERE_VERSION =
  'greater-realm-height-atmosphere-v1' as const;

export type GreaterRealmHeightFogInput = Readonly<{
  /** Camera height above the configured fog datum, in terrain-height units. */
  originHeight: number;
  /** Surface height minus camera height, in terrain-height units. */
  rayHeightDelta: number;
  /** Length of the camera-to-surface ray in terrain-height units. */
  rayLength: number;
  /** Density at the fog datum, in inverse terrain-height units. */
  density: number;
  /** Exponential density falloff with height, in inverse terrain-height units. */
  heightFalloff: number;
}>;

export type GreaterRealmAtmosphereCompositeInput = Readonly<{
  scene: readonly [number, number, number];
  haze: readonly [number, number, number];
  extinction: number;
  inScattering: number;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function saturate(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Analytically integrate an exponentially thinning fog layer along a camera
 * ray. Keeping this as a presentation-only helper prevents atmosphere from
 * becoming terrain, visibility, or gameplay authority.
 */
export function integrateGreaterRealmHeightFog(
  input: GreaterRealmHeightFogInput,
): number {
  if (
    !Number.isFinite(input.originHeight) ||
    !Number.isFinite(input.rayHeightDelta) ||
    !Number.isFinite(input.rayLength) ||
    !Number.isFinite(input.density) ||
    !Number.isFinite(input.heightFalloff) ||
    input.rayLength < 0 ||
    input.density < 0 ||
    input.heightFalloff < 0 ||
    Math.abs(input.rayHeightDelta) >
      input.rayLength + Math.max(1e-9, input.rayLength * 1e-12)
  )
    fail('GREATER_REALM_HEIGHT_FOG_INPUT_INVALID');
  if (input.rayLength === 0 || input.density === 0) return 0;

  const originDensity = Math.exp(
    Math.max(-40, Math.min(40, -input.originHeight * input.heightFalloff)),
  );
  const verticalExponent = Math.max(
    -40,
    Math.min(40, input.heightFalloff * input.rayHeightDelta),
  );
  const heightIntegral =
    Math.abs(verticalExponent) < 1e-6
      ? 1
      : -Math.expm1(-verticalExponent) / verticalExponent;
  const opticalDepth =
    input.rayLength * originDensity * heightIntegral * input.density;
  const factor = 1 - Math.exp(-Math.max(0, Math.min(80, opticalDepth)));

  // The squared response keeps nearby terrain crisp while allowing distant
  // valleys to accumulate a visibly substantial atmosphere layer.
  return saturate(factor * factor);
}

/**
 * Composite atmosphere as two independent physical-looking terms:
 * extinction removes scene radiance, while in-scattering adds sky radiance.
 */
export function compositeGreaterRealmAtmosphere(
  input: GreaterRealmAtmosphereCompositeInput,
): readonly [number, number, number] {
  if (
    input.scene.length !== 3 ||
    input.haze.length !== 3 ||
    !Number.isFinite(input.extinction) ||
    !Number.isFinite(input.inScattering) ||
    input.scene.some((value) => !Number.isFinite(value)) ||
    input.haze.some((value) => !Number.isFinite(value))
  )
    fail('GREATER_REALM_ATMOSPHERE_COMPOSITE_INVALID');
  const extinction = saturate(input.extinction);
  const inScattering = saturate(input.inScattering);
  return Object.freeze(
    input.scene.map((channel, index) =>
      Math.round(
        Math.max(
          0,
          Math.min(
            255,
            channel * (1 - extinction) + input.haze[index]! * inScattering,
          ),
        ),
      ),
    ) as [number, number, number],
  );
}
