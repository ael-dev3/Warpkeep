import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function ruleBody(css: string, selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing CSS selector: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`Incomplete CSS rule: ${selector}`);
  return css.slice(open + 1, close);
}

describe('Inner Keep WebGL input CSS', () => {
  it('gives pointer ownership to the canvas and retains a focus-revealed site index', () => {
    const css = readFileSync(
      resolve(root, 'src/components/inner-keep/InnerKeepScreen.css'),
      'utf8'
    );
    const siteIndex = ruleBody(
      css,
      '.inner-keep[data-inner-keep-renderer="webgl"] .inner-keep-map__slots'
    );
    expect(siteIndex).toContain('left: -200vw;');
    expect(siteIndex).toContain('pointer-events: none;');
    expect(siteIndex).not.toContain('visibility: hidden;');

    const focusedIndex = ruleBody(
      css,
      '.inner-keep[data-inner-keep-renderer="webgl"] .inner-keep-map__slots:focus-within'
    );
    expect(focusedIndex).toContain('left: max(0.5rem, var(--realm-safe-left, 0px));');

    const semanticButton = ruleBody(
      css,
      '.inner-keep[data-inner-keep-renderer="webgl"] .inner-keep-map__slots button'
    );
    expect(semanticButton).toContain('position: relative;');
    expect(semanticButton).toContain('pointer-events: none;');
    expect(semanticButton).toContain('touch-action: none;');
    expect(semanticButton).not.toContain('--inner-keep-slot-');
    expect(css).not.toContain('data-inner-keep-slot-projected');
  });

  it('keeps the one active Realm canvas in the Inner Keep pointer lane', () => {
    const css = readFileSync(
      resolve(root, 'src/components/realm/RealmMapScreen.css'),
      'utf8'
    );
    const activeCanvas = ruleBody(
      css,
      '.realm-map-screen[data-realm-scene-mode="INNER_KEEP"]'
    );
    expect(activeCanvas).toContain('pointer-events: auto;');
  });

  it('keeps global chrome clear of the project drawer in desktop and short landscape', () => {
    const css = readFileSync(
      resolve(root, 'src/components/inner-keep/InnerKeepScreen.css'),
      'utf8'
    );
    expect(css).toContain(
      '.inner-keep:has(.inner-keep-panel) .inner-keep__header,'
    );
    expect(css).toContain(
      '.inner-keep:has(.inner-keep-panel) .inner-keep__resources {'
    );
    expect(css).toContain(
      'margin-right: var(--inner-keep-side-panel-reserve);'
    );
    expect(css).toContain(
      '+ max(0.55rem, var(--realm-safe-right, 0px))'
    );
    expect(css).toContain(
      '.inner-keep:has(.inner-keep-panel) .inner-keep-builder {'
    );
    const shortLandscape = css.slice(css.indexOf(
      '@media (max-height: 600px) and (min-width: 581px)'
    ));
    expect(shortLandscape).toContain(
      'grid-template-rows: auto auto minmax(0, 1fr) auto;'
    );
    const resourceRule = ruleBody(shortLandscape, '.inner-keep__resources');
    expect(resourceRule).toContain('position: relative;');
    expect(resourceRule).not.toContain('position: absolute;');
    expect(shortLandscape).toContain(
      '.inner-keep:has(.inner-keep-panel) .inner-keep__stage,'
    );
    expect(shortLandscape).toContain(
      '.inner-keep:has(.inner-keep-panel) .inner-keep-builder,'
    );
    expect(shortLandscape).toContain(
      'calc(100% - var(--inner-keep-side-panel-reserve) - 1rem)'
    );
  });
});
