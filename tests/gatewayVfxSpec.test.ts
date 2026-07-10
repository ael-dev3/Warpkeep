import { describe, expect, it } from 'vitest';
import { gatewayInteractionDefaults } from '../src/components/title/gatewayInteraction';
import {
  calculateGatewayActivationEnvelope,
  calculateGatewayVfxResponse,
  createGatewayParticleAttributes,
  gatewayActivationSpec,
  gatewayParticleBehavior,
  gatewayParticleSpec,
  gatewayVfxQualitySpecs,
  gatewayVfxResponseSpec,
  selectGatewayVfxQuality
} from '../src/components/title/gatewayVfxSpec';
import { titleSceneSpec } from '../src/components/title/titleSceneSpec';

describe('gateway VFX specification', () => {
  it('keeps each quality profile inside its intended visual and draw-call budget', () => {
    const { high, compact, reduced } = gatewayVfxQualitySpecs;

    expect(high.particleCount).toBeGreaterThanOrEqual(300);
    expect(high.particleCount).toBeLessThanOrEqual(500);
    expect(high.ribbonCount).toBeGreaterThanOrEqual(3);
    expect(high.ribbonCount).toBeLessThanOrEqual(5);
    expect(high.maxNewDrawCalls).toBeLessThanOrEqual(6);
    expect(high.pointerDistortionEnabled).toBe(true);
    expect(high.starDistortionEnabled).toBe(true);
    expect(high.shockwaveEnabled).toBe(true);

    expect(compact.particleCount).toBeGreaterThanOrEqual(100);
    expect(compact.particleCount).toBeLessThanOrEqual(180);
    expect(compact.ribbonCount).toBeGreaterThanOrEqual(1);
    expect(compact.ribbonCount).toBeLessThanOrEqual(2);
    expect(compact.ribbonSegments).toBeLessThan(high.ribbonSegments);
    expect(compact.noiseOctaves).toBeLessThan(high.noiseOctaves);
    expect(compact.maxNewDrawCalls).toBeLessThanOrEqual(4);

    expect(reduced.particleCount).toBeLessThan(compact.particleCount);
    expect(reduced.ribbonCount).toBe(1);
    expect(reduced.pointerDistortionEnabled).toBe(false);
    expect(reduced.starDistortionEnabled).toBe(false);
    expect(reduced.shockwaveEnabled).toBe(false);

    Object.values(gatewayVfxQualitySpecs).forEach((profile) => {
      expect(profile.particleCount).toBeGreaterThanOrEqual(0);
      expect(profile.ribbonCount).toBeGreaterThanOrEqual(0);
      expect(profile.ribbonSegments).toBeGreaterThanOrEqual(0);
      expect(profile.filamentCount).toBeGreaterThanOrEqual(0);
      expect(profile.filamentSegments).toBeGreaterThanOrEqual(0);
      expect(profile.noiseOctaves).toBeGreaterThanOrEqual(0);
    });
  });

  it('selects quality from reduced-motion, viewport, and renderer capability', () => {
    expect(selectGatewayVfxQuality({
      viewportWidth: 1_920,
      viewportHeight: 1_080,
      rendererMaxTextureSize: 8_192
    })).toBe('high');
    expect(selectGatewayVfxQuality({
      viewportWidth: 768,
      viewportHeight: 1_024,
      rendererMaxTextureSize: 8_192
    })).toBe('compact');
    expect(selectGatewayVfxQuality({
      viewportWidth: 1_440,
      viewportHeight: 900,
      rendererMaxTextureSize: 2_048
    })).toBe('compact');
    expect(selectGatewayVfxQuality({
      viewportWidth: 1_440,
      viewportHeight: 900,
      supportsHighpFragment: false
    })).toBe('compact');
    expect(selectGatewayVfxQuality({
      viewportWidth: 1_920,
      viewportHeight: 1_080,
      reducedMotion: true
    })).toBe('reduced');
    expect(selectGatewayVfxQuality({
      viewportWidth: Number.NaN,
      viewportHeight: Number.POSITIVE_INFINITY
    })).toBe('compact');
  });

  it('uses restrained linear light and thickness with nonlinear motion and turbulence', () => {
    const idle = calculateGatewayVfxResponse(0);
    const half = calculateGatewayVfxResponse(0.5);
    const maximum = calculateGatewayVfxResponse(1);

    expect(half.orbitSpeed - idle.orbitSpeed).toBeCloseTo(
      (maximum.orbitSpeed - idle.orbitSpeed) * 0.25,
      8
    );
    expect(half.turbulence - idle.turbulence).toBeCloseTo(
      (maximum.turbulence - idle.turbulence) * 0.125,
      8
    );
    expect(maximum.brightness).toBeLessThanOrEqual(gatewayVfxResponseSpec.maximumBrightness);
    expect(maximum.rayThickness).toBeLessThanOrEqual(gatewayVfxResponseSpec.maximumRayThickness);
    expect(maximum.rayThickness / idle.rayThickness).toBeLessThanOrEqual(1.12);
    expect(maximum.orbitSpeed / idle.orbitSpeed).toBeGreaterThan(10);
  });

  it('gates pointer bend and distortion and focuses the eye subtly', () => {
    const low = calculateGatewayVfxResponse(0.3);
    const middle = calculateGatewayVfxResponse(0.6);
    const high = calculateGatewayVfxResponse(1);

    expect(low.pointerBend).toBe(0);
    expect(low.localDistortion).toBe(0);
    expect(low.eyeFocus).toBeGreaterThan(0);
    expect(middle.pointerBend).toBeGreaterThan(0);
    expect(middle.localDistortion).toBeGreaterThan(0);
    expect(high.pointerBend).toBe(gatewayVfxResponseSpec.maximumPointerBend);
    expect(high.localDistortion).toBe(gatewayVfxResponseSpec.maximumLocalDistortion);
    expect(high.eyeFocus).toBe(gatewayVfxResponseSpec.maximumEyeFocus);
  });

  it('clamps malformed proximity and keeps reduced-motion response calm and finite', () => {
    expect(calculateGatewayVfxResponse(Number.NaN)).toEqual(calculateGatewayVfxResponse(0));
    expect(calculateGatewayVfxResponse(Number.NEGATIVE_INFINITY)).toEqual(
      calculateGatewayVfxResponse(0)
    );
    expect(calculateGatewayVfxResponse(10)).toEqual(calculateGatewayVfxResponse(1));
    expect(calculateGatewayVfxResponse(-10)).toEqual(calculateGatewayVfxResponse(0));

    const high = calculateGatewayVfxResponse(1, 'high');
    const reduced = calculateGatewayVfxResponse(1, 'reduced');
    expect(reduced.orbitSpeed).toBeLessThan(high.orbitSpeed * 0.15);
    expect(reduced.turbulence).toBeLessThan(high.turbulence * 0.1);
    expect(reduced.pointerBend).toBe(0);
    expect(reduced.localDistortion).toBe(0);
    Object.values(reduced).forEach((value) => expect(Number.isFinite(value)).toBe(true));
  });

  it('defines the typed 1.6 second intake, focus, rupture, and settle choreography', () => {
    expect(gatewayActivationSpec.durationSeconds).toBe(1.6);
    expect(titleSceneSpec.gateway.surgeDurationSeconds).toBe(
      gatewayActivationSpec.durationSeconds
    );
    expect(gatewayInteractionDefaults.surgeDurationSeconds).toBe(
      gatewayActivationSpec.durationSeconds
    );
    expect(calculateGatewayActivationEnvelope(-0.01).phase).toBe('idle');
    expect(calculateGatewayActivationEnvelope(0.06).phase).toBe('intake');
    expect(calculateGatewayActivationEnvelope(0.18).phase).toBe('focus');
    expect(calculateGatewayActivationEnvelope(0.5).phase).toBe('rupture');
    expect(calculateGatewayActivationEnvelope(1.1).phase).toBe('settle');
    expect(calculateGatewayActivationEnvelope(1.6).phase).toBe('idle');

    const intake = calculateGatewayActivationEnvelope(0.06);
    const rupture = calculateGatewayActivationEnvelope(0.5);
    const earlySettle = calculateGatewayActivationEnvelope(0.95);
    const lateSettle = calculateGatewayActivationEnvelope(1.5);
    const justBeforeSettle = calculateGatewayActivationEnvelope(0.8999);
    const settleBoundary = calculateGatewayActivationEnvelope(0.9);
    expect(intake.compression).toBeGreaterThan(0);
    expect(intake.outerLuminanceScale).toBeLessThan(1);
    expect(rupture.shockwave).toBeGreaterThan(0);
    expect(rupture.particlePeel).toBeGreaterThan(0);
    expect(rupture.outerLuminanceScale).toBeLessThanOrEqual(1.12);
    expect(earlySettle.settle).toBeGreaterThan(lateSettle.settle);
    expect(earlySettle.eyeFocus).toBeGreaterThan(lateSettle.eyeFocus);
    expect(earlySettle.distortion).toBeGreaterThan(lateSettle.distortion);
    expect(earlySettle.particlePeel).toBeGreaterThan(lateSettle.particlePeel);
    expect(settleBoundary.eyeFocus).toBeCloseTo(justBeforeSettle.eyeFocus, 3);
    expect(settleBoundary.distortion).toBeCloseTo(justBeforeSettle.distortion, 3);
    expect(settleBoundary.particlePeel).toBeCloseTo(justBeforeSettle.particlePeel, 3);
    expect(settleBoundary.outerLuminanceScale).toBeCloseTo(
      justBeforeSettle.outerLuminanceScale,
      3
    );
  });

  it('keeps activation outputs finite, bounded, and inactive outside the sequence', () => {
    [-1, 0, 0.12, 0.25, 0.3, 0.9, 1.59, 1.6, 10, Number.NaN, Number.POSITIVE_INFINITY]
      .forEach((time) => {
        const envelope = calculateGatewayActivationEnvelope(time);
        expect(envelope.progress).toBeGreaterThanOrEqual(0);
        expect(envelope.progress).toBeLessThanOrEqual(1);
        [
          envelope.intake,
          envelope.focus,
          envelope.rupture,
          envelope.settle,
          envelope.compression,
          envelope.eyeFocus,
          envelope.shockwave,
          envelope.distortion,
          envelope.particlePeel
        ].forEach((value) => {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        });
        expect(envelope.outerLuminanceScale).toBeGreaterThanOrEqual(0.88);
        expect(envelope.outerLuminanceScale).toBeLessThanOrEqual(1.12);
      });

    const complete = calculateGatewayActivationEnvelope(2);
    expect(complete.phase).toBe('idle');
    expect(complete.progress).toBe(1);
    expect(complete.rupture).toBe(0);
    expect(complete.outerLuminanceScale).toBe(1);
  });

  it('generates deterministic GPU particle attributes with the expected typed-array lengths', () => {
    const first = createGatewayParticleAttributes(420, 91);
    const second = createGatewayParticleAttributes(420, 91);

    expect(first).toEqual(second);
    expect(first.initialAngles).toBeInstanceOf(Float32Array);
    expect(first.radii).toBeInstanceOf(Float32Array);
    expect(first.orbitalSpeeds).toBeInstanceOf(Float32Array);
    expect(first.radialDrifts).toBeInstanceOf(Float32Array);
    expect(first.phases).toBeInstanceOf(Float32Array);
    expect(first.verticalOffsets).toBeInstanceOf(Float32Array);
    expect(first.sizes).toBeInstanceOf(Float32Array);
    expect(first.brightness).toBeInstanceOf(Float32Array);
    expect(first.behaviorTypes).toBeInstanceOf(Uint8Array);
    Object.values(first).forEach((attribute) => expect(attribute).toHaveLength(420));
  });

  it('bounds every particle attribute and preserves a majority-infall behavior mix', () => {
    const attributes = createGatewayParticleAttributes(1_000, 19);
    const bounds = gatewayParticleSpec.bounds;
    const behaviorCounts = { infall: 0, orbit: 0, escape: 0 };

    for (let index = 0; index < attributes.radii.length; index += 1) {
      const behavior = attributes.behaviorTypes[index];
      const drift = attributes.radialDrifts[index];
      expect(attributes.initialAngles[index]).toBeGreaterThanOrEqual(0);
      expect(attributes.initialAngles[index]).toBeLessThanOrEqual(Math.PI * 2);
      expect(attributes.radii[index]).toBeGreaterThanOrEqual(bounds.radius.minimum - 1e-6);
      expect(attributes.radii[index]).toBeLessThanOrEqual(bounds.radius.maximum);
      expect(Math.abs(attributes.orbitalSpeeds[index])).toBeGreaterThanOrEqual(
        bounds.orbitalSpeedMagnitude.minimum - 1e-6
      );
      expect(Math.abs(attributes.orbitalSpeeds[index])).toBeLessThanOrEqual(
        bounds.orbitalSpeedMagnitude.maximum + 1e-6
      );
      expect(attributes.verticalOffsets[index]).toBeGreaterThanOrEqual(
        bounds.verticalOffset.minimum - 1e-6
      );
      expect(attributes.verticalOffsets[index]).toBeLessThanOrEqual(
        bounds.verticalOffset.maximum + 1e-6
      );
      expect(attributes.sizes[index]).toBeGreaterThanOrEqual(bounds.size.minimum - 1e-6);
      expect(attributes.sizes[index]).toBeLessThanOrEqual(bounds.size.maximum + 1e-6);
      expect(attributes.brightness[index]).toBeGreaterThanOrEqual(
        bounds.brightness.minimum - 1e-6
      );
      expect(attributes.brightness[index]).toBeLessThanOrEqual(
        bounds.brightness.maximum + 1e-6
      );

      if (behavior === gatewayParticleBehavior.infall) {
        behaviorCounts.infall += 1;
        expect(drift).toBeLessThan(0);
      } else if (behavior === gatewayParticleBehavior.orbit) {
        behaviorCounts.orbit += 1;
        expect(drift).toBeGreaterThanOrEqual(bounds.orbitDrift.minimum - 1e-6);
        expect(drift).toBeLessThanOrEqual(bounds.orbitDrift.maximum + 1e-6);
      } else {
        behaviorCounts.escape += 1;
        expect(drift).toBeGreaterThan(0);
      }
    }

    expect(behaviorCounts).toEqual({ infall: 720, orbit: 200, escape: 80 });
  });

  it('sanitizes particle counts and caps allocation size', () => {
    expect(createGatewayParticleAttributes(-20).radii).toHaveLength(0);
    expect(createGatewayParticleAttributes(Number.NaN).radii).toHaveLength(0);
    expect(createGatewayParticleAttributes(Number.POSITIVE_INFINITY).radii).toHaveLength(0);
    expect(createGatewayParticleAttributes(4.9).radii).toHaveLength(4);
    expect(createGatewayParticleAttributes(1_000_000).radii).toHaveLength(
      gatewayParticleSpec.maximumCount
    );
  });
});
