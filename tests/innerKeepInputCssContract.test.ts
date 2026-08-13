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
  it('gives pointer ownership to the canvas and retains focus-revealed building controls', () => {
    const css = readFileSync(
      resolve(root, 'src/components/inner-keep/InnerKeepScreen.css'),
      'utf8'
    );
    const buildingControl = ruleBody(
      css,
      '.inner-keep[data-inner-keep-renderer="webgl"] .inner-keep-map-building'
    );
    expect(buildingControl).toContain('left: -200vw !important;');
    expect(buildingControl).toContain(
      'width: min(18rem, calc(100vw - 1rem)) !important;'
    );
    expect(buildingControl).toContain('height: 44px !important;');
    expect(buildingControl).toContain('pointer-events: none;');
    expect(buildingControl).not.toContain('visibility: hidden;');

    const focusedBuilding = ruleBody(
      css,
      '.inner-keep[data-inner-keep-renderer="webgl"] .inner-keep-map-building:focus'
    );
    expect(focusedBuilding).toContain(
      'left: max(0.5rem, var(--realm-safe-left, 0px)) !important;'
    );

    const fallbackBuilding = ruleBody(css, '.inner-keep-map-building');
    expect(fallbackBuilding).toContain('position: absolute;');
    expect(fallbackBuilding).not.toMatch(/\b(?:width|height):/);
    const fallbackPlacementGhost = ruleBody(
      css,
      '.inner-keep-map-placement-ghost'
    );
    expect(fallbackPlacementGhost).not.toMatch(/\b(?:width|height):/);
    expect(css).not.toContain('.inner-keep-map-building[data-footprint=');
    expect(css).not.toContain('.inner-keep-map-placement-ghost[data-footprint=');
    expect(css).not.toContain('.inner-keep-map__slots');
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
