import {
  Suspense,
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref
} from 'react';

import type {
  AccessRequestViewState,
  FarcasterAdmissionCheckViewState,
  FarcasterAuthViewState,
  VerifiedFarcasterIdentity
} from '../../farcaster/farcasterAuthTypes';
import { WARPKEEP_FARCASTER_CHANNEL_URL } from '../../farcaster/farcasterProjectLinks';
import {
  AlphaParticipationTermsDialog,
  type AlphaParticipationTermsContinueLabel
} from './AlphaParticipationTermsDialog';
import { CreditsRoll } from './CreditsRoll';
import { LatestPatchNotesPopover } from './LatestPatchNotesPopover';
import { MenuDevelopmentNotice } from './MenuDevelopmentNotice';
import { RealmChoiceSelector } from './RealmChoiceSelector';
import { SettingsPanel } from './SettingsPanel';
import {
  WarpkeepBuildStamp,
  type WarpkeepPatchNotesState
} from './WarpkeepBuildStamp';
import { menuCommands, type MenuCommand, type MenuCommandId } from './menuCommands';
import {
  GENESIS_001_ID,
  GENESIS_002_ID,
  GENESIS_002_SEALED_NOTICE,
  NEW_ADMISSIONS_SUSPENDED,
  PTR_ID,
  PTR_DIRECTORY_ONLY_NOTICE,
  PTR_NOT_ADMITTED_NOTICE,
  PTR_UNKNOWN_NOTICE,
  getRealmChoices,
  type PtrRealmAuthority,
  type RealmId
} from './realmChoicePolicy';
import {
  DEFAULT_WARPKEEP_REPOSITORY_URL,
  WARPKEEP_BUILD_INFO,
  type WarpkeepBuildInfo
} from '../../build/buildInfo';
import {
  DEFAULT_GRAPHICS_PREFERENCE,
  type GraphicsPreference,
  type GraphicsQualityTier
} from '../../settings/graphicsPreference';
import './WarpkeepMainMenu.css';

export type MenuInputModality = 'keyboard' | 'pointer' | 'touch' | 'unknown';

export type AuthRailRenderControls = Readonly<{
  headingRef: Ref<HTMLHeadingElement>;
  primaryActionRef: Ref<HTMLButtonElement>;
  onCheckAgain: () => void;
  onBackToMenu: () => void;
  onPresentationReady: () => void;
}>;

export type WarpkeepMainMenuProps = {
  active: boolean;
  visible?: boolean;
  interactive?: boolean;
  onRequestReturn: () => void;
  /** When supplied, ENTER REALM opens the live realm foundation instead of its legacy notice. */
  onRequestEnterRealm?: () => void;
  /** Blocks SIWF when the public shared-alpha configuration is intentionally inactive. */
  backendUnavailableMessage?: string;
  authState?: FarcasterAuthViewState;
  onRequestFarcasterSignIn?: () => void;
  onCancelFarcasterSignIn?: () => void;
  /** Lifecycle-only cancellation; unlike a player cancellation it preserves a route intent. */
  onDisposeFarcasterSignIn?: () => void;
  onRetryFarcasterSignIn?: () => void;
  onPrepareFarcasterQrCode?: () => void;
  /**
   * Explicit Enter Realm preflight that may restore only an existing HttpOnly
   * session. It never starts SIWF or prepares a QR code.
   */
  onRestoreFarcasterSession?: () => Promise<boolean>;
  onRefreshFarcasterSession?: () => void;
  accessRequest?: AccessRequestViewState;
  admissionCheck?: FarcasterAdmissionCheckViewState;
  onCheckFarcasterAdmission?: () => boolean;
  onRequestAccess?: () => boolean;
  onRetryAccessRequestStatus?: () => void;
  onSignOut?: () => void;
  rememberDevice?: boolean;
  onRememberDeviceChange?: (remember: boolean) => void;
  onRequestAuthenticatedRealm?: (identity: VerifiedFarcasterIdentity) => void;
  /** Server-provider authority for PTR. Omission and unknown both fail closed. */
  ptrRealmAuthority?: PtrRealmAuthority;
  /** True while the PTR provider is checking or preparing a connection. */
  ptrRealmBusy?: boolean;
  /** Optional provider refresh triggered when the dedicated realm panel opens. */
  onCheckRealmAccess?: () => void;
  /** Revokes any checked or pending PTR authority when its intent is dismissed. */
  onCancelPtrRealm?: () => void;
  /** Distinct PTR entry boundary. It is never used for Genesis 001. */
  onRequestPtrRealm?: () => void;
  /** Fired only after the player checks and submits the Alpha Terms dialog. */
  onAcceptAlphaTermsAttempt?: () => void;
  /**
   * Memory-only proof that this exact authenticated session already recorded
   * the current entry agreement. It permits repeat entry without another box.
   */
  entryAgreementSatisfied?: boolean;
  /** The authenticated backend confirmed that the current agreement is absent. */
  entryAgreementRequired?: boolean;
  /** Renders an admission rail whose retry is owned by the Terms gate. */
  renderAuthRailContent?: (controls: AuthRailRenderControls) => ReactNode;
  onRequestAuthRailCheck?: () => void;
  authRailAttemptFailed?: boolean;
  /** @deprecated Route state must never bypass intentional Terms acceptance. */
  openFarcasterAuthPanel?: boolean;
  inputModality?: MenuInputModality;
  focusFirstCommand?: boolean;
  buildInfo?: WarpkeepBuildInfo;
  onVideoReady?: () => void;
  onVideoError?: () => void;
  noticeDurationMs?: number;
  graphicsPreference?: GraphicsPreference;
  resolvedGraphicsQuality?: GraphicsQualityTier;
  onGraphicsPreferenceChange?: (preference: GraphicsPreference) => void;
  audioMuted?: boolean;
  onAudioMutedChange?: (muted: boolean) => void;
};

type ActiveNotice = {
  command: MenuCommand;
  notice?: string;
  anchorElement: HTMLButtonElement;
  refreshKey: number;
};

type MenuSurface = 'commands' | 'realm-choice' | 'farcaster-auth' | 'settings' | 'credits';

type TermsContinuation =
  | 'begin-sign-in'
  | 'retry-sign-in'
  | 'refresh-session'
  | 'check-auth-rail'
  | 'enter-authenticated'
  | 'legacy-enter';

type TermsRequest = {
  continuation: TermsContinuation;
  keyboardDriven: boolean;
};

type SessionRestoreRequest = {
  sequence: number;
  keyboardDriven: boolean;
};

function termsContinueLabel(
  continuation: TermsContinuation | undefined
): AlphaParticipationTermsContinueLabel {
  if (continuation === 'enter-authenticated' || continuation === 'legacy-enter') {
    return 'CONTINUE TO REALM';
  }
  if (
    continuation === 'refresh-session'
    || continuation === 'check-auth-rail'
  ) {
    return 'CONTINUE TO ACCESS CHECK';
  }
  return 'CONTINUE TO SIGN-IN';
}

const ANONYMOUS_AUTH_STATE: FarcasterAuthViewState = Object.freeze({
  phase: 'anonymous'
});
const PATCH_NOTES_POINTER_LEAVE_DELAY_MS = 360;
const SESSION_RESTORE_COMPACT_THRESHOLD_MS = 360;

const FarcasterIdentityBadge = lazy(async () => {
  const module = await import('../auth/FarcasterIdentityBadge');
  return { default: module.FarcasterIdentityBadge };
});

const FarcasterQrAuthPanel = lazy(async () => {
  const module = await import('../auth/FarcasterQrAuthPanel');
  return { default: module.FarcasterQrAuthPanel };
});

function FarcasterAuthPanelFallback({
  headingRef,
  primaryActionRef,
  onCancel,
  eyebrow = 'FARCASTER SIGN-IN',
  heading = 'CLAIM YOUR KEEP',
  statusMessage = 'Preparing sign-in'
}: {
  headingRef: Ref<HTMLHeadingElement>;
  primaryActionRef: Ref<HTMLButtonElement>;
  onCancel: () => void;
  eyebrow?: string;
  heading?: string;
  statusMessage?: string;
}) {
  return (
    <section
      aria-busy="true"
      aria-label="Farcaster sign-in"
      className="farcaster-auth-panel farcaster-auth-panel--creating-channel"
      data-phase="creating-channel"
    >
      <div aria-hidden="true" className="farcaster-auth-panel__ornament">
        <span />
        <i />
        <span />
      </div>
      <header className="farcaster-auth-panel__header">
        <p className="farcaster-auth-panel__eyebrow">{eyebrow}</p>
        <h2 ref={headingRef} tabIndex={-1}>{heading}</h2>
      </header>
      <p aria-live="polite" className="farcaster-auth-panel__live-region" role="status">
        {statusMessage}
      </p>
      <div className="farcaster-auth-panel__actions farcaster-auth-panel__actions--quiet">
        <button
          className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
          onClick={onCancel}
          ref={primaryActionRef}
          type="button"
        >
          CANCEL
        </button>
      </div>
    </section>
  );
}

export function resolveMenuAssetUrl(baseUrl: string, assetPath: string) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, '')}`;
}

export const WARPKEEP_MENU_VIDEO_URL = resolveMenuAssetUrl(
  import.meta.env.BASE_URL,
  'video/warpkeep-menu-loop-v2.mp4'
);

export const WARPKEEP_MENU_POSTER_URL = resolveMenuAssetUrl(
  import.meta.env.BASE_URL,
  'images/menu/warpkeep-menu-poster-v2.webp'
);

function readReducedMotionPreference() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(readReducedMotionPreference);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(preference.matches);
    preference.addEventListener?.('change', handleChange);

    return () => preference.removeEventListener?.('change', handleChange);
  }, []);

  return reducedMotion;
}

function safelyPauseVideo(video: HTMLVideoElement) {
  try {
    video.pause();
  } catch {
    // Media support is optional; the poster keeps the menu usable.
  }
}

export function WarpkeepMainMenu({
  active,
  visible = active,
  interactive: interactiveOverride,
  onRequestReturn,
  onRequestEnterRealm,
  backendUnavailableMessage,
  authState = ANONYMOUS_AUTH_STATE,
  onRequestFarcasterSignIn,
  onCancelFarcasterSignIn,
  onDisposeFarcasterSignIn,
  onRetryFarcasterSignIn,
  onPrepareFarcasterQrCode,
  onRestoreFarcasterSession,
  onRefreshFarcasterSession,
  accessRequest,
  admissionCheck,
  onCheckFarcasterAdmission,
  onRequestAccess,
  onRetryAccessRequestStatus,
  onSignOut,
  rememberDevice = false,
  onRememberDeviceChange,
  onRequestAuthenticatedRealm,
  ptrRealmAuthority,
  ptrRealmBusy = false,
  onCheckRealmAccess,
  onCancelPtrRealm,
  onRequestPtrRealm,
  onAcceptAlphaTermsAttempt,
  entryAgreementSatisfied = false,
  entryAgreementRequired = false,
  renderAuthRailContent,
  onRequestAuthRailCheck,
  authRailAttemptFailed = false,
  inputModality = 'unknown',
  focusFirstCommand,
  buildInfo,
  onVideoReady,
  onVideoError,
  noticeDurationMs = 5600,
  graphicsPreference = DEFAULT_GRAPHICS_PREFERENCE,
  resolvedGraphicsQuality = 'balanced',
  onGraphicsPreferenceChange,
  audioMuted = false,
  onAudioMutedChange
}: WarpkeepMainMenuProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const commandRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const authHeadingRef = useRef<HTMLHeadingElement>(null);
  const authPrimaryActionRef = useRef<HTMLButtonElement>(null);
  const realmChoiceHeadingRef = useRef<HTMLHeadingElement>(null);
  const surfaceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const termsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const patchNotesAnchorRef = useRef<HTMLButtonElement | null>(null);
  const patchNotesStampRef = useRef<HTMLDivElement | null>(null);
  const patchNotesPanelRef = useRef<HTMLElement | null>(null);
  const patchNotesCloseTimerRef = useRef<number | null>(null);
  const noticeSequenceRef = useRef(0);
  const sessionRestoreSequenceRef = useRef(0);
  const didFocusOnRevealRef = useRef(false);
  const playbackBlockedRef = useRef(false);
  const didReportVideoReadyRef = useRef(false);
  const didReportVideoErrorRef = useRef(false);
  const authWasKeyboardDrivenRef = useRef(false);
  const authAttemptStartedRef = useRef(false);
  const acceptedEntryAttemptRef = useRef(false);
  const previousAuthPhaseRef = useRef(authState.phase);
  const lastActionModalityRef = useRef<MenuInputModality>(inputModality);
  const [videoState, setVideoState] = useState<'waiting' | 'ready' | 'error'>('waiting');
  const [activeNotice, setActiveNotice] = useState<ActiveNotice | null>(null);
  const [patchNotesState, setPatchNotesState] = useState<WarpkeepPatchNotesState>('closed');
  const [surface, setSurface] = useState<MenuSurface>('commands');
  const [termsRequest, setTermsRequest] = useState<TermsRequest | null>(null);
  const [sessionRestoreRequest, setSessionRestoreRequest] =
    useState<SessionRestoreRequest | null>(null);
  const [selectedRealmId, setSelectedRealmId] = useState<RealmId>(GENESIS_001_ID);
  const [realmStatusMessage, setRealmStatusMessage] = useState<string>();
  const reducedMotion = useReducedMotionPreference();
  const interactive = interactiveOverride ?? (active && visible);
  const shouldFocusFirstCommand = focusFirstCommand ?? inputModality === 'keyboard';
  const authPanelOpen = surface === 'farcaster-auth';
  const realmChoiceOpen = surface === 'realm-choice';
  const commandSurfaceVisible = !authPanelOpen && !realmChoiceOpen;
  const termsOpen = termsRequest !== null;
  const sessionRestorePending = sessionRestoreRequest !== null;
  const realmChoiceBusy = sessionRestorePending
    || (ptrRealmBusy && selectedRealmId === PTR_ID);
  const patchNotesOpen = patchNotesState !== 'closed';
  const modalSurfaceOpen = termsOpen || surface === 'settings' || surface === 'credits';
  const authenticatedIdentity = authState.phase === 'authenticated'
    ? authState.identity
    : undefined;
  const pendingIdentity = authState.phase === 'pending-admission'
    ? authState.identity
    : undefined;
  const verifyingIdentity = authState.phase === 'verifying'
    ? authState.identity
    : undefined;
  const sessionIdentity = authenticatedIdentity ?? pendingIdentity ?? verifyingIdentity;
  const authenticatedAssurance = authState.phase === 'authenticated'
    ? authState.assurance
    : undefined;
  const hasCurrentAuthenticatedAccess = useCallback(() => (
    authState.phase === 'authenticated'
    && authState.assurance === 'bridge-oidc-alpha'
    && typeof authState.expiresAt === 'number'
    && Number.isFinite(authState.expiresAt)
    && authState.expiresAt > Date.now()
  ), [authState]);
  const realmChoices = useMemo(
    () => getRealmChoices(hasCurrentAuthenticatedAccess(), ptrRealmAuthority),
    [hasCurrentAuthenticatedAccess, ptrRealmAuthority]
  );
  const canReuseEntryAgreement = useCallback(() => (
    entryAgreementSatisfied && hasCurrentAuthenticatedAccess()
  ), [entryAgreementSatisfied, hasCurrentAuthenticatedAccess]);
  const farcasterAuthEnabled = !backendUnavailableMessage && Boolean(
    onRequestFarcasterSignIn
    && onCancelFarcasterSignIn
    && onRetryFarcasterSignIn
    && onSignOut
    && onRequestAuthenticatedRealm
  );

  const cancelPatchNotesClose = useCallback(() => {
    if (patchNotesCloseTimerRef.current !== null) {
      window.clearTimeout(patchNotesCloseTimerRef.current);
      patchNotesCloseTimerRef.current = null;
    }
  }, []);

  const closePatchNotes = useCallback((restoreTriggerFocus = false) => {
    cancelPatchNotesClose();
    setPatchNotesState('closed');
    if (restoreTriggerFocus) {
      window.requestAnimationFrame(() => {
        patchNotesAnchorRef.current?.focus({ preventScroll: true });
      });
    }
  }, [cancelPatchNotesClose]);

  const previewPatchNotes = useCallback(() => {
    cancelPatchNotesClose();
    setActiveNotice(null);
    setPatchNotesState((current) => current === 'pinned' ? current : 'preview');
  }, [cancelPatchNotesClose]);

  const togglePatchNotes = useCallback(() => {
    cancelPatchNotesClose();
    setActiveNotice(null);
    setPatchNotesState((current) => current === 'pinned' ? 'closed' : 'pinned');
  }, [cancelPatchNotesClose]);

  const invalidateSessionRestore = useCallback(() => {
    sessionRestoreSequenceRef.current += 1;
    setSessionRestoreRequest(null);
  }, []);

  const schedulePatchNotesClose = useCallback((pointerType: string) => {
    if (pointerType === 'touch') {
      return;
    }
    cancelPatchNotesClose();
    patchNotesCloseTimerRef.current = window.setTimeout(() => {
      patchNotesCloseTimerRef.current = null;
      setPatchNotesState((current) => current === 'preview' ? 'closed' : current);
    }, PATCH_NOTES_POINTER_LEAVE_DELAY_MS);
  }, [cancelPatchNotesClose]);

  useEffect(() => () => cancelPatchNotesClose(), [cancelPatchNotesClose]);

  useEffect(() => {
    if (!patchNotesOpen) {
      return undefined;
    }

    const isInsidePatchNotes = (target: EventTarget | null) => target instanceof Node && (
      patchNotesStampRef.current?.contains(target)
      || patchNotesPanelRef.current?.contains(target)
    );
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!isInsidePatchNotes(event.target)) {
        closePatchNotes();
      }
    };
    const handleFocusChange = (event: FocusEvent) => {
      if (!isInsidePatchNotes(event.target)) {
        closePatchNotes();
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer, true);
    document.addEventListener('focusin', handleFocusChange, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
      document.removeEventListener('focusin', handleFocusChange, true);
    };
  }, [closePatchNotes, patchNotesOpen]);

  const attemptVideoPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !active || reducedMotion || document.hidden) {
      return;
    }

    try {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === 'function') {
        void playResult
          .then(() => {
            playbackBlockedRef.current = false;
          })
          .catch(() => {
            playbackBlockedRef.current = true;
          });
      }
    } catch {
      playbackBlockedRef.current = true;
    }
  }, [active, reducedMotion]);

  useEffect(() => {
    const mountedVideo = videoRef.current;
    const reconcilePlayback = () => {
      const video = mountedVideo;
      if (!video) {
        return;
      }

      if (active && !reducedMotion && !document.hidden) {
        attemptVideoPlayback();
      } else {
        safelyPauseVideo(video);
      }
    };

    const retryBlockedPlayback = () => {
      if (playbackBlockedRef.current) {
        attemptVideoPlayback();
      }
    };

    reconcilePlayback();
    document.addEventListener('visibilitychange', reconcilePlayback);
    document.addEventListener('pointerdown', retryBlockedPlayback, true);
    document.addEventListener('keydown', retryBlockedPlayback, true);

    return () => {
      document.removeEventListener('visibilitychange', reconcilePlayback);
      document.removeEventListener('pointerdown', retryBlockedPlayback, true);
      document.removeEventListener('keydown', retryBlockedPlayback, true);
      if (mountedVideo) {
        safelyPauseVideo(mountedVideo);
      }
    };
  }, [active, attemptVideoPlayback, reducedMotion]);

  useEffect(() => {
    if (!interactive) {
      if (authAttemptStartedRef.current) {
        authAttemptStartedRef.current = false;
        onCancelFarcasterSignIn?.();
      }
      invalidateSessionRestore();
      setActiveNotice(null);
      closePatchNotes();
      setSurface('commands');
      setTermsRequest(null);
      termsTriggerRef.current = null;
      acceptedEntryAttemptRef.current = false;
      didFocusOnRevealRef.current = false;
      return;
    }

    if (shouldFocusFirstCommand && !didFocusOnRevealRef.current) {
      didFocusOnRevealRef.current = true;
      commandRefs.current[0]?.focus({ preventScroll: true });
    }
  }, [
    closePatchNotes,
    interactive,
    invalidateSessionRestore,
    onCancelFarcasterSignIn,
    shouldFocusFirstCommand
  ]);

  useEffect(() => {
    const previousPhase = previousAuthPhaseRef.current;
    previousAuthPhaseRef.current = authState.phase;
    if (
      authState.phase === 'expired'
      || (previousPhase !== 'anonymous' && authState.phase === 'anonymous')
    ) {
      acceptedEntryAttemptRef.current = false;
    }
    if (
      authState.phase === 'anonymous'
      || authState.phase === 'authenticated'
      || authState.phase === 'pending-admission'
    ) {
      authAttemptStartedRef.current = false;
    }
    if (
      previousPhase !== 'anonymous'
      && authState.phase === 'anonymous'
    ) {
      invalidateSessionRestore();
      setSurface('commands');
    }
  }, [authState.phase, invalidateSessionRestore]);

  useEffect(() => {
    if (authRailAttemptFailed) {
      invalidateSessionRestore();
      authAttemptStartedRef.current = false;
      acceptedEntryAttemptRef.current = false;
    }
  }, [authRailAttemptFailed, invalidateSessionRestore]);

  const restoreFirstCommandFocus = useCallback(() => {
    const frame = window.requestAnimationFrame(() => {
      commandRefs.current[0]?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const restoreSurfaceTriggerFocus = useCallback(() => {
    const trigger = surfaceTriggerRef.current;
    surfaceTriggerRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      trigger?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const restoreTermsTriggerFocus = useCallback(() => {
    const trigger = termsTriggerRef.current;
    termsTriggerRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      trigger?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const openSettings = useCallback((anchorElement: HTMLButtonElement) => {
    surfaceTriggerRef.current = anchorElement;
    setActiveNotice(null);
    closePatchNotes();
    setSurface('settings');
  }, [closePatchNotes]);

  const closeSettings = useCallback(() => {
    setSurface('commands');
    restoreSurfaceTriggerFocus();
  }, [restoreSurfaceTriggerFocus]);

  const openCredits = useCallback((anchorElement: HTMLButtonElement) => {
    surfaceTriggerRef.current = anchorElement;
    setActiveNotice(null);
    closePatchNotes();
    setSurface('credits');
  }, [closePatchNotes]);

  const selectRealm = useCallback((realmId: RealmId) => {
    setActiveNotice(null);
    setRealmStatusMessage(undefined);
    closePatchNotes();
    if (realmId !== PTR_ID) {
      onCancelPtrRealm?.();
    }
    setSelectedRealmId(realmId);
  }, [closePatchNotes, onCancelPtrRealm]);

  const openRealmChoice = useCallback((anchorElement: HTMLButtonElement) => {
    surfaceTriggerRef.current = anchorElement;
    setActiveNotice(null);
    setRealmStatusMessage(undefined);
    closePatchNotes();
    setSurface('realm-choice');
    onCheckRealmAccess?.();
  }, [closePatchNotes, onCheckRealmAccess]);

  const closeRealmChoice = useCallback(() => {
    invalidateSessionRestore();
    onCancelPtrRealm?.();
    surfaceTriggerRef.current = null;
    setRealmStatusMessage(undefined);
    setSurface('commands');
    window.setTimeout(() => {
      commandRefs.current[0]?.focus({ preventScroll: true });
    }, 0);
  }, [invalidateSessionRestore, onCancelPtrRealm]);

  const closeCredits = useCallback(() => {
    setSurface('commands');
    restoreSurfaceTriggerFocus();
  }, [restoreSurfaceTriggerFocus]);

  const closeAuthPanel = useCallback((restoreKeyboardFocus = false) => {
    invalidateSessionRestore();
    acceptedEntryAttemptRef.current = false;
    authAttemptStartedRef.current = false;
    // Player-driven dismissal must also clear an authenticated admission
    // attempt owned by the parent. The auth provider safely ignores cancel
    // outside an active SIWF flow, while the parent drops its deferred realm
    // destination so a late ready result cannot enter after Escape/Back.
    onCancelFarcasterSignIn?.();
    setSurface('commands');
    if (restoreKeyboardFocus) {
      restoreFirstCommandFocus();
    }
  }, [
    invalidateSessionRestore,
    onCancelFarcasterSignIn,
    restoreFirstCommandFocus
  ]);

  const closeTerms = useCallback(() => {
    acceptedEntryAttemptRef.current = false;
    setTermsRequest(null);
    restoreTermsTriggerFocus();
  }, [restoreTermsTriggerFocus]);

  const handleRequestReturn = useCallback(() => {
    invalidateSessionRestore();
    acceptedEntryAttemptRef.current = false;
    if (authAttemptStartedRef.current) {
      authAttemptStartedRef.current = false;
      onCancelFarcasterSignIn?.();
    }
    setSurface('commands');
    onRequestReturn();
  }, [
    invalidateSessionRestore,
    onCancelFarcasterSignIn,
    onRequestReturn
  ]);

  useEffect(() => {
    if (!interactive || !authPanelOpen) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      authHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [authPanelOpen, interactive]);

  useEffect(() => {
    if (!interactive || !realmChoiceOpen) {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      realmChoiceHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [interactive, realmChoiceOpen]);

  const handleAuthPanelPresentationReady = useCallback(() => {
    if (!interactive || !authPanelOpen) {
      return;
    }
    window.requestAnimationFrame(() => {
      authHeadingRef.current?.focus({ preventScroll: true });
    });
  }, [authPanelOpen, interactive]);

  useEffect(() => {
    if (
      !interactive
      || !authPanelOpen
      || !authWasKeyboardDrivenRef.current
      || (
        authState.phase !== 'authenticated'
        && authState.phase !== 'pending-admission'
        && authState.phase !== 'expired'
        && authState.phase !== 'error'
      )
    ) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      authPrimaryActionRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [authPanelOpen, authState.phase, interactive]);

  useEffect(() => () => {
    if (!authAttemptStartedRef.current) {
      return;
    }
    authAttemptStartedRef.current = false;
    (onDisposeFarcasterSignIn ?? onCancelFarcasterSignIn)?.();
  }, [onCancelFarcasterSignIn, onDisposeFarcasterSignIn]);

  useEffect(() => () => {
    sessionRestoreSequenceRef.current += 1;
  }, []);

  useEffect(() => {
    if (!interactive) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      // Mounted modal surfaces own their complete keyboard boundary, including
      // Escape. Let their capture listener close exactly once and restore the
      // command that opened them through the corresponding close callback.
      if (termsOpen || surface === 'settings' || surface === 'credits') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      lastActionModalityRef.current = 'keyboard';
      if (patchNotesOpen) {
        closePatchNotes(true);
      } else if (activeNotice) {
        setActiveNotice(null);
      } else if (authPanelOpen) {
        closeAuthPanel(true);
      } else if (realmChoiceOpen) {
        closeRealmChoice();
      } else {
        handleRequestReturn();
      }
    };

    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [
    activeNotice,
    authPanelOpen,
    closeAuthPanel,
    closePatchNotes,
    closeRealmChoice,
    handleRequestReturn,
    interactive,
    patchNotesOpen,
    realmChoiceOpen,
    surface,
    termsOpen
  ]);

  const handleVideoReady = useCallback(() => {
    setVideoState('ready');
    if (!didReportVideoReadyRef.current) {
      didReportVideoReadyRef.current = true;
      onVideoReady?.();
    }
  }, [onVideoReady]);

  const handleVideoError = useCallback(() => {
    setVideoState('error');
    safelyPauseVideo(videoRef.current as HTMLVideoElement);
    if (!didReportVideoErrorRef.current) {
      didReportVideoErrorRef.current = true;
      onVideoError?.();
    }
  }, [onVideoError]);

  const openNotice = useCallback((
    command: MenuCommand,
    anchorElement: HTMLButtonElement,
    notice?: string
  ) => {
    noticeSequenceRef.current += 1;
    setActiveNotice({
      command,
      ...(notice ? { notice } : {}),
      anchorElement,
      refreshKey: noticeSequenceRef.current
    });
  }, []);

  const denySelectedRealmEntry = useCallback((
    anchorElement?: HTMLButtonElement | null
  ) => {
    if (selectedRealmId === GENESIS_001_ID) return false;
    const enterRealmCommand = menuCommands.find(({ id }) => id === 'enter-realm');
    if (anchorElement && enterRealmCommand) {
      openNotice(
        enterRealmCommand,
        anchorElement,
        selectedRealmId === GENESIS_002_ID
          ? GENESIS_002_SEALED_NOTICE
          : PTR_DIRECTORY_ONLY_NOTICE
      );
    }
    return true;
  }, [openNotice, selectedRealmId]);

  const requestSelectedRealmEntry = useCallback((
    identity: VerifiedFarcasterIdentity,
    anchorElement?: HTMLButtonElement | null
  ) => {
    if (denySelectedRealmEntry(anchorElement)) return false;
    if (
      !hasCurrentAuthenticatedAccess()
      || authenticatedIdentity?.fid !== identity.fid
    ) return false;
    onRequestAuthenticatedRealm?.(identity);
    return true;
  }, [
    authenticatedIdentity,
    denySelectedRealmEntry,
    hasCurrentAuthenticatedAccess,
    onRequestAuthenticatedRealm
  ]);

  const openAuthPanel = useCallback((keyboardDriven: boolean) => {
    authWasKeyboardDrivenRef.current = keyboardDriven;
    setActiveNotice(null);
    closePatchNotes();
    setSurface('farcaster-auth');
  }, [closePatchNotes]);

  const openTerms = useCallback((
    continuation: TermsContinuation,
    anchorElement: HTMLButtonElement | null,
    keyboardDriven: boolean
  ) => {
    invalidateSessionRestore();
    termsTriggerRef.current = anchorElement;
    setActiveNotice(null);
    closePatchNotes();
    setTermsRequest({ continuation, keyboardDriven });
  }, [closePatchNotes, invalidateSessionRestore]);

  const beginSessionRestore = useCallback((
    anchorElement: HTMLButtonElement,
    keyboardDriven: boolean
  ) => {
    if (authAttemptStartedRef.current) {
      return;
    }
    if (!onRestoreFarcasterSession) {
      openTerms('begin-sign-in', anchorElement, keyboardDriven);
      return;
    }

    const sequence = sessionRestoreSequenceRef.current + 1;
    sessionRestoreSequenceRef.current = sequence;
    termsTriggerRef.current = anchorElement;
    authWasKeyboardDrivenRef.current = keyboardDriven;
    setActiveNotice(null);
    closePatchNotes();
    setSessionRestoreRequest({ sequence, keyboardDriven });
    // Reuse the established lifecycle cancellation boundary so Return to
    // Title, route deactivation, and unmount abort the credentialed refresh.
    authAttemptStartedRef.current = true;

    let restoration: Promise<boolean>;
    try {
      restoration = onRestoreFarcasterSession();
    } catch {
      restoration = Promise.resolve(false);
    }
    void restoration.then((restored) => {
      if (sessionRestoreSequenceRef.current !== sequence || restored) return;
      authAttemptStartedRef.current = false;
      openTerms('begin-sign-in', anchorElement, keyboardDriven);
    }).catch(() => {
      if (sessionRestoreSequenceRef.current !== sequence) return;
      authAttemptStartedRef.current = false;
      openTerms('begin-sign-in', anchorElement, keyboardDriven);
    });
  }, [
    closePatchNotes,
    onRestoreFarcasterSession,
    openTerms
  ]);

  useEffect(() => {
    const request = sessionRestoreRequest;
    if (!interactive || !request || authPanelOpen) return undefined;

    const timer = window.setTimeout(() => {
      if (
        sessionRestoreSequenceRef.current === request.sequence
        && authAttemptStartedRef.current
      ) {
        setSurface('farcaster-auth');
      }
    }, SESSION_RESTORE_COMPACT_THRESHOLD_MS);

    return () => window.clearTimeout(timer);
  }, [authPanelOpen, interactive, sessionRestoreRequest]);

  useEffect(() => {
    const request = sessionRestoreRequest;
    if (!interactive || !request) return;

    if (authState.phase === 'pending-admission') {
      authAttemptStartedRef.current = false;
      invalidateSessionRestore();
      openAuthPanel(request.keyboardDriven);
      return;
    }
    if (
      authState.phase !== 'authenticated'
      || !hasCurrentAuthenticatedAccess()
    ) {
      return;
    }
    if (entryAgreementSatisfied) {
      const identity = authState.identity;
      termsTriggerRef.current = null;
      authAttemptStartedRef.current = false;
      invalidateSessionRestore();
      setSurface('commands');
      requestSelectedRealmEntry(identity, commandRefs.current[0]);
      return;
    }
    if (entryAgreementRequired) {
      const trigger = termsTriggerRef.current;
      authAttemptStartedRef.current = false;
      setSurface('commands');
      openTerms('enter-authenticated', trigger, request.keyboardDriven);
    }
  }, [
    authState,
    entryAgreementRequired,
    entryAgreementSatisfied,
    hasCurrentAuthenticatedAccess,
    interactive,
    invalidateSessionRestore,
    openAuthPanel,
    openTerms,
    requestSelectedRealmEntry,
    sessionRestoreRequest
  ]);

  const handleSelectedRealmContinue = useCallback((
    anchorElement: HTMLButtonElement,
    keyboardDriven: boolean
  ) => {
    if (selectedRealmId === GENESIS_002_ID) {
      setRealmStatusMessage(GENESIS_002_SEALED_NOTICE);
      return;
    }

    if (selectedRealmId === PTR_ID) {
      if (
        ptrRealmAuthority?.source === 'server-verified'
        && ptrRealmAuthority.admission === 'admitted'
        && onRequestPtrRealm
      ) {
        setRealmStatusMessage(undefined);
        onRequestPtrRealm();
      } else {
        setRealmStatusMessage(
          ptrRealmAuthority?.source === 'server-verified'
          && ptrRealmAuthority.admission === 'not-admitted'
            ? PTR_NOT_ADMITTED_NOTICE
            : PTR_UNKNOWN_NOTICE
        );
      }
      return;
    }

    onCancelPtrRealm?.();

    if (backendUnavailableMessage) {
      setRealmStatusMessage(backendUnavailableMessage);
      return;
    }

    if (farcasterAuthEnabled) {
      if (authenticatedIdentity) {
        if (canReuseEntryAgreement()) {
          setActiveNotice(null);
          closePatchNotes();
          requestSelectedRealmEntry(authenticatedIdentity, anchorElement);
        } else {
          openTerms('enter-authenticated', anchorElement, keyboardDriven);
        }
      } else if (pendingIdentity) {
        termsTriggerRef.current = anchorElement;
        openAuthPanel(keyboardDriven);
      } else {
        beginSessionRestore(anchorElement, keyboardDriven);
      }
      return;
    }

    if (onRequestEnterRealm) {
      openTerms('legacy-enter', anchorElement, keyboardDriven);
      return;
    }
    const enterRealmCommand = menuCommands.find(({ id }) => id === 'enter-realm');
    if (enterRealmCommand) {
      openNotice(enterRealmCommand, anchorElement);
    }
  }, [
    authenticatedIdentity,
    backendUnavailableMessage,
    beginSessionRestore,
    canReuseEntryAgreement,
    closePatchNotes,
    farcasterAuthEnabled,
    onRequestEnterRealm,
    onCancelPtrRealm,
    onRequestPtrRealm,
    openAuthPanel,
    openNotice,
    openTerms,
    pendingIdentity,
    ptrRealmAuthority,
    requestSelectedRealmEntry,
    selectedRealmId
  ]);

  const handleCommandClick = useCallback((
    command: MenuCommand,
    anchorElement: HTMLButtonElement
  ) => {
    if (command.id === 'settings') {
      openSettings(anchorElement);
      return;
    }

    if (command.id === 'credits') {
      openCredits(anchorElement);
      return;
    }

    if (command.id === 'enter-realm') {
      openRealmChoice(anchorElement);
      return;
    }
    openNotice(command, anchorElement);
  }, [openCredits, openNotice, openRealmChoice, openSettings]);

  const handleRetrySignIn = useCallback(() => {
    const keyboardDriven = lastActionModalityRef.current === 'keyboard';
    if (acceptedEntryAttemptRef.current) {
      authAttemptStartedRef.current = true;
      openAuthPanel(keyboardDriven);
      onRetryFarcasterSignIn?.();
      window.requestAnimationFrame(() => {
        authHeadingRef.current?.focus({ preventScroll: true });
      });
      return;
    }
    openTerms('retry-sign-in', authPrimaryActionRef.current, keyboardDriven);
  }, [onRetryFarcasterSignIn, openAuthPanel, openTerms]);

  const handleTermsContinue = useCallback(() => {
    const request = termsRequest;
    if (!request) {
      return;
    }

    if (
      request.continuation === 'enter-authenticated'
      && denySelectedRealmEntry(authPrimaryActionRef.current)
    ) {
      acceptedEntryAttemptRef.current = false;
      setTermsRequest(null);
      return;
    }

    termsTriggerRef.current = null;
    setTermsRequest(null);
    authWasKeyboardDrivenRef.current = request.keyboardDriven;
    acceptedEntryAttemptRef.current = true;

    if (request.continuation === 'legacy-enter') {
      acceptedEntryAttemptRef.current = false;
      onRequestEnterRealm?.();
      return;
    }

    onAcceptAlphaTermsAttempt?.();

    openAuthPanel(request.keyboardDriven);
    if (request.continuation === 'begin-sign-in') {
      authAttemptStartedRef.current = true;
      onRequestFarcasterSignIn?.();
    } else if (request.continuation === 'retry-sign-in') {
      authAttemptStartedRef.current = true;
      onRetryFarcasterSignIn?.();
      window.requestAnimationFrame(() => {
        authHeadingRef.current?.focus({ preventScroll: true });
      });
    } else if (request.continuation === 'refresh-session') {
      acceptedEntryAttemptRef.current = false;
      onRefreshFarcasterSession?.();
    } else if (request.continuation === 'check-auth-rail') {
      acceptedEntryAttemptRef.current = false;
      onRequestAuthRailCheck?.();
    } else if (request.continuation === 'enter-authenticated') {
      if (authenticatedIdentity && hasCurrentAuthenticatedAccess()) {
        acceptedEntryAttemptRef.current = false;
        requestSelectedRealmEntry(
          authenticatedIdentity,
          authPrimaryActionRef.current ?? commandRefs.current[0]
        );
      } else if (
        authState.phase === 'authenticated'
        || authState.phase === 'pending-admission'
      ) {
        // A throttled expiry timer can leave the old presentation visible for
        // a moment. Preserve the checked intent, but refresh authority before
        // any realm callback or server acknowledgement can run.
        onRefreshFarcasterSession?.();
      } else {
        authAttemptStartedRef.current = true;
        onRequestFarcasterSignIn?.();
      }
    }
  }, [
    authenticatedIdentity,
    authState.phase,
    denySelectedRealmEntry,
    hasCurrentAuthenticatedAccess,
    onAcceptAlphaTermsAttempt,
    onRequestEnterRealm,
    onRequestFarcasterSignIn,
    onRefreshFarcasterSession,
    onRequestAuthRailCheck,
    onRetryFarcasterSignIn,
    openAuthPanel,
    requestSelectedRealmEntry,
    termsRequest
  ]);

  const handleBackToCommands = useCallback(() => {
    closeAuthPanel(lastActionModalityRef.current === 'keyboard');
  }, [closeAuthPanel]);

  const handleSignOut = useCallback(() => {
    const restoreKeyboardFocus = lastActionModalityRef.current === 'keyboard';
    invalidateSessionRestore();
    authAttemptStartedRef.current = false;
    acceptedEntryAttemptRef.current = false;
    onSignOut?.();
    setSurface('commands');
    if (restoreKeyboardFocus) {
      restoreFirstCommandFocus();
    }
  }, [invalidateSessionRestore, onSignOut, restoreFirstCommandFocus]);

  const handleAuthenticatedRealmEntry = useCallback((identity: VerifiedFarcasterIdentity) => {
    if (denySelectedRealmEntry(authPrimaryActionRef.current)) {
      return;
    }
    const hasCurrentAccess = hasCurrentAuthenticatedAccess()
      && authenticatedIdentity?.fid === identity.fid;
    if (!hasCurrentAccess) {
      if (acceptedEntryAttemptRef.current) {
        onRefreshFarcasterSession?.();
      } else {
        openTerms(
          'enter-authenticated',
          authPrimaryActionRef.current,
          lastActionModalityRef.current === 'keyboard'
        );
      }
      return;
    }
    const mayReuseAgreement = canReuseEntryAgreement()
      && authenticatedIdentity?.fid === identity.fid;
    if (!acceptedEntryAttemptRef.current && !mayReuseAgreement) {
      openTerms(
        'enter-authenticated',
        authPrimaryActionRef.current,
        lastActionModalityRef.current === 'keyboard'
      );
      return;
    }
    acceptedEntryAttemptRef.current = false;
    if (!requestSelectedRealmEntry(identity, authPrimaryActionRef.current)) {
      return;
    }
    setSurface('commands');
  }, [
    authenticatedIdentity,
    canReuseEntryAgreement,
    denySelectedRealmEntry,
    hasCurrentAuthenticatedAccess,
    onRefreshFarcasterSession,
    openTerms,
    requestSelectedRealmEntry
  ]);

  const handleRefreshFarcasterSession = useCallback(() => {
    if (
      authState.phase === 'pending-admission'
      || acceptedEntryAttemptRef.current
      || canReuseEntryAgreement()
    ) {
      acceptedEntryAttemptRef.current = false;
      if (!onRefreshFarcasterSession) {
        return false;
      }
      onRefreshFarcasterSession?.();
      return true;
    }
    openTerms(
      'refresh-session',
      authPrimaryActionRef.current,
      lastActionModalityRef.current === 'keyboard'
    );
    return true;
  }, [
    authState.phase,
    canReuseEntryAgreement,
    onRefreshFarcasterSession,
    openTerms
  ]);

  const handleCheckFarcasterAdmission = useCallback(() => {
    // A pending-admission refresh is not an entry-agreement acceptance. Keep
    // the existing Terms boundary intact when authority later becomes valid.
    acceptedEntryAttemptRef.current = false;
    return onCheckFarcasterAdmission?.() ?? handleRefreshFarcasterSession();
  }, [handleRefreshFarcasterSession, onCheckFarcasterAdmission]);

  const handleAuthRailCheck = useCallback(() => {
    if (acceptedEntryAttemptRef.current || canReuseEntryAgreement()) {
      acceptedEntryAttemptRef.current = false;
      onRequestAuthRailCheck?.();
      return;
    }
    openTerms(
      'check-auth-rail',
      authPrimaryActionRef.current,
      lastActionModalityRef.current === 'keyboard'
    );
  }, [canReuseEntryAgreement, onRequestAuthRailCheck, openTerms]);

  const handleNavigationKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!interactive) {
      return;
    }

    const currentIndex = commandRefs.current.findIndex((button) => button === event.target);
    if (currentIndex < 0) {
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % menuCommands.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + menuCommands.length) % menuCommands.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = menuCommands.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    commandRefs.current[nextIndex]?.focus({ preventScroll: true });
  }, [interactive]);

  const describedNoticeId = useMemo(
    () => activeNotice ? `warpkeep-menu-notice-${activeNotice.command.id}` : undefined,
    [activeNotice]
  );

  const rootClassName = [
    'warpkeep-menu',
    visible ? 'warpkeep-menu--visible' : '',
    videoState === 'ready' ? 'warpkeep-menu--video-ready' : '',
    videoState === 'error' ? 'warpkeep-menu--video-error' : '',
    reducedMotion ? 'warpkeep-menu--reduced-motion' : ''
  ].filter(Boolean).join(' ');

  return (
    <>
      <main
      aria-hidden={!interactive || modalSurfaceOpen}
      aria-labelledby="warpkeep-menu-title"
      className={rootClassName}
      data-active={active ? 'true' : 'false'}
      data-menu-surface={surface}
      data-media-state={reducedMotion ? 'static' : videoState}
      data-visible={visible ? 'true' : 'false'}
      inert={!interactive || modalSurfaceOpen ? true : undefined}
      onKeyDownCapture={() => {
        lastActionModalityRef.current = 'keyboard';
      }}
      onPointerDownCapture={(event) => {
        lastActionModalityRef.current = event.pointerType === 'touch' ? 'touch' : 'pointer';
      }}
    >
      <div
        aria-hidden="true"
        className="warpkeep-menu-poster-fallback"
        style={{ backgroundImage: `url(${WARPKEEP_MENU_POSTER_URL})` }}
      />
      <video
        aria-hidden="true"
        autoPlay={!reducedMotion}
        className="warpkeep-menu-background"
        loop
        muted
        onCanPlay={handleVideoReady}
        onError={handleVideoError}
        onLoadedData={handleVideoReady}
        playsInline
        poster={WARPKEEP_MENU_POSTER_URL}
        preload={reducedMotion ? 'none' : 'auto'}
        ref={videoRef}
        src={WARPKEEP_MENU_VIDEO_URL}
        tabIndex={-1}
      />
      <div aria-hidden="true" className="warpkeep-menu-color-grade" />
      <div aria-hidden="true" className="warpkeep-menu-vignette" />

      <header aria-hidden={!commandSurfaceVisible} className="warpkeep-menu-heading">
        <div aria-hidden="true" className="warpkeep-menu-heading__crest">
          <span />
          <i />
          <span />
        </div>
        <h1 className="warpkeep-menu-title" id="warpkeep-menu-title">WARPKEEP</h1>
        <div aria-hidden="true" className="warpkeep-menu-heading__rule">
          <span />
          <i />
          <span />
        </div>
        <p className="warpkeep-menu-tagline">
          BUILD YOUR LEGACY. DEFEND THE REALM. DEFY THE CORE.
        </p>
        {commandSurfaceVisible && sessionIdentity ? (
          <div className="warpkeep-menu-identity">
            <Suspense fallback={null}>
              <FarcasterIdentityBadge
                compact
                identity={sessionIdentity}
                onActivate={farcasterAuthEnabled && !sessionRestorePending
                  ? () => openAuthPanel(lastActionModalityRef.current === 'keyboard')
                  : undefined}
                status={pendingIdentity ? 'admission-pending' : 'farcaster-verified'}
              />
            </Suspense>
          </div>
        ) : null}
      </header>

      {commandSurfaceVisible ? (
        <>
          <nav
            aria-label="Hegemony main menu"
            className="warpkeep-menu-nav"
            onKeyDown={handleNavigationKeyDown}
          >
            <ol className="warpkeep-menu-command-list">
              {menuCommands.map((command, commandIndex) => (
                <li className="warpkeep-menu-command-item" key={command.id}>
                  <button
                    aria-busy={command.id === 'enter-realm' && sessionRestorePending
                      ? true
                      : undefined}
                    aria-describedby={activeNotice?.command.id === command.id ? describedNoticeId : undefined}
                    className="warpkeep-menu-command"
                    data-command={command.id}
                    data-prominent={commandIndex === 0 ? 'true' : undefined}
                    data-restoring={command.id === 'enter-realm' && sessionRestorePending
                      ? 'true'
                      : undefined}
                    disabled={!interactive || (
                      command.id === 'enter-realm' && sessionRestorePending
                    )}
                    onClick={(event) => handleCommandClick(command, event.currentTarget)}
                    ref={(button) => {
                      commandRefs.current[commandIndex] = button;
                    }}
                    tabIndex={interactive ? 0 : -1}
                    type="button"
                  >
                    {command.id === 'enter-realm' && sessionRestorePending ? (
                      <span className="warpkeep-menu-command__busy-label">
                        <i aria-hidden="true" className="warpkeep-menu-command__busy-indicator" />
                        <span>CHECKING ACCESS…</span>
                      </span>
                    ) : (
                      <span>{command.label}</span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
            <section
              aria-labelledby="warpkeep-menu-project-heading"
              className="warpkeep-menu-project"
            >
              <h2
                className="warpkeep-menu-project__heading"
                id="warpkeep-menu-project-heading"
              >
                PROJECT
              </h2>
              <div className="warpkeep-menu-project__links">
                <a
                  aria-label="Open Warpkeep repository on GitHub (opens in a new tab)"
                  className="warpkeep-menu-project__link"
                  href={DEFAULT_WARPKEEP_REPOSITORY_URL}
                  referrerPolicy="no-referrer"
                  rel="noopener noreferrer"
                  tabIndex={interactive ? 0 : -1}
                  target="_blank"
                >
                  <span>GITHUB</span>
                  <span aria-hidden="true" className="warpkeep-menu-project__external-mark">↗</span>
                </a>
                <a
                  aria-label="Open Warpkeep Farcaster channel (opens in a new tab)"
                  className="warpkeep-menu-project__link"
                  href={WARPKEEP_FARCASTER_CHANNEL_URL}
                  referrerPolicy="no-referrer"
                  rel="noopener noreferrer"
                  tabIndex={interactive ? 0 : -1}
                  target="_blank"
                >
                  <span>FARCASTER CHANNEL</span>
                  <span aria-hidden="true" className="warpkeep-menu-project__external-mark">↗</span>
                </a>
              </div>
            </section>
          </nav>
          <WarpkeepBuildStamp
            buildInfo={buildInfo}
            expanded={patchNotesOpen}
            groupRef={patchNotesStampRef}
            interactive={interactive}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') {
                previewPatchNotes();
              }
            }}
            onPointerLeave={(event) => schedulePatchNotesClose(event.pointerType)}
            onRequestPatchNotes={togglePatchNotes}
            patchNotesState={patchNotesState}
            ref={patchNotesAnchorRef}
          />
          {patchNotesOpen && patchNotesAnchorRef.current ? (
            <LatestPatchNotesPopover
              anchorElement={patchNotesAnchorRef.current}
              onPointerEnter={cancelPatchNotesClose}
              onPointerLeave={(event) => schedulePatchNotesClose(event.pointerType)}
              productVersion={buildInfo?.version ?? WARPKEEP_BUILD_INFO.version}
              ref={patchNotesPanelRef}
            />
          ) : null}
        </>
      ) : realmChoiceOpen ? (
        <div className="warpkeep-menu-realm-rail">
          <RealmChoiceSelector
            busy={realmChoiceBusy}
            choices={realmChoices}
            headingRef={realmChoiceHeadingRef}
            interactive={interactive && !sessionRestorePending}
            onBack={closeRealmChoice}
            onContinue={() => handleSelectedRealmContinue(
              document.activeElement instanceof HTMLButtonElement
                ? document.activeElement
                : surfaceTriggerRef.current ?? commandRefs.current[0]!,
              lastActionModalityRef.current === 'keyboard'
            )}
            onSelect={selectRealm}
            selectedRealmId={selectedRealmId}
            statusMessage={realmStatusMessage}
          />
        </div>
      ) : (
        <div className="warpkeep-menu-auth-rail">
          {sessionRestorePending ? (
            <FarcasterAuthPanelFallback
              eyebrow="FARCASTER SESSION"
              heading="RESTORING FARCASTER SESSION"
              headingRef={authHeadingRef}
              onCancel={() => closeAuthPanel(
                lastActionModalityRef.current === 'keyboard'
              )}
              primaryActionRef={authPrimaryActionRef}
              statusMessage="Checking your saved session"
            />
          ) : (
            <Suspense fallback={
              <FarcasterAuthPanelFallback
                headingRef={authHeadingRef}
                onCancel={() => closeAuthPanel(
                  lastActionModalityRef.current === 'keyboard'
                )}
                primaryActionRef={authPrimaryActionRef}
              />
            }>
              {renderAuthRailContent?.({
                headingRef: authHeadingRef,
                primaryActionRef: authPrimaryActionRef,
                onCheckAgain: handleAuthRailCheck,
                onBackToMenu: handleBackToCommands,
                onPresentationReady: handleAuthPanelPresentationReady
              }) ?? (
                <FarcasterQrAuthPanel
                  channelUrl={authState.phase === 'awaiting-approval'
                    ? authState.channelUrl
                    : undefined}
                  assurance={authenticatedAssurance}
                  errorMessage={authState.phase === 'error' || authState.phase === 'expired'
                    ? authState.error.message
                    : undefined}
                  headingRef={authHeadingRef}
                  identity={sessionIdentity}
                  onPresentationReady={handleAuthPanelPresentationReady}
                  onBackToMenu={handleBackToCommands}
                  onCancel={() => closeAuthPanel(
                    lastActionModalityRef.current === 'keyboard'
                  )}
                  onEnterRealm={handleAuthenticatedRealmEntry}
                  onPrepareQrCode={onPrepareFarcasterQrCode}
                  onCheckAdmission={handleCheckFarcasterAdmission}
                  accessRequest={accessRequest}
                  admissionCheck={admissionCheck}
                  admissionRequestsSuspended={NEW_ADMISSIONS_SUSPENDED}
                  onRequestAccess={onRequestAccess}
                  onRetryAccessRequestStatus={onRetryAccessRequestStatus}
                  onRememberDeviceChange={onRememberDeviceChange}
                  onRetry={handleRetrySignIn}
                  onSignOut={handleSignOut}
                  phase={authState.phase === 'anonymous'
                    ? 'creating-channel'
                    : authState.phase}
                  primaryActionRef={authPrimaryActionRef}
                  qr={authState.phase === 'awaiting-approval'
                    ? authState.qr
                    : undefined}
                  rememberDevice={rememberDevice}
                />
              )}
            </Suspense>
          )}
        </div>
      )}

      {commandSurfaceVisible ? (
        <button
          aria-label="Return to Title"
          className="warpkeep-menu-back"
          disabled={!interactive}
          onClick={handleRequestReturn}
          tabIndex={interactive ? 0 : -1}
          type="button"
        >
          <span aria-hidden="true" className="warpkeep-menu-back__arrow">←</span>
          <span className="warpkeep-menu-back__label">Return to Title</span>
        </button>
      ) : null}

      <p
        aria-live="polite"
        className="warpkeep-menu-live-region"
        role={realmChoiceBusy && realmChoiceOpen ? 'status' : undefined}
      >
        {interactive && sessionRestorePending && realmChoiceOpen
          ? 'Checking access. Restoring your saved Farcaster session.'
          : interactive && ptrRealmBusy && realmChoiceOpen
            ? 'Checking access. Preparing your verified PTR session.'
          : interactive && commandSurfaceVisible ? 'Main menu' : ''}
      </p>

      {activeNotice ? (
        <MenuDevelopmentNotice
          anchorElement={activeNotice.anchorElement}
          command={activeNotice.command}
          durationMs={noticeDurationMs}
          key={`${activeNotice.command.id}-${activeNotice.refreshKey}`}
          notice={activeNotice.notice}
          onDismiss={() => setActiveNotice(null)}
          refreshKey={activeNotice.refreshKey}
        />
      ) : null}
      </main>
      {surface === 'settings' && interactive ? (
        <SettingsPanel
          audioMuted={audioMuted}
          onChange={(preference) => onGraphicsPreferenceChange?.(preference)}
          onAudioMutedChange={onAudioMutedChange}
          onClose={closeSettings}
          preference={graphicsPreference}
          resolvedQuality={resolvedGraphicsQuality}
        />
      ) : null}
      {surface === 'credits' && interactive ? (
        <CreditsRoll onClose={closeCredits} />
      ) : null}
      {termsOpen && interactive ? (
        <AlphaParticipationTermsDialog
          continueLabel={termsContinueLabel(termsRequest?.continuation)}
          onCancel={closeTerms}
          onContinue={handleTermsContinue}
        />
      ) : null}
    </>
  );
}

export type { MenuCommandId };
