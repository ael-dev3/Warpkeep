import { REALM_PREVAILING_WIND } from '../../game/map/realmPrevailingWind';

export const REALM_LIVING_ENVIRONMENT_REVISION = 'living-realm-v1';

export type RealmLivingEnvironmentSample = {
  timeSeconds: number;
  windX: number;
  windZ: number;
  gust: number;
};

function finiteSeconds(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Renderer-neutral counterpart to the GLSL gust function below. It is useful
 * for deterministic planning and tests; renderers still advance it only from
 * the existing Realm ambient scheduler.
 */
export function sampleRealmLivingEnvironment(
  seconds: number,
  worldX: number,
  worldZ: number,
  target: RealmLivingEnvironmentSample
) {
  const safeSeconds = finiteSeconds(seconds);
  const safeX = Number.isFinite(worldX) ? worldX : 0;
  const safeZ = Number.isFinite(worldZ) ? worldZ : 0;
  const alongWind = safeX * REALM_PREVAILING_WIND.x
    + safeZ * REALM_PREVAILING_WIND.z;
  const acrossWind = safeX * -REALM_PREVAILING_WIND.z
    + safeZ * REALM_PREVAILING_WIND.x;
  const front = Math.sin(alongWind * 0.21 - safeSeconds * 0.34);
  const secondary = Math.sin(acrossWind * 0.087 + safeSeconds * 0.19 + 1.7);
  const shapedFront = Math.max(0, Math.min(1, (front + 0.64) / 1.46));
  target.timeSeconds = safeSeconds;
  target.windX = REALM_PREVAILING_WIND.x;
  target.windZ = REALM_PREVAILING_WIND.z;
  target.gust = Math.max(0, Math.min(1, shapedFront * 0.82 + (secondary * 0.5 + 0.5) * 0.18));
  return target;
}

const finiteGlslFloatLiteral = (value: number) => {
  const literal = Number.isFinite(value) ? value.toFixed(9) : '0.0';
  return literal.includes('.') ? literal : `${literal}.0`;
};

export const REALM_LIVING_WIND_GLSL = `vec2(${finiteGlslFloatLiteral(
  REALM_PREVAILING_WIND.x
)}, ${finiteGlslFloatLiteral(REALM_PREVAILING_WIND.z)})`;

/** Shared bounded gust field injected into existing subsystem materials. */
export const REALM_LIVING_GUST_GLSL = `
float realmLivingGust(vec2 worldXZ, float livingTime) {
  vec2 livingWind = ${REALM_LIVING_WIND_GLSL};
  vec2 livingCross = vec2(-livingWind.y, livingWind.x);
  float livingFront = sin(dot(worldXZ, livingWind) * 0.21 - livingTime * 0.34);
  float livingSecondary = sin(dot(worldXZ, livingCross) * 0.087 + livingTime * 0.19 + 1.7);
  float livingShapedFront = clamp((livingFront + 0.64) / 1.46, 0.0, 1.0);
  return clamp(livingShapedFront * 0.82 + (livingSecondary * 0.5 + 0.5) * 0.18, 0.0, 1.0);
}
`;
