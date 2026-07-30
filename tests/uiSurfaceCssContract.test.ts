import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function css(path: string) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function lastBlock(source: string, selector: string) {
  const selectorIndex = source.lastIndexOf(selector);
  expect(selectorIndex, `Missing CSS selector ${selector}`).toBeGreaterThanOrEqual(0);
  const opening = source.indexOf('{', selectorIndex);
  expect(opening).toBeGreaterThan(selectorIndex);

  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(opening + 1, index);
  }
  throw new Error(`Unclosed CSS block: ${selector}`);
}

function firstBlock(source: string, selector: string) {
  const selectorIndex = source.indexOf(selector);
  expect(selectorIndex, `Missing CSS selector ${selector}`).toBeGreaterThanOrEqual(0);
  const opening = source.indexOf('{', selectorIndex);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(opening + 1, index);
  }
  throw new Error(`Unclosed CSS block: ${selector}`);
}

describe('shared Warpkeep surface system', () => {
  it('keeps generic buttons neutral so scene controls retain their own geometry', () => {
    const source = css('src/styles/global.css');
    const genericButton = firstBlock(source, '\nbutton {');

    expect(source).toContain('--warpkeep-surface-bg:');
    expect(source).toContain('--warpkeep-surface-blur: 12px;');
    expect(genericButton).not.toMatch(/(?:border|background|padding|transform)\s*:/);
    expect(source).not.toMatch(/^button:hover[^\n{]*\{/m);
    expect(source).not.toContain('.landing-shell');
    expect(source).not.toContain('.dashboard-shell');
  });

  it('gives every mobile Realm drawer an explicit vertical touch lane', () => {
    const source = css('src/styles/global.css');
    const touchLanes = firstBlock(source, ':is(\n  .warpkeep-patch-notes,');

    for (const selector of [
      '.water-inspection__drawer',
      '.water-inspection__body',
      '.worker-inspection__drawer',
      '.worker-inspection__body',
      '.worker-command-center'
    ]) {
      expect(source).toContain(selector);
    }
    expect(touchLanes).toContain('-webkit-overflow-scrolling: touch;');
    expect(touchLanes).toContain('touch-action: pan-y;');
  });

  it.each([
    ['src/components/menu/LatestPatchNotesPopover.css', '.warpkeep-patch-notes {'],
    ['src/components/menu/AlphaParticipationTermsDialog.css', '.warpkeep-alpha-terms__panel {'],
    ['src/components/menu/SettingsPanel.css', '.warpkeep-settings__panel {'],
    ['src/components/auth/FarcasterQrAuthPanel.css', '.farcaster-auth-panel {'],
    ['src/components/realm/RealmCastlePresentation.css', '.castle-inspection__drawer {']
  ])('%s uses a flat shared window surface', (path, selector) => {
    const block = firstBlock(css(path), selector);

    expect(block).toContain('background: var(--warpkeep-surface-bg');
    expect(block).toContain('box-shadow: var(--warpkeep-surface-shadow');
    expect(block).toContain('backdrop-filter: blur(var(--warpkeep-surface-blur, 12px));');
    expect(block).not.toContain('gradient(');
  });

  it('keeps realm HUD and navigator surfaces flat while preserving scene gradients', () => {
    const source = css('src/components/realm/RealmMapScreen.css');
    expect(source).toContain('--realm-panel: var(--warpkeep-surface-bg,');
    for (const selector of ['.realm-hud {', '.realm-cell-navigator__dialog {']) {
      const matchingBlock = source
        .split(selector)
        .slice(1)
        .map((tail) => tail.slice(0, tail.indexOf('}')))
        .find((block) => block.includes('background: var(--realm-panel);'));
      expect(matchingBlock, `Missing shared surface declaration for ${selector}`).toBeDefined();
      expect(matchingBlock).toContain(
        'backdrop-filter: blur(var(--warpkeep-surface-blur, 12px));'
      );
      expect(matchingBlock).not.toContain('gradient(');
    }
  });

  it('confirms valid world selection without motion-only feedback', () => {
    const source = css('src/components/realm/RealmMapScreen.css');
    const feedback = firstBlock(source, '.realm-world-selection-feedback {');
    const reduced = lastBlock(source, '.realm-world-selection-feedback {');

    expect(feedback).toContain('pointer-events: none;');
    expect(feedback).toContain('border: 2px solid');
    expect(feedback).toContain('realm-world-selection-confirm 420ms');
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(reduced).toContain('realm-world-selection-confirm-reduced 180ms');
    expect(reduced).not.toContain('scale(');
  });

  it('keeps persistent player chrome visually unboxed until the profile menu opens', () => {
    const source = css('src/components/realm/RealmPlayerChrome.css');
    const profileTrigger = firstBlock(source, '.realm-profile-trigger {');
    const resourceRail = firstBlock(source, '.realm-resource-rail {');
    const resourceItem = firstBlock(source, '.realm-resource-rail li {');
    const menu = firstBlock(source, '.realm-profile-menu__panel {');

    expect(profileTrigger).toContain('border: 0;');
    expect(profileTrigger).toContain('background: transparent;');
    expect(profileTrigger).not.toContain('backdrop-filter:');
    expect(resourceRail).toContain('border: 0;');
    expect(resourceRail).not.toContain('backdrop-filter:');
    expect(resourceItem).toContain('border: 0;');
    expect(resourceItem).toContain('background: transparent;');
    expect(menu).toContain('backdrop-filter: blur(14px);');
    expect(menu).toContain('overflow: auto;');
  });

  it('keeps the mobile Worker inspector inside every device safe area', () => {
    const source = css('src/components/realm/WorkerInspectionPanel.css');
    const dismiss = lastBlock(source, '.worker-inspection__dismiss');
    const closeToRealm = firstBlock(source, '.worker-inspection__close-to-realm{');
    const body = lastBlock(source, '.worker-inspection__body');
    const drawer = lastBlock(source, '.worker-inspection__drawer');

    expect(closeToRealm).toContain('env(safe-area-inset-top)');
    expect(closeToRealm).toContain('env(safe-area-inset-right)');
    expect(dismiss).toContain('env(safe-area-inset-left)');
    expect(body).toContain('env(safe-area-inset-right)');
    expect(body).toContain('env(safe-area-inset-bottom)');
    expect(body).toContain('env(safe-area-inset-left)');
    expect(drawer).toContain('env(safe-area-inset-top)');
  });

  it('keeps water and worker record controls touch-safe across notched mobile screens', () => {
    const water = css('src/components/realm/WaterInspectionPanel.css');
    const workerCenter = css('src/components/realm/WorkerCommandCenter.css');
    const waterAction = lastBlock(water, '.water-inspection__actions button');
    const waterDismiss = lastBlock(water, '.water-inspection__dismiss');
    const workerDismiss = lastBlock(workerCenter, '.worker-command-center__header button');
    const workerFooter = lastBlock(workerCenter, '.worker-command-center__footer button');
    const mobileWorker = lastBlock(workerCenter, '@media (max-width: 40rem) {');
    const mobileWorkerScrim = firstBlock(
      mobileWorker,
      '.worker-command-center__scrim'
    );

    expect(waterAction).toContain('min-height:2.75rem');
    expect(waterDismiss).toContain('env(safe-area-inset-top)');
    expect(waterDismiss).toContain('env(safe-area-inset-right)');
    expect(workerDismiss).toContain('min-height: 2.75rem;');
    expect(workerFooter).toContain('min-height: 2.75rem;');
    expect(mobileWorkerScrim).toContain('env(safe-area-inset-bottom)');
    expect(water).toContain('@media (prefers-reduced-motion: reduce)');
    expect(workerCenter).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('removes backdrop compositing on the performance profile and has an opaque fallback', () => {
    const source = css('src/components/WarpkeepExperience.css');
    const performance = firstBlock(
      source,
      '.warpkeep-experience[data-graphics-quality="performance"] {'
    );

    expect(performance).toContain('--warpkeep-surface-bg: rgba(7, 9, 15, 0.97);');
    expect(performance).toContain('--warpkeep-surface-bg-strong: #07090f;');
    expect(source).toContain('.realm-profile-menu__panel,');
    expect(source).toMatch(
      /data-graphics-quality="performance"\] :is\([\s\S]*?\.farcaster-auth-panel,[\s\S]*?\.realm-hud,[\s\S]*?\.castle-inspection__drawer,[\s\S]*?\.realm-castle-label__plate[\s\S]*?\)\s*\{[\s\S]*?backdrop-filter:\s*none;/
    );
    expect(source).toContain(
      '@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))'
    );
  });
});
