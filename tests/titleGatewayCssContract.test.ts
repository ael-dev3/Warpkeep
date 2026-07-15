import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/title/WarpkeepTitleScreen.css'),
  'utf8'
);
const titleScreenSource = readFileSync(
  resolve(process.cwd(), 'src/components/title/WarpkeepTitleScreen3D.tsx'),
  'utf8'
);
const fallbackSource = readFileSync(
  resolve(process.cwd(), 'src/components/title/WarpkeepTitleScreenFallback.tsx'),
  'utf8'
);
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

function block(selector: string) {
  const selectorIndex = source.indexOf(selector);
  expect(selectorIndex, `Missing CSS selector ${selector}`).toBeGreaterThanOrEqual(0);
  const opening = source.indexOf('{', selectorIndex);
  const closing = source.indexOf('}', opening);
  expect(opening).toBeGreaterThan(selectorIndex);
  expect(closing).toBeGreaterThan(opening);
  return source.slice(opening + 1, closing);
}

describe('title gateway CSS contract', () => {
  it('keeps the elliptical hit target centered across hover, active, and focus states', () => {
    expect(source).toContain('.warpkeep-title-screen .warpkeep-gateway-button:hover:not(:disabled)');
    expect(source).toContain('.warpkeep-title-screen .warpkeep-gateway-button:active:not(:disabled)');
    expect(source).toContain('.warpkeep-title-screen .warpkeep-gateway-button:focus-visible');

    const gateway = block('.warpkeep-title-screen .warpkeep-gateway-button,');
    expect(gateway).toContain('var(--warpkeep-gateway-hit-width-min, 112px)');
    expect(gateway).toContain('var(--warpkeep-gateway-hit-width-max, 180px)');
    expect(gateway).toContain('var(--warpkeep-gateway-hit-height-min, 80px)');
    expect(gateway).toContain('var(--warpkeep-gateway-hit-height-max, 128px)');
    expect(gateway).toContain('border-radius: 50%;');
    expect(gateway).toContain('transform: translate(-50%, -50%);');
  });

  it('keeps title framing free of programmatic wordmarks and a flat compact hint', () => {
    const notice = block('.warpkeep-gateway-notice {');
    const hint = block('.warpkeep-title-entry-hint {');

    expect(source).not.toContain('warpkeep-title-loading-wordmark');
    expect(source).not.toContain('warpkeep-fallback-wordmark');
    expect(source).not.toContain('warpkeep-fallback-title-stage');
    expect(titleScreenSource).not.toContain('warpkeep-title-loading-wordmark');
    expect(titleScreenSource).not.toContain('titleSceneSpec.title.text');
    expect(fallbackSource).not.toContain('MonumentWordmark');
    expect(indexHtml).not.toContain('warpkeep-boot-title');
    expect(notice).toContain('background: var(--warpkeep-surface-bg');
    expect(notice).toContain('box-shadow: var(--warpkeep-surface-shadow');
    expect(notice).toContain('backdrop-filter: blur(var(--warpkeep-surface-blur, 12px));');
    expect(notice).not.toContain('gradient(');
    expect(hint).toContain('width: max-content;');
    expect(hint).toContain('background: rgba(');
    expect(hint).not.toContain('gradient(');
  });

});
