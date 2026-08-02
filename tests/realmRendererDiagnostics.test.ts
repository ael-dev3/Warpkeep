import { describe, expect, it, vi } from 'vitest';

import type { RealmRendererFailureCode } from '../src/components/realm/realmRendererRecovery';
import {
  WARPKEEP_RENDERER_SUPPORT_URL,
  canUseStaticRealmFallback,
  copyRealmRendererDiagnosticReport,
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

  it('emits only the exact privacy-safe renderer support fields', () => {
    const report = realmRendererSafeDiagnosticReport({
      version: '0.3.43',
      buildSha: '0123456789abcdef0123456789abcdef01234567',
      viewportWidth: 412,
      viewportHeight: 915,
      devicePixelRatio: 2.625,
      selectedQuality: 'auto',
      resolvedQuality: 'performance',
      maxTextureSize: 8_192,
      drawingBufferWidth: 1_082,
      drawingBufferHeight: 2_402,
      failureCode: 'scene-build-failed',
      generation: 9,
      contextLossCount: 2,
      contextRestoreCount: 1
    });
    expect(report.split('\n')).toEqual([
      'warpkeep_version=0.3.43',
      'build_sha=0123456789abcdef0123456789abcdef01234567',
      'viewport_css_px=412x915',
      'device_pixel_ratio=2.625',
      'selected_quality=auto',
      'resolved_quality=performance',
      'webgl_max_texture_size=8192',
      'drawing_buffer_px=1082x2402',
      'context_loss_count=2',
      'context_restore_count=1',
      'renderer_generation=9',
      'failure_code=scene-build-failed'
    ]);
    expect(report).not.toMatch(
      /fid|token|username|cookie|url|user.?agent|mozilla|angle|private.realm|host=/i
    );
  });

  it('copies only after an explicit call and fails safely when clipboard access is blocked', async () => {
    const report = 'warpkeep_version=0.3.43';
    const writeText = vi.fn(async () => undefined);
    expect(writeText).not.toHaveBeenCalled();
    await expect(copyRealmRendererDiagnosticReport(report, { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(report);

    const blockedWriter = {
      writeText: vi.fn(async () => {
        throw new DOMException('Clipboard permission denied.', 'NotAllowedError');
      })
    };
    await expect(copyRealmRendererDiagnosticReport(report, blockedWriter)).resolves.toBe(false);
    expect(blockedWriter.writeText).toHaveBeenCalledOnce();
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
