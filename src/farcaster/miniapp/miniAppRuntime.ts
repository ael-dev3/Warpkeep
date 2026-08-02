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
    /**
     * Presentation-only hint derived from the presence of host notification
     * details. The secret notification token and delivery URL are never kept.
     */
    notificationsEnabled: boolean;
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
}>;

export type MiniAppBack = {
  onback: (() => unknown) | null;
  show: () => Promise<void>;
  hide: () => Promise<void>;
};

export type MiniAppSdk = {
  isInMiniApp: () => Promise<boolean>;
  context: Promise<unknown>;
  getCapabilities?: () => Promise<unknown>;
  quickAuth?: {
    getToken?: () => Promise<unknown>;
  };
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
const COMPACT_JWT_PATTERN =
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

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

function hostReportsNotificationDetails(value: unknown): boolean {
  if (!isRecord(value) || typeof value.token !== 'string') return false;
  const tokenBytes = new TextEncoder().encode(value.token);
  try {
    return tokenBytes.byteLength >= 16
      && tokenBytes.byteLength <= 2 * 1_024
      && !/[\u0000-\u0020\u007f]/.test(value.token)
      && sanitizedHttpsUrl(value.url) !== undefined;
  } finally {
    tokenBytes.fill(0);
  }
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
    const rawLocationType = isRecord(value.location)
      ? value.location.type
      : undefined;
    const locationType = typeof rawLocationType === 'string'
      && LOCATION_TYPES.has(rawLocationType)
      ? rawLocationType as MiniAppPresentationContext['locationType']
      : undefined;

    const context: MiniAppPresentationContext = Object.freeze({
      user,
      client: Object.freeze({
        clientFid,
        added: value.client.added === true,
        // This is only a sanitized host preference hint. Server-side consent
        // exists solely after the signed webhook is verified and persisted.
        notificationsEnabled: hostReportsNotificationDetails(
          value.client.notificationDetails
        ),
        ...(platformType ? { platformType } : {}),
        safeAreaInsets: insets
      }),
      features: Object.freeze({
        haptics: features.haptics === true,
        cameraAndMicrophoneAccess:
          features.cameraAndMicrophoneAccess === true
      }),
      ...(locationType ? { locationType } : {})
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
      notificationsEnabled: context.client.notificationsEnabled,
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
    ...(context.locationType ? { locationType: context.locationType } : {})
  });
  MINI_APP_CONTEXT_INSET_SEEDS.set(reclamped, insets);
  return reclamped;
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
  const existing = document.head.querySelector<HTMLLinkElement>(
    `link[${QUICK_AUTH_PRECONNECT_ATTRIBUTE}]`
  );
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

export const DEFAULT_MINI_APP_BROWSER_RUNTIME: MiniAppBrowserRuntime =
  Object.freeze({
    search: () => window.location.search,
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
