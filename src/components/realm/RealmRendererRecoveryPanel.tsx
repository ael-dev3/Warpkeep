import { useEffect, useId, useRef, useState } from 'react';

import { WARPKEEP_BUILD_INFO } from '../../build/buildInfo';
import type { GraphicsPreference } from '../../settings/graphicsPreference';
import type { RealmQuality } from './realmQuality';
import {
  WARPKEEP_RENDERER_SUPPORT_URL,
  copyRealmRendererDiagnosticReport,
  readRealmRendererCompatibilitySnapshot,
  realmRendererCompatibilityExplanation,
  realmRendererDiagnostic,
  realmRendererSafeDiagnosticReport
} from './realmRendererDiagnostics';
import {
  REALM_RENDERER_MAX_RECOVERY_ATTEMPTS,
  type RealmRendererFailure
} from './realmRendererRecovery';

export type RealmRendererRecoveryPanelMode = 'recovering' | 'failed' | 'fallback';

function finiteCount(value: string | undefined) {
  if (!value || !/^\d{1,9}$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export function RealmRendererRecoveryPanel({
  attempt,
  contextLossCount,
  contextRestoreCount,
  drawingBufferHeight,
  drawingBufferWidth,
  effectiveQuality,
  everReady,
  failure,
  generation,
  maxTextureSize,
  mode,
  onReturn,
  onTryPerformance,
  selectedQuality,
  webgl2Available
}: Readonly<{
  attempt: number;
  contextLossCount?: string;
  contextRestoreCount?: string;
  drawingBufferHeight?: number;
  drawingBufferWidth?: number;
  effectiveQuality: RealmQuality;
  everReady: boolean;
  failure?: RealmRendererFailure;
  generation: number;
  maxTextureSize?: number;
  mode: RealmRendererRecoveryPanelMode;
  onReturn: () => void;
  onTryPerformance?: () => void;
  selectedQuality: GraphicsPreference;
  webgl2Available?: boolean;
}>) {
  const titleId = useId();
  const manualCopyRef = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const diagnostic = realmRendererDiagnostic(failure);
  const compatibility = readRealmRendererCompatibilitySnapshot({
    webgl2Available: failure?.code === 'webgl-unavailable' ? false : webgl2Available,
    webgl2PreviouslyAvailable: everReady
  });
  const losses = finiteCount(contextLossCount);
  const restores = finiteCount(contextRestoreCount);
  const visualViewport = typeof window === 'undefined' ? undefined : window.visualViewport;
  const viewportWidth = visualViewport?.width
    ?? (typeof window === 'undefined' ? undefined : window.innerWidth);
  const viewportHeight = visualViewport?.height
    ?? (typeof window === 'undefined' ? undefined : window.innerHeight);
  const resolvedQuality = effectiveQuality === 'high'
    ? 'cinematic'
    : effectiveQuality === 'balanced'
      ? 'balanced'
      : 'performance';
  const report = realmRendererSafeDiagnosticReport({
    version: WARPKEEP_BUILD_INFO.version,
    buildSha: WARPKEEP_BUILD_INFO.fullSha ?? WARPKEEP_BUILD_INFO.shortSha,
    viewportWidth,
    viewportHeight,
    devicePixelRatio: typeof window === 'undefined' ? undefined : window.devicePixelRatio,
    selectedQuality,
    resolvedQuality,
    maxTextureSize,
    drawingBufferWidth,
    drawingBufferHeight,
    failureCode: failure?.code,
    generation,
    contextLossCount: losses,
    contextRestoreCount: restores
  });
  const copyDiagnostics = async () => {
    const copied = await copyRealmRendererDiagnosticReport(report);
    setCopyState(copied ? 'copied' : 'manual');
  };
  useEffect(() => {
    setCopyState('idle');
  }, [report]);
  useEffect(() => {
    if (copyState !== 'manual') return;
    manualCopyRef.current?.focus();
    manualCopyRef.current?.select();
  }, [copyState]);
  const title = mode === 'recovering'
    ? 'RESTORING THE REALM…'
    : mode === 'fallback'
      ? '2D SAFETY VIEW ACTIVE'
      : 'THE REALM COULD NOT BE RESTORED';
  const repairStatus = mode === 'recovering'
    ? attempt > 0
      ? `Automatic repair ${Math.min(attempt, REALM_RENDERER_MAX_RECOVERY_ATTEMPTS)} of ${REALM_RENDERER_MAX_RECOVERY_ATTEMPTS} is running at ${effectiveQuality} quality.`
      : `Warpkeep is preparing a bounded repair at ${effectiveQuality} quality.`
    : mode === 'fallback'
      ? 'Warpkeep stopped the unstable 3D renderer and preserved a lightweight, read-only overview of the canonical Realm.'
      : 'The bounded automatic repair ended without publishing an incomplete 3D scene.';
  return (
    <section
      aria-labelledby={titleId}
      className={`realm-renderer-recovery-panel realm-renderer-recovery-panel--${mode}`}
      data-renderer-diagnostic-reference={diagnostic.reference}
    >
      <strong id={titleId} role={mode === 'failed' ? 'alert' : 'status'}>{title}</strong>
      <p className="realm-renderer-recovery-panel__summary">
        {diagnostic.explanation}
      </p>
      <dl className="realm-renderer-recovery-panel__status">
        <div>
          <dt>Reason</dt>
          <dd>{diagnostic.title}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd><code>{diagnostic.reference}</code></dd>
        </div>
        <div>
          <dt>Current response</dt>
          <dd>{repairStatus}</dd>
        </div>
      </dl>
      <details className="realm-renderer-recovery-panel__details" open>
        <summary>Device and recovery details</summary>
        <div>
          <p><b>What may have caused it:</b> {diagnostic.likelyCause}</p>
          <p><b>What Warpkeep is doing:</b> {diagnostic.automaticResponse}</p>
          <p><b>Compatibility assessment:</b> {realmRendererCompatibilityExplanation(compatibility)}</p>
          <p><b>What you can do:</b> {diagnostic.suggestedAction}</p>
          <p>
            <b>Public build:</b>{' '}
            ALPHA {WARPKEEP_BUILD_INFO.version} · BUILD {WARPKEEP_BUILD_INFO.shortSha}
          </p>
          <code className="realm-renderer-recovery-panel__report">{report}</code>
          <small>
            Diagnostics stay on this device unless you choose to share them. The copy
            contains only the allowlisted renderer facts shown above—no identity,
            account, authentication, URL, location, or private Realm data.
          </small>
        </div>
      </details>
      <div className="realm-renderer-recovery-panel__actions">
        {onTryPerformance ? (
          <button type="button" onClick={onTryPerformance}>TRY PERFORMANCE MODE</button>
        ) : null}
        <button type="button" onClick={copyDiagnostics}>COPY DIAGNOSTICS</button>
        <button type="button" onClick={onReturn}>RETURN TO MENU</button>
        <a
          href={WARPKEEP_RENDERER_SUPPORT_URL}
          rel="noreferrer noopener"
          target="_blank"
        >
          REPORT A PROBLEM
        </a>
      </div>
      {copyState === 'copied' ? (
        <small aria-live="polite" role="status">Diagnostics copied.</small>
      ) : null}
      {copyState === 'manual' ? (
        <label className="realm-renderer-recovery-panel__manual-copy">
          Clipboard access is unavailable. Copy this local report manually.
          <textarea
            aria-label="Renderer diagnostics for manual copy"
            readOnly
            ref={manualCopyRef}
            value={report}
          />
        </label>
      ) : null}
    </section>
  );
}
