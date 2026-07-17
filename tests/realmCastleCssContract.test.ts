import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const MAP = readFileSync(
  resolve(ROOT, 'src/components/realm/RealmMapScreen.css'),
  'utf8'
);
const PRESENTATION = readFileSync(
  resolve(ROOT, 'src/components/realm/RealmCastlePresentation.css'),
  'utf8'
);
const GLOBAL = readFileSync(resolve(ROOT, 'src/styles/global.css'), 'utf8');
const HUD_COMPONENT = readFileSync(
  resolve(ROOT, 'src/components/realm/RealmHud.tsx'),
  'utf8'
);
const EXPLORE_COMPONENT = readFileSync(
  resolve(ROOT, 'src/components/realm/RealmAccessibilityControls.tsx'),
  'utf8'
);
const INSPECTOR_COMPONENT = readFileSync(
  resolve(ROOT, 'src/components/realm/CastleInspectionPanel.tsx'),
  'utf8'
);
const LABEL_COMPONENT = readFileSync(
  resolve(ROOT, 'src/components/realm/RealmCastleLabels.tsx'),
  'utf8'
);

function block(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, `Missing CSS marker: ${marker}`).toBeGreaterThanOrEqual(0);
  const opening = source.indexOf('{', markerIndex);
  expect(opening, `Missing opening brace after: ${marker}`).toBeGreaterThan(markerIndex);

  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(opening + 1, index);
  }
  throw new Error(`Unclosed CSS block: ${marker}`);
}

describe('compact Realm CSS contract', () => {
  it('keeps a stationary foundation nameplate inside a transparent 44px interaction target', () => {
    const label = block(PRESENTATION, '.realm-castle-label {');
    const plate = block(PRESENTATION, '.realm-castle-label__plate {');
    const compactLabel = block(PRESENTATION, '.realm-castle-label[data-compact="true"] {');
    const narrowPresentation = block(PRESENTATION, '@media (max-width: 680px) {');
    const narrowCompactLabel = block(
      narrowPresentation,
      '.realm-castle-label[data-compact="true"] {'
    );
    const avatarCanvas = block(PRESENTATION, '.realm-castle-avatar canvas {');

    expect(label).toContain('top: 0;');
    expect(label).toContain('left: 0;');
    expect(label).toContain('translate3d(');
    expect(label).toContain('var(--realm-castle-label-x)');
    expect(label).toContain('var(--realm-castle-label-y)');
    expect(label).toContain('translate(-50%, 0);');
    expect(label).toContain('z-index: 1;');
    expect(label).toContain('min-width: 45px;');
    expect(label).toContain('min-height: 45px;');
    expect(label).toContain('padding: 0;');
    expect(label).toContain('border: 0;');
    expect(label).toContain('background: transparent;');
    expect(label).toContain('box-shadow: none;');
    expect(label).not.toContain('var(--warpkeep-surface-bg-strong');
    expect(plate).toContain('min-height: 1.5rem;');
    expect(plate).toContain('border-left: 1px solid rgb(227 193 112 / 62%);');
    expect(plate).toContain('background: linear-gradient(');
    expect(plate).toContain('rgb(8 8 13 / 36%) 0%');
    expect(plate).toContain('rgb(13 10 20 / 0%) 100%');
    expect(plate).not.toContain('backdrop-filter:');
    expect(label).toContain('touch-action: none;');
    expect(label).not.toContain('will-change: transform;');
    expect(PRESENTATION).not.toMatch(/top:\s*var\(--realm-castle-label-y\)/);
    expect(PRESENTATION).not.toMatch(/left:\s*var\(--realm-castle-label-x\)/);
    expect(compactLabel).toContain('width: auto;');
    expect(compactLabel).toContain('min-width: 45px;');
    expect(compactLabel).toContain('max-width: 7.25rem;');
    expect(compactLabel).toContain('min-height: 45px;');
    expect(compactLabel).toContain('font-size: 0.8125rem;');
    expect(narrowCompactLabel).toContain('width: auto;');
    expect(narrowCompactLabel).toContain('min-width: 45px;');
    expect(narrowCompactLabel).toContain('max-width: 6.75rem;');
    expect(narrowCompactLabel).toContain('font-size: 0.75rem;');
    expect(PRESENTATION).toContain('.realm-castle-label__identity');
    expect(PRESENTATION).toContain('font-size: 0.8125rem;');
    expect(PRESENTATION).not.toContain('.realm-castle-cluster');
    expect(PRESENTATION).toContain('.realm-castle-label[data-own="true"] {');
    expect(PRESENTATION).toContain('.realm-castle-label[data-focused="true"] {');
    expect(PRESENTATION).toContain('.realm-castle-label[data-hovered="true"]');
    expect(block(PRESENTATION, '.realm-castle-label[data-own="true"] {'))
      .toContain('z-index: 2;');
    expect(block(PRESENTATION, '.realm-castle-label[data-focused="true"] {'))
      .toContain('z-index: 3;');
    expect(LABEL_COMPONENT).toContain('data-anchor="foundation-base"');
    expect(LABEL_COMPONENT).toContain('data-displaced="false"');
    expect(LABEL_COMPONENT).not.toContain('data-realm-label-leader');
    expect(LABEL_COMPONENT).not.toContain('data-realm-castle-cluster');
    expect(label).not.toMatch(/(?:animation|transition)[^;]*(?:opacity|transform)/);
    const renderedLabelLayer = LABEL_COMPONENT.slice(
      LABEL_COMPONENT.indexOf('export function RealmCastleLabels')
    );
    expect(renderedLabelLayer).not.toContain('<CastleProfileAvatar');

    expect(avatarCanvas).toContain('display: block;');
    expect(avatarCanvas).toContain('width: 100%;');
    expect(avatarCanvas).toContain('height: 100%;');
    expect(avatarCanvas).toContain('border-radius: inherit;');
    expect(PRESENTATION).not.toContain('.realm-castle-avatar img');

    expect(GLOBAL).toContain('.landing-shell button:hover:not(:disabled)');
    expect(GLOBAL).not.toMatch(/^button:hover[^\n{]*\{/m);
  });

  it('keeps the local castle artwork decorative, bounded, and clear of record controls', () => {
    const inspector = block(PRESENTATION, '.castle-inspection {');
    const hero = block(PRESENTATION, '.castle-inspection__hero {');
    const heroArt = block(PRESENTATION, '.castle-inspection__hero-art {');
    const titleLockupTypography = PRESENTATION.slice(
      PRESENTATION.indexOf('.castle-inspection__title-lockup p {')
    );
    const title = block(titleLockupTypography, '.castle-inspection__title-lockup h2 {');
    const body = block(PRESENTATION, '.castle-inspection__body {');

    expect(inspector).toContain('width: min(21.5rem, calc(100vw - 1.6rem));');
    expect(hero).toContain('min-height: 12.15rem;');
    expect(hero).toContain('overflow: hidden;');
    expect(heroArt).toContain('width: 92%;');
    expect(heroArt).toContain('height: 12.75rem;');
    expect(heroArt).toContain('object-fit: contain;');
    expect(heroArt).toContain('pointer-events: none;');
    expect(heroArt).toContain('user-select: none;');
    expect(title).toContain('text-overflow: ellipsis;');
    expect(title).toContain('white-space: nowrap;');
    expect(body).toContain('overflow-x: hidden;');
    expect(body).toContain('overflow-y: auto;');

    expect(INSPECTOR_COMPONENT).toContain('alt=""');
    expect(INSPECTOR_COMPONENT).toContain('aria-hidden="true"');
    expect(INSPECTOR_COMPONENT).toContain('decoding="async"');
    expect(INSPECTOR_COMPONENT).toContain('height="1254"');
    expect(INSPECTOR_COMPONENT).toContain('width="1254"');
    expect(INSPECTOR_COMPONENT).toContain(
      "publicAssetUrl('images/realm/hegemony-castle-record.webp')"
    );
  });

  it('keeps a slim identity/selection card beside stable Menu, Home, and Explore actions', () => {
    const hud = block(MAP, '.realm-hud {');
    const header = block(MAP, '.realm-hud__header {');
    const selection = block(MAP, '.realm-hud__selection {');
    const actions = block(MAP, '.realm-hud__actions {');
    const explore = block(MAP, '.realm-cell-navigator {');
    const exploreTrigger = block(MAP, '.realm-cell-navigator > button {');

    expect(hud).toContain('width: min(15.5rem, calc(100vw - 1.6rem));');
    expect(hud).toContain('gap: 0.42rem;');
    expect(hud).toContain('padding: 0.68rem 0.74rem;');
    expect(header).toContain('grid-template-columns: auto minmax(0, 1fr) auto;');
    expect(MAP).toContain('.realm-hud .realm-castle-avatar {');
    expect(MAP).toContain('.realm-hud__identity {');
    expect(selection).toContain('padding-top: 0.42rem;');
    expect(actions).toContain('position: fixed;');
    expect(actions).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(actions).toContain('width: 9.75rem;');
    expect(actions).toContain('bottom: max(0.8rem, env(safe-area-inset-bottom));');
    expect(explore).toContain('left: max(11.2rem, calc(env(safe-area-inset-left) + 11.2rem));');
    expect(explore).toContain('bottom: max(0.8rem, env(safe-area-inset-bottom));');
    expect(exploreTrigger).toContain('width: 8.75rem;');

    expect(HUD_COMPONENT).toContain('aria-label="Return to Menu"');
    expect(HUD_COMPONENT).toContain('<span aria-hidden="true">Menu</span>');
    expect(HUD_COMPONENT).toContain('aria-label="Recenter Keep"');
    expect(HUD_COMPONENT).toContain('<span aria-hidden="true">Home</span>');
    expect(HUD_COMPONENT).not.toMatch(/Founding District|Inspect Keep|Realm View/);
    expect(EXPLORE_COMPONENT).toContain('Explore <span>{castles.length}');
    expect(EXPLORE_COMPONENT).toContain('aria-label={`Explore realm, ${castles.length} founded');
  });

  it('contains public names, keeps meaningful copy readable, and preserves 44px controls', () => {
    const hudTitle = block(MAP, '.realm-hud__header h1 {');
    const selection = block(MAP, '.realm-hud__selection strong {');
    const hudButton = block(MAP, '.realm-hud__actions button {');
    const exploreTrigger = block(MAP, '.realm-cell-navigator > button {');
    const exploreControls = block(MAP, '.realm-cell-navigator__heading button,');
    const communityLink = block(MAP, '.realm-cell-navigator__community a {');
    const jumpInput = block(MAP, '.realm-cell-navigator__jump input {');
    const castleLabel = block(PRESENTATION, '.realm-castle-label {');
    const dismiss = block(PRESENTATION, '.castle-inspection__dismiss {');
    const profileLink = block(PRESENTATION, '.castle-inspection__profile-link {');
    const inspectorIdentity = block(
      PRESENTATION,
      '.castle-inspection__identity-copy span,\n.castle-inspection__bio {'
    );

    expect(hudTitle).toContain('overflow: hidden;');
    expect(hudTitle).toContain('text-overflow: ellipsis;');
    expect(hudTitle).toContain('white-space: nowrap;');
    expect(selection).toContain('font-size: 0.8125rem;');
    expect(hudButton).toContain('min-height: 2.75rem;');
    expect(exploreTrigger).toContain('min-height: 3.35rem;');
    expect(exploreControls).toContain('min-height: 2.75rem;');
    expect(communityLink).toContain('min-height: 2.75rem;');
    expect(communityLink).toContain('font: 760 0.6875rem/1.2 Inter');
    expect(jumpInput).toContain('min-width: 2.75rem;');
    expect(castleLabel).toContain('min-width: 45px;');
    expect(castleLabel).toContain('min-height: 45px;');
    expect(dismiss).toContain('min-height: 2.75rem;');
    expect(profileLink).toContain('min-height: 2.75rem;');
    expect(inspectorIdentity).toContain('overflow-wrap: anywhere;');
  });

  it('keeps Explore scrollable, readable, and responsive without reviving the old cell grid', () => {
    const dialog = block(MAP, '.realm-cell-navigator__dialog {');
    const openNavigator = block(
      MAP,
      '.realm-cell-navigator:has(.realm-cell-navigator__dialog) {'
    );
    const interactiveDialog = block(
      MAP,
      '.realm-cell-navigator:has(.realm-cell-navigator__dialog) .realm-cell-navigator__dialog {'
    );
    const presets = block(MAP, '.realm-cell-navigator__presets > div {');
    const jump = block(MAP, '.realm-cell-navigator__jump fieldset {');
    const narrowest = block(MAP, '@media (max-width: 360px) {');
    const narrowestCommunityActions = block(
      narrowest,
      '.realm-cell-navigator__community-actions {'
    );
    const castleSecondaryCopy = block(
      MAP,
      '.realm-cell-navigator__castles span,\n.realm-cell-navigator__castles small {'
    );

    expect(dialog).toContain('overflow-x: hidden;');
    expect(dialog).toContain('overflow-y: auto;');
    expect(dialog).toContain('max-height: min(58svh, 35rem);');
    expect(openNavigator).toContain('pointer-events: none;');
    expect(interactiveDialog).toContain('pointer-events: auto;');
    expect(presets).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(jump).toContain('min-width: 0;');
    expect(jump).toContain('box-sizing: border-box;');
    expect(castleSecondaryCopy).toContain('font-size: 0.8125rem;');
    expect(narrowestCommunityActions).toContain('grid-template-columns: minmax(0, 1fr);');

    for (const obsoleteSelector of [
      '.realm-cell-navigator summary',
      '.realm-cell-navigator__pagination',
      '.realm-cell-navigator__map-focus',
      '.realm-cell-navigator__grid'
    ]) {
      expect(MAP).not.toContain(obsoleteSelector);
    }
  });

  it('uses the device-safe edge for compact sheets instead of reserving a ghost toolbar band', () => {
    const compactMap = block(MAP, '@media (max-width: 760px) {');
    const compactPresentation = block(PRESENTATION, '@media (max-width: 760px) {');
    const compactHud = block(compactMap, '.realm-hud {');
    const compactActions = block(compactMap, '.realm-hud__actions {');
    const compactExplore = block(compactMap, '.realm-cell-navigator {');
    const compactDialog = block(compactMap, '.realm-cell-navigator__dialog {');
    const hiddenTrigger = block(
      compactMap,
      '.realm-cell-navigator:has(.realm-cell-navigator__dialog) > button {'
    );
    const hiddenCoveredUi = block(
      compactMap,
      '.realm-map-screen:has(.castle-inspection) .realm-hud,'
    );
    const compactInspector = block(compactPresentation, '.castle-inspection {');

    expect(compactHud).toContain('width: min(14.75rem,');
    expect(compactActions).toContain('bottom: max(0.55rem, env(safe-area-inset-bottom));');
    expect(compactActions).toContain('* 0.56);');
    expect(compactExplore).toContain('right: max(0.55rem, env(safe-area-inset-right));');
    expect(compactExplore).toContain('bottom: max(0.55rem, env(safe-area-inset-bottom));');
    expect(compactExplore).toContain('* 0.42);');

    expect(compactDialog).toContain('position: fixed;');
    expect(compactDialog).toContain('right: max(0.55rem, env(safe-area-inset-right));');
    expect(compactDialog).toContain('bottom: max(0.55rem, env(safe-area-inset-bottom));');
    expect(compactDialog).toContain('left: max(0.55rem, env(safe-area-inset-left));');
    expect(compactDialog).toContain('max-height: calc(100svh - 1.1rem');
    expect(hiddenTrigger).toContain('visibility: hidden;');
    expect(hiddenTrigger).toContain('pointer-events: none;');
    expect(hiddenCoveredUi).toContain('visibility: hidden;');
    expect(hiddenCoveredUi).toContain('pointer-events: none;');
    expect(compactMap).toContain(
      '.realm-map-screen:has(.castle-inspection) .realm-hud__actions,'
    );
    expect(compactMap).toContain(
      '.realm-map-screen:has(.realm-cell-navigator__dialog) .realm-hud__actions {'
    );

    expect(compactInspector).toContain('bottom: max(0.55rem, env(safe-area-inset-bottom));');
    expect(compactInspector).toContain('max-height: min(78svh, 36rem);');
    const compactHero = block(compactPresentation, '.castle-inspection__hero {');
    const compactHeroArt = block(compactPresentation, '.castle-inspection__hero-art {');
    const compactBody = block(compactPresentation, '.castle-inspection__body {');
    expect(compactHero).toContain('min-height: 10.25rem;');
    expect(compactHeroArt).toContain('height: 10.9rem;');
    expect(compactBody).toContain('max-height: min(calc(78svh - 10.25rem), 25.75rem);');
    expect(`${MAP}\n${PRESENTATION}`).not.toMatch(/7\.1rem|6\.55rem/);
  });

  it('keeps narrow portrait and short-landscape controls bounded and mutually clear', () => {
    const narrow = block(MAP, '@media (max-width: 430px) {');
    const compactest = block(MAP, '@media (max-width: 360px) {');
    const shortMap = block(MAP, '@media (max-height: 600px) and (min-width: 581px) {');
    const shortPresentation = block(
      PRESENTATION,
      '@media (max-height: 600px) and (min-width: 581px) {'
    );
    const narrowHud = block(narrow, '.realm-hud {');
    const narrowBadges = block(narrow, '.realm-hud__badges {');
    const narrowJump = block(narrow, '.realm-cell-navigator__jump fieldset {');
    const compactestExploreCount = block(
      compactest,
      '.realm-cell-navigator > button span {'
    );
    const shortHud = block(shortMap, '.realm-hud {');
    const shortActions = block(shortMap, '.realm-hud__actions {');
    const shortExplore = block(shortMap, '.realm-cell-navigator {');
    const shortDialog = block(shortMap, '.realm-cell-navigator__dialog {');
    const shortJump = block(shortMap, '.realm-cell-navigator__jump fieldset {');
    const shortInspector = block(shortPresentation, '.castle-inspection {');
    const shortHero = block(shortPresentation, '.castle-inspection__hero {');
    const shortHeroArt = block(shortPresentation, '.castle-inspection__hero-art {');
    const shortVisibleUi = block(
      shortMap,
      '.realm-map-screen:has(.realm-cell-navigator__dialog) .realm-hud,'
    );

    expect(narrowHud).toContain('width: min(13.75rem,');
    expect(narrowBadges).toContain('display: none;');
    expect(narrowJump).toContain('grid-template-columns: auto minmax(0, 1fr);');
    expect(compactestExploreCount).toContain('display: none;');
    expect(EXPLORE_COMPONENT).toContain('aria-label={`Explore realm, ${castles.length} founded');

    expect(shortHud).toContain('width: min(13.5rem, 31vw);');
    expect(shortActions).toContain('width: 8.75rem;');
    expect(shortActions).toContain('bottom: max(0.45rem, env(safe-area-inset-bottom));');
    expect(shortExplore).toContain('left: max(10rem, calc(env(safe-area-inset-left) + 10rem));');
    expect(shortExplore).toContain('width: 7.75rem;');
    expect(shortDialog).toContain('right: max(0.55rem, env(safe-area-inset-right));');
    expect(shortDialog).toContain('bottom: max(0.45rem, env(safe-area-inset-bottom));');
    expect(shortDialog).toContain('width: min(18rem, 43vw);');
    expect(shortDialog).toContain('max-height: none;');
    expect(shortJump).toContain('grid-template-columns: auto minmax(2.75rem, 1fr);');
    expect(shortVisibleUi).toContain('visibility: visible;');
    expect(shortVisibleUi).toContain('pointer-events: auto;');
    expect(shortMap).toContain(
      '.realm-map-screen:has(.castle-inspection) .realm-hud__actions {'
    );

    expect(shortInspector).toContain('right: max(0.55rem, env(safe-area-inset-right));');
    expect(shortInspector).toContain('bottom: max(0.45rem, env(safe-area-inset-bottom));');
    expect(shortInspector).toContain('width: min(19.5rem, 43vw);');
    expect(shortHero).toContain('min-height: 7.8rem;');
    expect(shortHeroArt).toContain('height: 8.55rem;');
    expect(`${MAP}\n${PRESENTATION}`).not.toContain('30rem');
  });

  it('does not retain removed telemetry, hints, audit fields, or future-action styling', () => {
    for (const removedSelector of [
      '.realm-hud__shared-state',
      '.realm-hud__hint',
      '.castle-inspection details',
      '.castle-inspection summary',
      '.castle-inspection__close',
      '.castle-inspection__policy',
      '.castle-inspection__warp-preview'
    ]) {
      expect(`${MAP}\n${PRESENTATION}`).not.toContain(removedSelector);
    }

    expect(HUD_COMPONENT).not.toMatch(/sharedTileCount|sharedPlayerCount|sharedCastleCount|movement cost|generation/);
    expect(INSPECTOR_COMPONENT).not.toMatch(
      /CASTLE_WARP|First Warpkeep authentication|Admitted to Hegemony|marksPolicyVersion|marksEarnedMicros|marksSpentMicros|Durability|Destroy|Health|Alliance|publicStatus|\bFID\b/
    );
  });
});
