import type { RealmCameraComposition } from './realmCameraController';
import type { RealmLabelReservedRect } from './realmCastlePresentation';

const RESERVED_REALM_UI_SELECTOR = [
  '.realm-hud',
  '.realm-profile-trigger',
  '.realm-resource-rail',
  '.castle-inspection',
  '.realm-hud__actions',
  '.realm-cell-navigator > button',
  '.realm-cell-navigator__dialog'
].join(', ');

export function isVisibleRealmUiElement(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * Measures visible fixed Realm UI once per composition change. Projection
 * frames consume these root-local rectangles without forcing layout on every
 * camera update.
 */
export function measuredVisibleRealmUiRects(root: HTMLElement): readonly RealmLabelReservedRect[] {
  const rootRect = root.getBoundingClientRect();
  return [...root.querySelectorAll<HTMLElement>(RESERVED_REALM_UI_SELECTOR)]
    .filter(isVisibleRealmUiElement)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => Object.freeze({
      left: Math.max(0, rect.left - rootRect.left),
      top: Math.max(0, rect.top - rootRect.top),
      right: Math.min(rootRect.width, rect.right - rootRect.left),
      bottom: Math.min(rootRect.height, rect.bottom - rootRect.top)
    }))
    .filter((rect) => rect.left < rect.right && rect.top < rect.bottom);
}

/** Measures only visible Realm chrome and returns camera-safe viewport insets. */
export function measuredRealmComposition(root: HTMLElement): RealmCameraComposition {
  const rootRect = root.getBoundingClientRect();
  const width = Math.max(1, rootRect.width);
  const height = Math.max(1, rootRect.height);
  const compact = width <= 760 || height <= 600;
  const shortLandscape = height <= 600 && width > 580;
  const gap = compact ? 10 : 16;
  const safeAreaProbe = root.querySelector<HTMLElement>('.realm-safe-area-probe');
  const probeStyle = safeAreaProbe ? window.getComputedStyle(safeAreaProbe) : undefined;
  const cssPixels = (value: string | undefined) => {
    const parsed = Number.parseFloat(value ?? '0');
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const safeAreaInsets = {
    top: cssPixels(probeStyle?.paddingTop),
    right: cssPixels(probeStyle?.paddingRight),
    bottom: cssPixels(probeStyle?.paddingBottom),
    left: cssPixels(probeStyle?.paddingLeft)
  };
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const rectFor = (selector: string) => {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) return undefined;
    if (!isVisibleRealmUiElement(element)) return undefined;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : undefined;
  };
  const reserveLeft = (rect: DOMRect) => {
    insets.left = Math.max(
      insets.left,
      rect.right - rootRect.left + gap - safeAreaInsets.left
    );
  };
  const reserveRight = (rect: DOMRect) => {
    insets.right = Math.max(
      insets.right,
      rootRect.right - rect.left + gap - safeAreaInsets.right
    );
  };
  const reserveTop = (rect: DOMRect) => {
    insets.top = Math.max(
      insets.top,
      rect.bottom - rootRect.top + gap - safeAreaInsets.top
    );
  };
  const reserveBottom = (rect: DOMRect) => {
    insets.bottom = Math.max(
      insets.bottom,
      rootRect.bottom - rect.top + gap - safeAreaInsets.bottom
    );
  };

  const hud = rectFor('.realm-hud');
  const inspector = rectFor('.castle-inspection');
  const actions = rectFor('.realm-hud__actions');
  const navigatorDialog = rectFor('.realm-cell-navigator__dialog');
  const navigatorTrigger = rectFor('.realm-cell-navigator > button');

  if (hud && !(compact && inspector && !shortLandscape)) {
    if (compact && !shortLandscape) reserveTop(hud);
    else reserveLeft(hud);
  }
  // Corner chrome is collision-reserved by its exact rectangle above. Turning
  // either small control into a full-width camera inset would needlessly crop
  // the playable realm, especially in short landscape viewports.
  if (inspector) {
    if (compact && !shortLandscape) reserveBottom(inspector);
    else reserveRight(inspector);
  }
  if (actions) reserveBottom(actions);
  if (navigatorDialog && !inspector) {
    if (compact && !shortLandscape) reserveBottom(navigatorDialog);
    else if (shortLandscape) reserveRight(navigatorDialog);
    else reserveLeft(navigatorDialog);
  } else if (navigatorTrigger && !inspector) {
    reserveBottom(navigatorTrigger);
  }

  return Object.freeze({
    insets: Object.freeze(insets),
    safeAreaInsets: Object.freeze(safeAreaInsets),
    focusPadding: compact ? 14 : 24
  });
}
