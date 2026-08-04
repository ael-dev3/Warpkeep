import type { FarcasterQuickAuthTokenOptions } from '../farcasterAuthTypes';

export const MINI_APP_CAPABILITIES = Object.freeze([
  'wallet.getEthereumProvider',
  'wallet.getSolanaProvider',
  'actions.ready',
  'actions.openUrl',
  'actions.close',
  'actions.setPrimaryButton',
  'actions.addMiniApp',
  'actions.signIn',
  'actions.viewCast',
  'actions.viewProfile',
  'actions.composeCast',
  'actions.viewToken',
  'actions.sendToken',
  'actions.swapToken',
  'actions.openMiniApp',
  'actions.requestCameraAndMicrophoneAccess',
  'experimental.signManifest',
  'haptics.impactOccurred',
  'haptics.notificationOccurred',
  'haptics.selectionChanged',
  'back'
] as const);

export type MiniAppCapability = (typeof MINI_APP_CAPABILITIES)[number];

export type MiniAppSafeAreaInsets = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

/**
 * Host-supplied profile fields are deliberately presentation data only. They
 * must never be used as admission, ownership, or authentication authority.
 */
export type MiniAppPresentationUser = Readonly<{
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}>;

export type MiniAppPresentationContext = Readonly<{
  user: MiniAppPresentationUser;
  client: Readonly<{
    clientFid: number;
    added: boolean;
    /** Presentation hint only. Signed webhook state remains authoritative. */
    notificationsEnabledHint: boolean;
    platformType?: 'web' | 'mobile';
    safeAreaInsets: MiniAppSafeAreaInsets;
  }>;
  features: Readonly<{
    haptics: boolean;
    cameraAndMicrophoneAccess: boolean;
  }>;
  locationType?:
    | 'cast_embed'
    | 'cast_share'
    | 'notification'
    | 'launcher'
    | 'channel'
    | 'open_miniapp';
  /** A bounded Warpkeep approval identifier; never admission authority. */
  notificationId?: string;
}>;

export type MiniAppBack = {
  onback: (() => unknown) | null;
  show: () => Promise<void>;
  hide: () => Promise<void>;
};

export type MiniAppSdkEventMap = Readonly<{
  miniAppAdded: Readonly<{ notificationDetails?: unknown }>;
  miniAppAddRejected: Readonly<{ reason?: unknown }>;
  miniAppRemoved: undefined;
  notificationsEnabled: Readonly<{ notificationDetails?: unknown }>;
  notificationsDisabled: undefined;
}>;

export type MiniAppSdkEventName = keyof MiniAppSdkEventMap;

export type MiniAppSdkEventListener<EventName extends MiniAppSdkEventName> =
  MiniAppSdkEventMap[EventName] extends undefined
    ? () => void
    : (event: MiniAppSdkEventMap[EventName]) => void;

export type MiniAppSdk = {
  isInMiniApp: (timeoutMilliseconds?: number) => Promise<boolean>;
  context: Promise<unknown>;
  getCapabilities?: () => Promise<unknown>;
  quickAuth?: {
    getToken?: (options?: FarcasterQuickAuthTokenOptions) => Promise<unknown>;
  };
  on?: (
    event: MiniAppSdkEventName,
    listener: (...args: never[]) => void
  ) => unknown;
  removeListener?: (
    event: MiniAppSdkEventName,
    listener: (...args: never[]) => void
  ) => unknown;
  back?: MiniAppBack;
  actions: {
    ready: (options: { disableNativeGestures: true }) => Promise<void>;
    openUrl?: (url: string | { url: string }) => Promise<void>;
    close?: () => Promise<void>;
    addMiniApp?: () => Promise<unknown>;
    viewProfile?: (options: { fid: number }) => Promise<void>;
    openMiniApp?: (options: { url: string }) => Promise<void>;
  };
  haptics?: {
    impactOccurred?: (
      type: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid'
    ) => Promise<void>;
    notificationOccurred?: (
      type: 'success' | 'warning' | 'error'
    ) => Promise<void>;
    selectionChanged?: () => Promise<void>;
  };
};

export type MiniAppSdkLoader = () => Promise<unknown>;

export type MiniAppBrowserRuntime = Readonly<{
  search: () => string;
  hash?: () => string;
  replaceHash?: (hash: string) => void;
  subscribeNavigationChange?: (listener: () => void) => () => void;
  isFramed?: () => boolean;
  viewport: () => Readonly<{ width: number; height: number }>;
  subscribeViewportChange?: (listener: () => void) => () => void;
  document: Document;
  getMountedShell: () => Element | null;
  waitForAnimationFrame: () => Promise<void>;
}>;

const MINI_APP_CAPABILITY_SET = new Set<string>(MINI_APP_CAPABILITIES);
const LOCATION_TYPES = new Set<string>([
  'cast_embed',
  'cast_share',
  'notification',
  'launcher',
  'channel',
  'open_miniapp'
]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_AREA_STYLE_ATTRIBUTE = 'data-warpkeep-miniapp-safe-area';
const QUICK_AUTH_PRECONNECT_ATTRIBUTE =
  'data-warpkeep-miniapp-quick-auth-preconnect';
const QUICK_AUTH_ORIGIN = 'https://auth.farcaster.xyz';
const FRAME_TIMEOUT_MS = 160;
const MAX_QUICK_AUTH_TOKEN_BYTES = 8 * 1_024;
const MAX_NOTIFICATION_TOKEN_BYTES = 2 * 1_024;
const MAX_NOTIFICATION_ID_LENGTH = 128;
const ADMISSION_GRANT_NOTIFICATION_ID_PATTERN =
  /^warpkeep-access-grant-v3-i[A-Za-z0-9_-]{22}$/;
const COMPACT_JWT_PATTERN =
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const APPROVAL_NOTIFICATION_ID_PATTERN =
  /^(?:warpkeep-access-approved-(?:v1-e|v2-r)[1-9]\d*|warpkeep-access-grant-v3-i[A-Za-z0-9_-]{22})$/;
const ADMISSION_GRANT_FRAGMENT_PATTERN =
  /^#warpkeep-grant-v1=([A-Za-z0-9_-]{43})$/;
const ADMISSION_GRANT_TICKET_RETENTION_MILLISECONDS = 24 * 60 * 60 * 1_000;
type RetainedAdmissionGrantTicket = Readonly<{
  ticket: string;
  capturedAt: number;
  expiresAt: number;
  expirationTimer: ReturnType<typeof globalThis.setTimeout>;
}>;
const ADMISSION_GRANT_TICKETS = new WeakMap<
  Document,
  RetainedAdmissionGrantTicket
>();

function forgetMiniAppAdmissionGrantTicket(
  documentValue: Document,
  expected?: RetainedAdmissionGrantTicket
): boolean {
  const current = ADMISSION_GRANT_TICKETS.get(documentValue);
  if (!current || (expected !== undefined && current !== expected)) return false;
  globalThis.clearTimeout(current.expirationTimer);
  ADMISSION_GRANT_TICKETS.delete(documentValue);
  return true;
}

function readRetainedMiniAppAdmissionGrantTicket(
  documentValue: Document
): string | undefined {
  const retained = ADMISSION_GRANT_TICKETS.get(documentValue);
  if (!retained) return undefined;
  const now = Date.now();
  if (
    !Number.isSafeInteger(now)
    || now < retained.capturedAt
    || now >= retained.expiresAt
  ) {
    forgetMiniAppAdmissionGrantTicket(documentValue, retained);
    return undefined;
  }
  return retained.ticket;
}

function retainMiniAppAdmissionGrantTicket(
  documentValue: Document,
  ticket: string
): boolean {
  const capturedAt = Date.now();
  const expiresAt = capturedAt + ADMISSION_GRANT_TICKET_RETENTION_MILLISECONDS;
  if (
    !Number.isSafeInteger(capturedAt)
    || capturedAt < 0
    || !Number.isSafeInteger(expiresAt)
  ) return false;
  forgetMiniAppAdmissionGrantTicket(documentValue);
  let retained!: RetainedAdmissionGrantTicket;
  const expirationTimer = globalThis.setTimeout(() => {
    forgetMiniAppAdmissionGrantTicket(documentValue, retained);
  }, ADMISSION_GRANT_TICKET_RETENTION_MILLISECONDS);
  const unref = typeof expirationTimer === 'object'
    && expirationTimer !== null
    && 'unref' in expirationTimer
    ? (expirationTimer as { unref?: unknown }).unref
    : undefined;
  if (typeof unref === 'function') unref.call(expirationTimer);
  retained = Object.freeze({ ticket, capturedAt, expiresAt, expirationTimer });
  ADMISSION_GRANT_TICKETS.set(documentValue, retained);
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveFid(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null;
}

function sanitizedText(
  value: unknown,
  maximumLength: number,
  pattern?: RegExp
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(CONTROL_CHARACTERS, '').trim();
  if (
    normalized.length === 0
    || normalized.length > maximumLength
    || pattern && !pattern.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function sanitizedHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.href.length > 2_048
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * Reduces private host notification details to one presentation-only boolean.
 * The token and delivery URL never cross this return boundary.
 */
export function readMiniAppNotificationDetailsHint(value: unknown): boolean {
  try {
    if (!isRecord(value)) return false;
    // Snapshot hostile getters exactly once and reject by UTF-16 length before
    // allocating an encoded copy. The byte check below remains authoritative.
    const token = value.token;
    const url = value.url;
    if (
      typeof token !== 'string'
      || typeof url !== 'string'
      || token.length === 0
      || token.length > MAX_NOTIFICATION_TOKEN_BYTES
    ) return false;
    const tokenBytes = new TextEncoder().encode(token);
    try {
      return tokenBytes.byteLength >= 16
        && tokenBytes.byteLength <= MAX_NOTIFICATION_TOKEN_BYTES
        && !/[\u0000-\u0020\u007f]/.test(token)
        && sanitizedHttpsUrl(url) !== undefined;
    } finally {
      tokenBytes.fill(0);
    }
  } catch {
    return false;
  }
}

function sanitizedApprovalNotificationId(
  location: Record<string, unknown>,
  locationType: MiniAppPresentationContext['locationType'] | undefined
): string | undefined {
  if (locationType !== 'notification') return undefined;
  try {
    if (!isRecord(location.notification)) return undefined;
    const notificationId = location.notification.notificationId;
    return typeof notificationId === 'string'
      && notificationId.length <= MAX_NOTIFICATION_ID_LENGTH
      && APPROVAL_NOTIFICATION_ID_PATTERN.test(notificationId)
      ? notificationId
      : undefined;
  } catch {
    return undefined;
  }
}

export function isMiniAppAdmissionGrantNotificationId(
  value: unknown
): value is string {
  return typeof value === 'string'
    && value.length <= MAX_NOTIFICATION_ID_LENGTH
    && ADMISSION_GRANT_NOTIFICATION_ID_PATTERN.test(value);
}

/**
 * Capture the one-use admission grant capability before hash routing can
 * normalize the Mini App entry URL. The value remains process-memory-only;
 * it is never copied into history state or browser storage.
 */
export function captureMiniAppAdmissionGrantTicket(
  runtime: MiniAppBrowserRuntime,
  currentLocationOnly = false
): string | undefined {
  let hash: string;
  try {
    hash = runtime.hash?.() ?? '';
  } catch {
    return currentLocationOnly
      ? undefined
      : readRetainedMiniAppAdmissionGrantTicket(runtime.document);
  }
  const match = ADMISSION_GRANT_FRAGMENT_PATTERN.exec(hash);
  if (match) {
    const ticket = match[1];
    // A reused mobile WebView can receive a later notification without a new
    // Document. A valid current fragment atomically supersedes retained state.
    const retained = retainMiniAppAdmissionGrantTicket(runtime.document, ticket);
    try {
      runtime.replaceHash?.('#menu');
    } catch {
      // The capability is already retained in private memory. Failure to tidy a
      // presentation-only hash must not duplicate or discard it.
    }
    return retained ? ticket : undefined;
  }
  return currentLocationOnly
    ? undefined
    : readRetainedMiniAppAdmissionGrantTicket(runtime.document);
}

export function clearMiniAppAdmissionGrantTicket(
  documentValue: Document,
  expectedTicket: string
): boolean {
  if (readRetainedMiniAppAdmissionGrantTicket(documentValue) !== expectedTicket) {
    return false;
  }
  return forgetMiniAppAdmissionGrantTicket(documentValue);
}

function finiteAxis(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function clampInset(value: unknown, axis: number): number {
  const untrusted = typeof value === 'number' && Number.isFinite(value)
    ? value
    : 0;
  const maximum = Math.min(160, finiteAxis(axis) * 0.25);
  return Math.round(Math.min(maximum, Math.max(0, untrusted)) * 1_000) / 1_000;
}

type MiniAppInsetSeed = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

const MINI_APP_CONTEXT_INSET_SEEDS = new WeakMap<
  MiniAppPresentationContext,
  MiniAppInsetSeed
>();

function boundedInsetSeed(value: unknown): number {
  const untrusted = typeof value === 'number' && Number.isFinite(value)
    ? value
    : 0;
  return Math.round(Math.min(160, Math.max(0, untrusted)) * 1_000) / 1_000;
}

export function hasExactMiniAppHint(search: string): boolean {
  if (typeof search !== 'string' || !search.startsWith('?')) return false;
  const rawQuery = search.slice(1);
  const rawMatches = rawQuery
    .split('&')
    .filter((segment) => segment === 'miniApp=true');
  if (rawMatches.length !== 1) return false;
  const values = new URLSearchParams(search).getAll('miniApp');
  return values.length === 1 && values[0] === 'true';
}

export function sanitizeMiniAppCapabilities(
  value: unknown
): readonly MiniAppCapability[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const accepted = new Set<MiniAppCapability>();
  for (const candidate of value) {
    if (
      typeof candidate === 'string'
      && MINI_APP_CAPABILITY_SET.has(candidate)
    ) {
      accepted.add(candidate as MiniAppCapability);
    }
  }
  return Object.freeze(
    MINI_APP_CAPABILITIES.filter((capability) => accepted.has(capability))
  );
}

export function sanitizeMiniAppContext(
  value: unknown,
  viewport: Readonly<{ width: number; height: number }>
): MiniAppPresentationContext | null {
  try {
    if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.client)) {
      return null;
    }
    const userFid = positiveFid(value.user.fid);
    const clientFid = positiveFid(value.client.clientFid);
    if (userFid === null || clientFid === null) return null;

    const rawInsets = isRecord(value.client.safeAreaInsets)
      ? value.client.safeAreaInsets
      : {};
    const insetSeed = Object.freeze({
      top: boundedInsetSeed(rawInsets.top),
      right: boundedInsetSeed(rawInsets.right),
      bottom: boundedInsetSeed(rawInsets.bottom),
      left: boundedInsetSeed(rawInsets.left)
    });
    const insets = Object.freeze({
      top: clampInset(insetSeed.top, viewport.height),
      right: clampInset(insetSeed.right, viewport.width),
      bottom: clampInset(insetSeed.bottom, viewport.height),
      left: clampInset(insetSeed.left, viewport.width)
    });

    const username = sanitizedText(value.user.username, 64, USERNAME_PATTERN);
    const displayName = sanitizedText(value.user.displayName, 128);
    const pfpUrl = sanitizedHttpsUrl(value.user.pfpUrl);
    const user: MiniAppPresentationUser = Object.freeze({
      fid: userFid,
      ...(username ? { username } : {}),
      ...(displayName ? { displayName } : {}),
      ...(pfpUrl ? { pfpUrl } : {})
    });

    const platformType = value.client.platformType === 'web'
      || value.client.platformType === 'mobile'
      ? value.client.platformType
      : undefined;
    const features = isRecord(value.features) ? value.features : {};
    const location = isRecord(value.location) ? value.location : {};
    const rawLocationType = location.type;
    const locationType = typeof rawLocationType === 'string'
      && LOCATION_TYPES.has(rawLocationType)
      ? rawLocationType as MiniAppPresentationContext['locationType']
      : undefined;
    const notificationId = sanitizedApprovalNotificationId(
      location,
      locationType
    );
    let notificationDetails: unknown;
    try {
      notificationDetails = value.client.notificationDetails;
    } catch {
      notificationDetails = undefined;
    }

    const context: MiniAppPresentationContext = Object.freeze({
      user,
      client: Object.freeze({
        clientFid,
        added: value.client.added === true,
        notificationsEnabledHint: readMiniAppNotificationDetailsHint(
          notificationDetails
        ),
        ...(platformType ? { platformType } : {}),
        safeAreaInsets: insets
      }),
      features: Object.freeze({
        haptics: features.haptics === true,
        cameraAndMicrophoneAccess:
          features.cameraAndMicrophoneAccess === true
      }),
      ...(locationType ? { locationType } : {}),
      ...(notificationId ? { notificationId } : {})
    });
    MINI_APP_CONTEXT_INSET_SEEDS.set(context, insetSeed);
    return context;
  } catch {
    return null;
  }
}

/**
 * Re-clamp an already-sanitized presentation snapshot without retaining or
 * re-reading the mutable raw host object that produced it. Identity and other
 * host metadata stay pinned to the first verified snapshot for this attempt.
 */
export function reclampMiniAppPresentationContext(
  context: MiniAppPresentationContext,
  viewport: Readonly<{ width: number; height: number }>
): MiniAppPresentationContext {
  const insets = MINI_APP_CONTEXT_INSET_SEEDS.get(context)
    ?? context.client.safeAreaInsets;
  const reclamped: MiniAppPresentationContext = Object.freeze({
    user: context.user,
    client: Object.freeze({
      clientFid: context.client.clientFid,
      added: context.client.added,
      notificationsEnabledHint: context.client.notificationsEnabledHint,
      ...(context.client.platformType
        ? { platformType: context.client.platformType }
        : {}),
      safeAreaInsets: Object.freeze({
        top: clampInset(insets.top, viewport.height),
        right: clampInset(insets.right, viewport.width),
        bottom: clampInset(insets.bottom, viewport.height),
        left: clampInset(insets.left, viewport.width)
      })
    }),
    features: context.features,
    ...(context.locationType ? { locationType: context.locationType } : {}),
    ...(context.notificationId
      ? { notificationId: context.notificationId }
      : {})
  });
  MINI_APP_CONTEXT_INSET_SEEDS.set(reclamped, insets);
  return reclamped;
}

/**
 * Applies one secret-free notification projection while preserving the pinned
 * identity, launch context, and original safe-area seed.
 */
export function withMiniAppNotificationHints(
  context: MiniAppPresentationContext,
  hints: Readonly<{
    added: boolean;
    notificationsEnabledHint: boolean;
  }>
): MiniAppPresentationContext {
  const insets = MINI_APP_CONTEXT_INSET_SEEDS.get(context)
    ?? context.client.safeAreaInsets;
  const next: MiniAppPresentationContext = Object.freeze({
    user: context.user,
    client: Object.freeze({
      clientFid: context.client.clientFid,
      added: hints.added,
      notificationsEnabledHint: hints.notificationsEnabledHint,
      ...(context.client.platformType
        ? { platformType: context.client.platformType }
        : {}),
      safeAreaInsets: context.client.safeAreaInsets
    }),
    features: context.features,
    ...(context.locationType ? { locationType: context.locationType } : {}),
    ...(context.notificationId
      ? { notificationId: context.notificationId }
      : {})
  });
  MINI_APP_CONTEXT_INSET_SEEDS.set(next, insets);
  return next;
}

export function readMiniAppSdk(value: unknown): MiniAppSdk | null {
  if (!isRecord(value) || !isRecord(value.actions)) return null;
  if (
    typeof value.isInMiniApp !== 'function'
    || typeof value.actions.ready !== 'function'
  ) {
    return null;
  }
  return value as unknown as MiniAppSdk;
}

/**
 * Keep the SDK bearer outside host/context state and accept only the one
 * compact-JWT field documented by Quick Auth.
 */
export function readMiniAppQuickAuthToken(value: unknown): string | null {
  if (
    !isRecord(value)
    || Object.keys(value).length !== 1
    || typeof value.token !== 'string'
    || !COMPACT_JWT_PATTERN.test(value.token)
    || new TextEncoder().encode(value.token).byteLength
      > MAX_QUICK_AUTH_TOKEN_BYTES
  ) {
    return null;
  }
  return value.token;
}

export function installMiniAppSafeAreaVariables(
  document: Document,
  insets: MiniAppSafeAreaInsets
): () => void {
  const style = document.createElement('style');
  style.setAttribute(SAFE_AREA_STYLE_ATTRIBUTE, 'v1');
  style.textContent = [
    ':root{',
    `--fc-safe-area-inset-top:${insets.top}px;`,
    `--fc-safe-area-inset-right:${insets.right}px;`,
    `--fc-safe-area-inset-bottom:${insets.bottom}px;`,
    `--fc-safe-area-inset-left:${insets.left}px;`,
    '}'
  ].join('');
  document.head.append(style);
  return () => {
    style.remove();
  };
}

export function installMiniAppQuickAuthPreconnect(
  document: Document
): () => void {
  const existing = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel~="preconnect"]')
  ).find((link) => {
    try {
      return new URL(link.href, document.baseURI).origin === QUICK_AUTH_ORIGIN;
    } catch {
      return false;
    }
  });
  if (existing) return () => {};
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = QUICK_AUTH_ORIGIN;
  link.crossOrigin = 'anonymous';
  link.setAttribute(QUICK_AUTH_PRECONNECT_ATTRIBUTE, 'v1');
  document.head.append(link);
  return () => link.remove();
}

function defaultViewport(): Readonly<{ width: number; height: number }> {
  const root = document.documentElement;
  return Object.freeze({
    width: finiteAxis(window.innerWidth) || finiteAxis(root.clientWidth),
    height: finiteAxis(window.innerHeight) || finiteAxis(root.clientHeight)
  });
}

function waitForBoundedAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let frame = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
      resolve();
    };
    const timeout = window.setTimeout(finish, FRAME_TIMEOUT_MS);
    frame = window.requestAnimationFrame(finish);
  });
}

function subscribeDefaultViewportChange(listener: () => void): () => void {
  window.addEventListener('resize', listener, { passive: true });
  window.visualViewport?.addEventListener('resize', listener, { passive: true });
  return () => {
    window.removeEventListener('resize', listener);
    window.visualViewport?.removeEventListener('resize', listener);
  };
}

function subscribeDefaultNavigationChange(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener);
  window.addEventListener('pageshow', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('popstate', listener);
    window.removeEventListener('pageshow', listener);
  };
}

export const DEFAULT_MINI_APP_BROWSER_RUNTIME: MiniAppBrowserRuntime =
  Object.freeze({
    search: () => window.location.search,
    hash: () => window.location.hash,
    replaceHash: (hash: string) => {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}${hash}`
      );
    },
    subscribeNavigationChange: subscribeDefaultNavigationChange,
    isFramed: () => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    },
    viewport: defaultViewport,
    subscribeViewportChange: subscribeDefaultViewportChange,
    document,
    getMountedShell: () => document.getElementById('root'),
    waitForAnimationFrame: waitForBoundedAnimationFrame
  });

export const defaultMiniAppSdkLoader: MiniAppSdkLoader = async () => {
  const module = await import('@farcaster/miniapp-sdk');
  return module.sdk;
};

export function sanitizeMiniAppActionUrl(value: string): string | null {
  return sanitizedHttpsUrl(value) ?? null;
}
