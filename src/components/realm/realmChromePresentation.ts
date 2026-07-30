export type RealmChromeMode = 'desktop-web' | 'compact-web' | 'miniapp';
export type RealmSurfacePresentation = 'drawer' | 'fullscreen-destination';

export type RealmViewportPresentationInput = Readonly<{
  miniApp: boolean;
  width: number;
  height: number;
  coarsePointer: boolean;
}>;

export type RealmVisualViewportPresentationInput =
  RealmViewportPresentationInput & Readonly<{
    layoutWidth: number;
    layoutHeight: number;
  }>;

function boundedViewportDimension(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function resolveRealmChromeMode(
  input: RealmViewportPresentationInput
): RealmChromeMode {
  if (input.miniApp) return 'miniapp';
  const width = boundedViewportDimension(input.width);
  const height = boundedViewportDimension(input.height);
  if (
    width <= 680
    || height <= 600
    || (input.coarsePointer && width <= 900)
  ) {
    return 'compact-web';
  }
  return 'desktop-web';
}

/**
 * The software keyboard shrinks VisualViewport without changing the layout
 * viewport. That transient height change must resize the current destination,
 * not turn a desktop drawer into a compact full-screen route (or vice versa).
 *
 * A real compact/short window still resolves from its layout viewport. The
 * exception applies only when the layout is desktop-sized, the visual width is
 * effectively unchanged, and a keyboard-sized vertical occlusion is present.
 */
export function resolveRealmChromeModeFromViewport(
  input: RealmVisualViewportPresentationInput
): RealmChromeMode {
  if (input.miniApp) return 'miniapp';

  const visualMode = resolveRealmChromeMode(input);
  if (visualMode === 'desktop-web') return visualMode;

  const layoutWidth = boundedViewportDimension(input.layoutWidth);
  const layoutHeight = boundedViewportDimension(input.layoutHeight);
  const layoutMode = resolveRealmChromeMode({
    miniApp: false,
    width: layoutWidth,
    height: layoutHeight,
    coarsePointer: input.coarsePointer
  });
  if (layoutMode !== 'desktop-web') return visualMode;

  const visualWidth = boundedViewportDimension(input.width);
  const visualHeight = boundedViewportDimension(input.height);
  const maximumWidthDrift = Math.max(8, Math.floor(layoutWidth * 0.05));
  const keyboardSizedOcclusion = Math.max(
    120,
    Math.floor(layoutHeight * 0.18)
  );
  const widthIsStable = Math.abs(layoutWidth - visualWidth) <= maximumWidthDrift;
  const heightIsOccluded =
    layoutHeight - visualHeight >= keyboardSizedOcclusion;

  return widthIsStable && heightIsOccluded ? 'desktop-web' : visualMode;
}

export function realmSurfacePresentation(mode: RealmChromeMode): RealmSurfacePresentation {
  return mode === 'desktop-web' ? 'drawer' : 'fullscreen-destination';
}
