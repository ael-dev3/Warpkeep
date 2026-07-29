/**
 * Renderer-neutral prevailing wind used by static regional climate fields.
 *
 * The direction is the normalized form of the existing Lowlands grass wind
 * vector (0.78, 0.62). Keeping the values here lets later presentation layers
 * share one world-space convention without changing the established grass
 * direction.
 */
const WIND_LENGTH = Math.hypot(0.78, 0.62);

export const REALM_PREVAILING_WIND = Object.freeze({
  x: 0.78 / WIND_LENGTH,
  z: 0.62 / WIND_LENGTH
});
