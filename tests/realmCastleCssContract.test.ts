import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

describe('realm castle compositor CSS contract', () => {
  it('applies projected coordinates exactly once and protects them from global hover transforms', () => {
    const presentation = readFileSync(
      resolve(ROOT, 'src/components/realm/RealmCastlePresentation.css'),
      'utf8'
    );
    const global = readFileSync(resolve(ROOT, 'src/styles/global.css'), 'utf8');

    expect(presentation).toMatch(
      /\.realm-castle-label\s*\{[\s\S]*?top:\s*0;[\s\S]*?left:\s*0;/
    );
    expect(presentation).toContain('translate3d(\n    var(--realm-castle-label-x),');
    expect(presentation).not.toMatch(/top:\s*var\(--realm-castle-label-y\)/);
    expect(presentation).not.toMatch(/left:\s*var\(--realm-castle-label-x\)/);
    expect(global).toContain('.landing-shell button:hover:not(:disabled)');
    expect(global).not.toMatch(/^button:hover[^\n{]*\{/m);
  });

  it('contains long public names and removes a covered compact navigator from focus', () => {
    const map = readFileSync(
      resolve(ROOT, 'src/components/realm/RealmMapScreen.css'),
      'utf8'
    );
    const presentation = readFileSync(
      resolve(ROOT, 'src/components/realm/RealmCastlePresentation.css'),
      'utf8'
    );

    expect(map).toMatch(
      /\.realm-hud__header h1\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
    );
    expect(map).toMatch(
      /\.realm-map-screen:has\(\.castle-inspection\) \.realm-cell-navigator\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?visibility:\s*hidden;/
    );
    expect(presentation).toMatch(
      /\.castle-inspection__identity span,\s*\.castle-inspection__bio\s*\{\s*overflow-wrap:\s*anywhere;/
    );
  });

  it('keeps primary realm touch targets at least 44 CSS pixels at the default root size', () => {
    const map = readFileSync(
      resolve(ROOT, 'src/components/realm/RealmMapScreen.css'),
      'utf8'
    );
    const presentation = readFileSync(
      resolve(ROOT, 'src/components/realm/RealmCastlePresentation.css'),
      'utf8'
    );

    expect(map).toMatch(/\.realm-hud__actions button\s*\{[\s\S]*?min-height:\s*2\.75rem;/);
    expect(map).toMatch(/\.realm-cell-navigator > button\s*\{[\s\S]*?min-height:\s*2\.75rem;/);
    expect(map).toMatch(/\.realm-cell-navigator__heading button,[\s\S]*?min-height:\s*2\.75rem;/);
    expect(presentation).toMatch(
      /\.realm-castle-label\s*\{[\s\S]*?min-width:\s*2\.75rem;[\s\S]*?min-height:\s*2\.75rem;/
    );
    expect(presentation).toMatch(
      /\.castle-inspection__dismiss\s*\{[\s\S]*?min-height:\s*2\.75rem;/
    );
    expect(presentation).toMatch(
      /\.castle-inspection__profile-link\s*\{[\s\S]*?min-height:\s*2\.75rem;/
    );
  });

  it('keeps compact sheets and fallback copy clear of the mobile toolbar', () => {
    const map = readFileSync(
      resolve(ROOT, 'src/components/realm/RealmMapScreen.css'),
      'utf8'
    );

    expect(map).toMatch(
      /\.realm-map-screen__fallback-copy\s*\{\s*bottom:\s*max\(7\.1rem,\s*calc\(env\(safe-area-inset-bottom\) \+ 6\.55rem\)\);/
    );
    expect(map).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.realm-map-screen:has\(\.realm-cell-navigator__dialog\) \.realm-hud\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?visibility:\s*hidden;/
    );
    expect(map).toMatch(
      /\.realm-map-screen:has\(\.realm-cell-navigator__dialog\) \.realm-cell-navigator\s*\{\s*bottom:\s*max\(0\.55rem,\s*env\(safe-area-inset-bottom\)\);/
    );
  });

  it('bounds short-wide controls and stacks the narrow coordinate form', () => {
    const map = readFileSync(
      resolve(ROOT, 'src/components/realm/RealmMapScreen.css'),
      'utf8'
    );

    expect(map).toMatch(
      /@media \(max-height: 520px\) and \(min-width: 761px\)[\s\S]*?\.realm-hud__actions\s*\{[\s\S]*?right:\s*auto;[\s\S]*?30rem,/
    );
    expect(map).toMatch(
      /@media \(max-width: 430px\)[\s\S]*?\.realm-cell-navigator__jump fieldset\s*\{\s*grid-template-columns:\s*auto minmax\(0, 1fr\);/
    );
    expect(map).toMatch(
      /@media \(max-width: 430px\)[\s\S]*?\.realm-cell-navigator__jump input\s*\{\s*width:\s*100%;/
    );
    expect(map).toMatch(
      /\.realm-cell-navigator__dialog\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/
    );
    expect(map).toMatch(
      /\.realm-cell-navigator__jump fieldset\s*\{[^}]*min-width:\s*0;[^}]*box-sizing:\s*border-box;/
    );
  });

  it('keeps meaningful HUD and navigator data at a readable text size', () => {
    const map = readFileSync(
      resolve(ROOT, 'src/components/realm/RealmMapScreen.css'),
      'utf8'
    );

    expect(map).toMatch(
      /\.realm-hud__badges span,\s*\.realm-hud__shared-state\s*\{[^}]*font-size:\s*0\.8125rem;/
    );
    expect(map).toMatch(
      /\.realm-hud__actions button\s*\{[^}]*font-size:\s*0\.8125rem;/
    );
    expect(map).toMatch(
      /\.realm-cell-navigator__castles span,\s*\.realm-cell-navigator__castles small\s*\{[^}]*font-size:\s*0\.8125rem;/
    );
  });
});
