import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readCssBlock(source: string, opening: string): string {
  const openingIndex = source.indexOf(opening);
  expect(openingIndex).toBeGreaterThanOrEqual(0);

  const blockStart = source.indexOf('{', openingIndex);
  expect(blockStart).toBeGreaterThan(openingIndex);

  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(blockStart + 1, index);
      }
    }
  }

  throw new Error(`Unclosed CSS block: ${opening}`);
}

describe('Warpkeep main-menu responsive layout', () => {
  it('aligns every desktop menu surface to one shared rail centerline', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const menu = readCssBlock(css, '.warpkeep-menu {');
    const heading = readCssBlock(css, '.warpkeep-menu-heading {');
    const navigation = readCssBlock(css, '.warpkeep-menu-nav {');
    const identity = readCssBlock(css, '.warpkeep-menu-identity {');
    const authRail = readCssBlock(css, '.warpkeep-menu-auth-rail {');

    expect(menu).toContain('--warpkeep-menu-rail-width:');
    expect(menu).toContain('--warpkeep-menu-rail-half-width:');
    expect(menu).toContain('--warpkeep-menu-rail-right:');
    expect(heading).toContain(
      'right: calc(var(--warpkeep-menu-rail-right) + var(--warpkeep-menu-rail-half-width));'
    );
    expect(heading).toContain('transform: translate(50%, -0.65rem);');
    for (const rail of [navigation, identity, authRail]) {
      expect(rail).toContain('right: var(--warpkeep-menu-rail-right);');
      expect(rail).toContain('width: var(--warpkeep-menu-rail-width);');
    }
  });

  it('bounds and compacts Farcaster auth across portrait viewports', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const portrait = readCssBlock(css, '@media (orientation: portrait)');

    expect(portrait).toMatch(
      /\.warpkeep-menu-auth-rail\s*\{[^}]*top:\s*max\([^}]*bottom:\s*max\([^}]*overflow:\s*hidden;/s
    );
    expect(portrait).toMatch(
      /\.warpkeep-menu-auth-rail > \.farcaster-auth-panel\s*\{[^}]*max-height:\s*100%;/s
    );
    expect(portrait).toMatch(
      /\[data-menu-surface="farcaster-auth"\] \.warpkeep-menu-heading__crest\s*\{[^}]*display:\s*none;/s
    );
  });

  it('keeps menu controls restrained and menu notices on the shared surface system', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const notice = readCssBlock(css, '.warpkeep-menu-notice {');

    expect(css).not.toContain('.warpkeep-menu .warpkeep-menu-command::after');
    expect(notice).toContain('background: var(--warpkeep-surface-bg,');
    expect(notice).toContain('box-shadow: var(--warpkeep-surface-shadow,');
    expect(notice).toContain('backdrop-filter: blur(var(--warpkeep-surface-blur, 12px));');
    expect(notice).not.toContain('gradient(');
  });

  it('frees vertical space at 568x320 without hiding the project link', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const shortLandscape = readCssBlock(
      css,
      '@media (max-height: 360px) and (orientation: landscape)'
    );

    expect(shortLandscape).toMatch(
      /\.warpkeep-menu-heading__crest,\s*\.warpkeep-menu-heading__rule\s*\{[^}]*display:\s*none;/s
    );
    expect(shortLandscape).not.toMatch(
      /\.warpkeep-menu-tagline\s*\{[^}]*(?:display:\s*none|visibility:\s*hidden);/s
    );
    expect(shortLandscape).not.toMatch(
      /\.warpkeep-menu-project(?:__[-\w]+)?\s*\{[^}]*(?:display:\s*none|visibility:\s*hidden);/s
    );
    expect(shortLandscape).toMatch(
      /\.warpkeep-menu \.warpkeep-menu-back\s*\{[^}]*width:\s*2\.75rem;/s
    );
    expect(shortLandscape).toMatch(
      /\.warpkeep-menu-back__label\s*\{[^}]*display:\s*none;/s
    );

    const measuredHeadingBottom = 100.375;
    const measuredNavigationTop = 90.547;
    const hiddenRuleHeight = (0.3 + 0.64) * 16;
    const resultingGap = measuredNavigationTop + hiddenRuleHeight - measuredHeadingBottom;

    expect(resultingGap).toBeGreaterThanOrEqual(4);
  });
});
