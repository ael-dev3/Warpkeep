import { useId } from 'react';

import { WARPKEEP_BUILD_INFO } from '../../build/buildInfo';
import type { RealmQuality } from './realmQuality';
import {
  WARPKEEP_RENDERER_SUPPORT_URL,
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
  effectiveQuality,
  emergencyQuality,
  everReady,
  failure,
  generation,
  host,
  mode,
  observerMode,
  onRetry,
  onReturn,
  requestedQuality,
  webgl2Available
}: Readonly<{
  attempt: number;
  contextLossCount?: string;
  contextRestoreCount?: string;
  effectiveQuality: RealmQuality;
  emergencyQuality?: RealmQuality;
  everReady: boolean;
  failure?: RealmRendererFailure;
  generation: number;
  host: 'miniapp' | 'web';
  mode: RealmRendererRecoveryPanelMode;
  observerMode: boolean;
  onRetry?: () => void;
  onReturn: () => void;
  requestedQuality: RealmQuality;
  webgl2Available?: boolean;
}>) {
  const titleId = useId();
  const diagnostic = realmRendererDiagnostic(failure);
  const compatibility = readRealmRendererCompatibilitySnapshot({
    webgl2Available: failure?.code === 'webgl-unavailable' ? false : webgl2Available,
    webgl2PreviouslyAvailable: everReady
  });
  const losses = finiteCount(contextLossCount);
  const restores = finiteCount(contextRestoreCount);
  const report = realmRendererSafeDiagnosticReport({
    failure,
    generation,
    attempt,
    maximumAttempts: REALM_RENDERER_MAX_RECOVERY_ATTEMPTS,
    requestedQuality,
    effectiveQuality,
    emergencyQuality,
    compatibility,
    contextLossCount: losses,
    contextRestoreCount: restores,
    host
  });
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
  // A never-capable browser already retains the visible player menu or QA
  // Observer exit beside this read-only overview. Actual stalls and crashes
  // receive an explicit Return action here, so they cannot become endless or
  // depend on discovering another control.
  const showReturn = mode !== 'fallback' || failure?.code !== 'webgl-unavailable';
  const returnLabel = import.meta.env.DEV && observerMode
    ? 'Close QA Observer'
    : 'Return to Menu';

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
            This report stays on your device and contains only the coarse compatibility
            fields shown above—no identity, account, authentication, precise hardware,
            location, or private Realm data.
          </small>
        </div>
      </details>
      <div className="realm-renderer-recovery-panel__actions">
        {onRetry ? (
          <button type="button" onClick={onRetry}>Retry 3D Realm</button>
        ) : null}
        {showReturn ? (
          <button type="button" onClick={onReturn}>
            {returnLabel}
          </button>
        ) : null}
        <a
          href={WARPKEEP_RENDERER_SUPPORT_URL}
          rel="noreferrer noopener"
          target="_blank"
        >
          Contact @0xael.eth
        </a>
      </div>
    </section>
  );
}
