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

    const measuredHeadingBottom = 100.375;
    const measuredNavigationTop = 90.547;
    const hiddenRuleHeight = (0.3 + 0.64) * 16;
    const resultingGap = measuredNavigationTop + hiddenRuleHeight - measuredHeadingBottom;

    expect(resultingGap).toBeGreaterThanOrEqual(4);
  });
});
