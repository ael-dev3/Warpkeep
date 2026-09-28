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
  it('sets the opening commands into clear glass over the 3D world', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const component = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.tsx'),
      'utf8'
    );
    const verdant = css.slice(css.indexOf('/* Clear glass leaves'));
    const liveScene = css.slice(css.indexOf('/* The 0.4 menu is a HUD'));
    const menu = readCssBlock(verdant, '.warpkeep-menu {');
    const waystone = readCssBlock(verdant, '.warpkeep-menu-waystone {');
    const heading = readCssBlock(verdant, '.warpkeep-menu-heading {');
    const navigation = readCssBlock(verdant, '.warpkeep-menu-nav {');
    const identity = readCssBlock(css, '.warpkeep-menu-identity {');

    expect(menu).toContain('--warpkeep-menu-rail-width:');
    expect(menu).toContain('--warpkeep-menu-rail-right:');
    expect(menu).toContain('--warpkeep-menu-panel-offset:');
    expect(waystone).toContain('position: absolute;');
    expect(waystone).toContain('pointer-events: none;');
    expect(readCssBlock(liveScene, '.warpkeep-menu {')).toContain('background: transparent;');
    expect(readCssBlock(liveScene, '.warpkeep-menu-scene {')).toContain('z-index: -5;');
    expect(readCssBlock(liveScene, '.warpkeep-menu-waystone {')).toContain('backdrop-filter: blur(5px) saturate(0.62) brightness(0.73);');
    expect(heading).toContain('top: calc(var(--warpkeep-menu-panel-offset) + 2.3rem);');
    expect(navigation).toContain('bottom: calc(var(--warpkeep-menu-panel-offset) + 2.15rem);');
    expect(navigation).toContain('right: var(--warpkeep-menu-rail-right);');
    expect(navigation).toContain('width: var(--warpkeep-menu-rail-width);');
    expect(identity).toContain('position: static;');
    expect(identity).toContain('width: 100%;');

    const headingStart = component.indexOf('<header aria-hidden={!commandSurfaceVisible}');
    const identityStart = component.indexOf('<div className="warpkeep-menu-identity">');
    const headingEnd = component.indexOf('</header>', headingStart);
    expect(headingStart).toBeGreaterThanOrEqual(0);
    expect(identityStart).toBeGreaterThan(headingStart);
    expect(identityStart).toBeLessThan(headingEnd);
    expect(component).toContain('className="warpkeep-menu-waystone"');
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

  it('gives Farcaster auth one full-screen glass scroll owner without nested panel scroll', () => {
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
    expect(css).toContain('background: rgba(9, 17, 22, 0.68);');
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
    expect(css).toContain('.warpkeep-menu[data-menu-surface="farcaster-auth"] .warpkeep-menu-heading,');
    expect(css).toContain('.warpkeep-menu[data-menu-surface="realm-choice"] .warpkeep-menu-heading {');
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

  it('keeps the portrait command plaque clear of the patch disclosure', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const verdant = css.slice(css.indexOf('/* Clear glass leaves'));
    const portrait = readCssBlock(verdant, '@media (orientation: portrait)');
    expect(portrait).toMatch(/\.warpkeep-menu-waystone\s*\{[^}]*bottom:\s*max\(4\.2rem,/s);
    expect(portrait).toMatch(/\.warpkeep-menu-nav\s*\{[^}]*bottom:\s*max\(5\.05rem,/s);
    expect(portrait).toMatch(/\.warpkeep-menu \.warpkeep-menu-command\s*\{[^}]*min-height:\s*2\.75rem;/s);
  });

  it('keeps the full wordmark and build provenance inside narrow portrait screens', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const compactPhone = css.slice(css.indexOf(
      '/* Preserve the full wordmark and build provenance within narrow phone safe areas. */'
    ));
    const portrait = readCssBlock(
      compactPhone,
      '@media (max-width: 430px) and (orientation: portrait)'
    );
    const title = readCssBlock(portrait, '.warpkeep-menu .warpkeep-menu-title {');
    const buildStamp = readCssBlock(portrait, '.warpkeep-menu-build-stamp {');

    expect(title).toContain('font-size: clamp(1.9rem, 10.5vw, 2.55rem);');
    expect(title).toContain('letter-spacing: 0.035em;');
    expect(buildStamp).toContain('left: max(');
    expect(buildStamp).toContain('right: max(');
    expect(buildStamp).toContain('justify-content: center;');
  });

  it('stacks all realm choices and keeps tooltips bounded on narrow phones', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/RealmChoiceSelector.css'),
      'utf8'
    );
    const narrowPhone = readCssBlock(css, '@media (max-width: 720px)');
    const tooltip = readCssBlock(css, '.realm-choice-selector__tooltip {');

    expect(narrowPhone).toMatch(
      /\.realm-choice-selector__choices\s*\{[^}]*grid-template-columns:\s*1fr;/s
    );
    expect(narrowPhone).toMatch(
      /\.realm-choice-selector__button\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s
    );
    expect(narrowPhone).toMatch(
      /\.realm-choice-selector__tooltip\s*\{[^}]*max-width:\s*calc\(100vw - 3rem\);/s
    );
    expect(tooltip).toContain('max-width: min(20rem, calc(100vw - 2rem));');
  });

  it('presents all three realms as equal desktop cards', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/RealmChoiceSelector.css'),
      'utf8'
    );
    const button = readCssBlock(
      css,
      '.warpkeep-menu .realm-choice-selector__button {'
    );
    const admission = readCssBlock(css, '.realm-choice-selector__admission {');
    const choices = readCssBlock(css, '.realm-choice-selector__choices {');

    expect(choices).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(button).toContain('min-height: 9.25rem;');
    expect(admission).toContain('display: flex;');
    expect(admission).toContain('align-items: center;');
  });

  it('frees vertical space at 568x320 without hiding the project links', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const verdant = css.slice(css.indexOf('/* Clear glass leaves'));
    const shortLandscape = readCssBlock(verdant, '@media (max-height: 360px) and (orientation: landscape)');

    expect(shortLandscape).toMatch(
      /\.warpkeep-menu-heading__crest,\s*\.warpkeep-menu-heading__rule\s*\{[^}]*display:\s*none;/s
    );
    expect(shortLandscape).not.toMatch(
      /\.warpkeep-menu-tagline\s*\{[^}]*(?:display:\s*none|visibility:\s*hidden);/s
    );
    expect(shortLandscape).not.toMatch(
      /\.warpkeep-menu-project(?:__[-\w]+)?\s*\{[^}]*(?:display:\s*none|visibility:\s*hidden);/s
    );
    expect(shortLandscape).toMatch(/\.warpkeep-menu-command-list\s*\{[^}]*gap:\s*0;/s);
    expect(shortLandscape).toMatch(/\.warpkeep-menu-project\s*\{[^}]*margin-top:\s*0\.12rem;/s);
  });

  it('prevents the heading tagline from colliding with the rail at 844x390', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    const wideShortLandscape = readCssBlock(
      css,
      '@media (min-width: 600px) and (max-height: 420px) and (orientation: landscape)'
    );

    expect(wideShortLandscape).toMatch(
      /\.warpkeep-menu-tagline\s*\{[^}]*display:\s*none;/s
    );
    expect(wideShortLandscape).not.toMatch(
      /\.warpkeep-menu-(?:command|project)(?:[-\w]+)?\s*\{[^}]*(?:display:\s*none|visibility:\s*hidden);/s
    );
  });
});
