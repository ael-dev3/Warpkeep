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
    expect(source).toContain('.landing-shell button:hover:not(:disabled)');
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

  it('removes backdrop compositing on the performance profile and has an opaque fallback', () => {
    const source = css('src/components/WarpkeepExperience.css');
    const performance = firstBlock(
      source,
      '.warpkeep-experience[data-graphics-quality="performance"] {'
    );

    expect(performance).toContain('--warpkeep-surface-bg: rgba(7, 9, 15, 0.97);');
    expect(performance).toContain('--warpkeep-surface-bg-strong: #07090f;');
    expect(source).toMatch(
      /data-graphics-quality="performance"\] :is\([\s\S]*?\.farcaster-auth-panel,[\s\S]*?\.realm-hud,[\s\S]*?\.castle-inspection__drawer[\s\S]*?\)\s*\{[\s\S]*?backdrop-filter:\s*none;/
    );
    expect(source).toContain(
      '@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))'
    );
  });
});
