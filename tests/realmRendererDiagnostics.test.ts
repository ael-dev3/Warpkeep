import { describe, expect, it } from 'vitest';

import type { RealmRendererFailureCode } from '../src/components/realm/realmRendererRecovery';
import {
  WARPKEEP_RENDERER_SUPPORT_URL,
  canUseStaticRealmFallback,
  readRealmRendererCompatibilitySnapshot,
  realmRendererCompatibilityExplanation,
  realmRendererDiagnostic,
  realmRendererSafeDiagnosticReport,
  shouldRebalanceRealmRendererQuality
} from '../src/components/realm/realmRendererDiagnostics';

const FAILURE_CODES: readonly RealmRendererFailureCode[] = Object.freeze([
  'webgl-unavailable',
  'renderer-construction-failed',
  'context-lost',
  'context-restore-timeout',
  'scene-build-timeout',
  'scene-rebuild-timeout',
  'castle-count-mismatch',
  'castle-prefab-assembly-failed',
  'castle-pairing-failed',
  'castle-compact-load-failed',
  'castle-integrity-failed',
  'scene-build-failed',
  'sync-failed'
]);

describe('Realm renderer player diagnostics', () => {
  it('provides a stable, complete explanation and safety fallback for every failure code', () => {
    const references = new Set<string>();
    for (const code of FAILURE_CODES) {
      const failure = { code, retryable: true, phase: 'loading' as const };
      const diagnostic = realmRendererDiagnostic(failure);
      expect(diagnostic.reference).toMatch(/^WK-GFX-\d{3}$/);
      expect(diagnostic.title.length).toBeGreaterThan(8);
      expect(diagnostic.explanation.length).toBeGreaterThan(30);
      expect(diagnostic.likelyCause.length).toBeGreaterThan(30);
      expect(diagnostic.automaticResponse.length).toBeGreaterThan(30);
      expect(diagnostic.suggestedAction.length).toBeGreaterThan(20);
      expect(canUseStaticRealmFallback(failure)).toBe(true);
      references.add(diagnostic.reference);
    }
    expect(references.size).toBe(FAILURE_CODES.length);
    expect(WARPKEEP_RENDERER_SUPPORT_URL).toBe('https://farcaster.xyz/0xael.eth');
  });

  it('limits automatic quality descent to graphics-pressure failures', () => {
    expect(shouldRebalanceRealmRendererQuality({
      code: 'context-lost', retryable: true, phase: 'ready'
    })).toBe(true);
    expect(shouldRebalanceRealmRendererQuality({
      code: 'scene-rebuild-timeout', retryable: true, phase: 'loading'
    })).toBe(true);
    expect(shouldRebalanceRealmRendererQuality({
      code: 'scene-build-timeout', retryable: true, phase: 'loading'
    })).toBe(true);
    expect(shouldRebalanceRealmRendererQuality({
      code: 'castle-integrity-failed', retryable: false, phase: 'loading'
    })).toBe(false);
    expect(shouldRebalanceRealmRendererQuality({
      code: 'castle-compact-load-failed', retryable: true, phase: 'loading'
    })).toBe(false);
  });

  it('redacts arbitrary exception details from the safe report', () => {
    const hostileMessage = [
      'eyJhbGciOiJIUzI1NiJ9.secret.signature',
      'https://example.invalid/model.glb?token=private',
      '/Users/player/private/file',
      'Mozilla/5.0 SecretAgent',
      'ANGLE (Vendor GPU 1234)'
    ].join(' ');
    const compatibility = readRealmRendererCompatibilitySnapshot({
      webgl2PreviouslyAvailable: true,
      width: 412,
      height: 915,
      devicePixelRatio: 2.625,
      hardwareConcurrency: 4,
      deviceMemory: 4
    });
    const report = realmRendererSafeDiagnosticReport({
      failure: {
        code: 'scene-build-failed',
        retryable: true,
        phase: 'loading',
        message: hostileMessage
      },
      generation: 9,
      attempt: 2,
      maximumAttempts: 2,
      requestedQuality: 'high',
      effectiveQuality: 'reduced',
      emergencyQuality: 'reduced',
      compatibility,
      contextLossCount: 2,
      contextRestoreCount: 1,
      host: 'miniapp'
    });
    expect(report).toContain('WK-GFX-011');
    expect(report).toContain('requested=high');
    expect(report).toContain('active=reduced');
    expect(report).toContain('host=miniapp');
    expect(report).not.toContain(hostileMessage);
    expect(report).not.toMatch(/token=|\/Users\/|Mozilla|ANGLE|Vendor|secret/i);
  });

  it('reports only coarse local compatibility bands and disclaims exact driver diagnosis', () => {
    const snapshot = readRealmRendererCompatibilitySnapshot({
      webgl2Available: false,
      width: 320,
      height: 568,
      devicePixelRatio: 3,
      hardwareConcurrency: 2,
      deviceMemory: 2
    });
    expect(snapshot).toEqual({
      webgl2: 'unavailable',
      viewport: 'compact',
      pixelDensity: 'very-dense',
      capacity: 'limited'
    });
    expect(realmRendererCompatibilityExplanation(snapshot)).toMatch(
      /do not expose a trustworthy graphics-driver version/i
    );
  });
});
