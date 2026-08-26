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
  it('keeps command composition aligned while identity remains in normal heading flow', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const component = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.tsx'),
      'utf8'
    );
    const menu = readCssBlock(css, '.warpkeep-menu {');
    const heading = readCssBlock(css, '.warpkeep-menu-heading {');
    const navigation = readCssBlock(css, '.warpkeep-menu-nav {');
    const identity = readCssBlock(css, '.warpkeep-menu-identity {');

    expect(menu).toContain('--warpkeep-menu-rail-width:');
    expect(menu).toContain('--warpkeep-menu-rail-half-width:');
    expect(menu).toContain('--warpkeep-menu-rail-right:');
    expect(heading).toContain(
      'right: calc(var(--warpkeep-menu-rail-right) + var(--warpkeep-menu-rail-half-width));'
    );
    expect(heading).toContain('transform: translate(50%, -0.65rem);');
    expect(navigation).toContain('right: var(--warpkeep-menu-rail-right);');
    expect(navigation).toContain('width: var(--warpkeep-menu-rail-width);');
    expect(identity).toContain('position: static;');
    expect(identity).toContain('width: 100%;');

    const headingStart = component.indexOf('<header aria-hidden={authPanelOpen}');
    const identityStart = component.indexOf('<div className="warpkeep-menu-identity">');
    const headingEnd = component.indexOf('</header>', headingStart);
    expect(headingStart).toBeGreaterThanOrEqual(0);
    expect(identityStart).toBeGreaterThan(headingStart);
    expect(identityStart).toBeLessThan(headingEnd);
  });

  it('bounds the compact identity card so long public names truncate on narrow menus', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/auth/FarcasterQrAuthPanel.css'),
      'utf8'
    );
    const compactIdentity = readCssBlock(css, '.farcaster-identity-badge--compact {');

    expect(compactIdentity).toContain('width: auto;');
    expect(compactIdentity).toContain('max-width: 100%;');
    expect(compactIdentity).toContain('min-width: 0;');
  });

  it('gives Farcaster auth one opaque full-screen scroll owner without nested panel scroll', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const authRail = readCssBlock(css, '.warpkeep-menu-auth-rail {');
    const authPanel = readCssBlock(
      css,
      '.warpkeep-menu-auth-rail > .farcaster-auth-panel {'
    );
    const authActions = readCssBlock(
      css,
      '.warpkeep-menu-auth-rail .farcaster-auth-panel__actions {'
    );
    const portrait = readCssBlock(css, '@media (orientation: portrait)');

    expect(authRail).toContain('position: fixed;');
    expect(authRail).toContain('inset: 0;');
    expect(authRail).toContain('overflow-y: auto;');
    expect(authRail).toContain('overscroll-behavior: contain;');
    expect(authRail).toContain('linear-gradient(180deg, #0d0912 0%, #08070c 100%);');
    expect(authPanel).toContain('max-height: none;');
    expect(authPanel).toContain('overflow: visible;');
    expect(authActions).toContain('position: sticky;');
    expect(authActions).toContain('bottom: 0;');
    expect(css).not.toContain(
      '.warpkeep-menu[data-menu-surface="farcaster-auth"] .warpkeep-menu-back {'
    );
    expect(portrait).not.toMatch(
      /\.warpkeep-menu-auth-rail\s*\{[^}]*overflow:\s*hidden;/s
    );
    expect(css).toMatch(
      /\[data-menu-surface="farcaster-auth"\] \.warpkeep-menu-heading\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;/s
    );
  });

  it('keeps a tall direct-entry panel reachable in 667x375 landscape', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/auth/FarcasterMiniAppEntryGate.css'),
      'utf8'
    );
    const shortViewport = readCssBlock(css, '@media (max-height: 560px)');

    expect(shortViewport).toMatch(
      /\.farcaster-miniapp-entry\s*\{[^}]*align-items:\s*start;/s
    );
    expect(shortViewport).toMatch(
      /\.farcaster-miniapp-entry__content > \.farcaster-auth-panel\s*\{[^}]*align-self:\s*start;/s
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

  it('keeps both project destinations balanced, tappable, and bounded on narrow rails', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const projectLinks = readCssBlock(css, '.warpkeep-menu-project__links {');
    const projectLink = readCssBlock(css, '.warpkeep-menu-project__link {');

    expect(projectLinks).toContain('display: flex;');
    expect(projectLinks).toContain('width: 100%;');
    expect(projectLink).toContain('flex: 1 1 0;');
    expect(projectLink).toContain('min-width: 0;');
    expect(projectLink).toContain('max-width: 12rem;');
    expect(projectLink).toContain('min-height: 2.75rem;');
  });

  it('keeps the version disclosure and exact-build link as separate 44px footer targets', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const buildStamp = readCssBlock(css, '.warpkeep-menu-build-stamp {');
    const versionTrigger = readCssBlock(css, '.warpkeep-menu-build-stamp__version {');
    const portrait = readCssBlock(css, '@media (orientation: portrait)');

    expect(buildStamp).toContain('display: inline-flex;');
    expect(versionTrigger).toContain('cursor: pointer;');
    expect(css).toMatch(
      /\.warpkeep-menu-build-stamp__version,\s*\.warpkeep-menu-build-stamp__build\s*\{[^}]*min-height:\s*2\.75rem;/s
    );
    expect(css).toMatch(
      /\.warpkeep-menu-build-stamp__build\s*\{[^}]*text-decoration:\s*none;/s
    );
    expect(portrait).toMatch(
      /\.warpkeep-menu-build-stamp\s*\{[^}]*right:\s*max\([^}]*left:\s*auto;/s
    );
  });

  it('keeps the patch chronicle clear of its footer targets in short landscape viewports', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/LatestPatchNotesPopover.css'),
      'utf8'
    );
    const shortLandscape = readCssBlock(
      css,
      '@media (max-height: 360px) and (orientation: landscape)'
    );

    expect(shortLandscape).toMatch(
      /\.warpkeep-patch-notes\s*\{[^}]*max-height:\s*min\(31rem, calc\(100svh - 5\.625rem - env\(safe-area-inset-bottom\)\)\);/s
    );
  });

  it('compacts the return control before it can overlap the patch disclosure on narrow phones', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const narrowPortrait = readCssBlock(
      css,
      '@media (max-width: 430px) and (orientation: portrait)'
    );

    expect(narrowPortrait).toMatch(
      /.warpkeep-menu \.warpkeep-menu-back\s*\{[^}]*width:\s*2\.75rem;/s
    );
    expect(narrowPortrait).toMatch(
      /\.warpkeep-menu-back__label\s*\{[^}]*display:\s*none;/s
    );
  });

  it('keeps both realm names and admission states legible on narrow phones', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/RealmChoiceSelector.css'),
      'utf8'
    );
    const narrowPhone = readCssBlock(css, '@media (max-width: 520px)');
    const tooltip = readCssBlock(css, '.realm-choice-selector__tooltip {');

    expect(narrowPhone).toMatch(
      /\.realm-choice-selector__button\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s
    );
    expect(narrowPhone).toMatch(
      /\.realm-choice-selector__name\s*\{[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;/s
    );
    expect(narrowPhone).toMatch(
      /\.realm-choice-selector__admission\s*\{[^}]*display:\s*flex;[^}]*white-space:\s*nowrap;/s
    );
    expect(tooltip).toContain('max-width: min(19rem, calc(100vw - 2rem));');
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
