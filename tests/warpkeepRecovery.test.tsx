import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WarpkeepErrorBoundary } from '../src/components/errors/WarpkeepErrorBoundary';
import { WARPKEEP_ROOT_ERROR_HANDLERS } from '../src/components/errors/warpkeepRootErrorHandlers';

const PRIVATE_FAILURE_DETAIL = 'private-token-should-never-render';

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

function ThrowingChild(): never {
  throw new Error(PRIVATE_FAILURE_DETAIL);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WarpkeepErrorBoundary', () => {
  it('passes healthy children through unchanged', () => {
    render(
      <WarpkeepErrorBoundary>
        <p>Realm ready</p>
      </WarpkeepErrorBoundary>
    );

    expect(screen.getByText('Realm ready')).not.toBeNull();
    expect(screen.queryByText('THE REALM FALTERED')).toBeNull();
  });

  it('contains render failures without exposing details and focuses recovery guidance', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { container } = render(
      <WarpkeepErrorBoundary onRequestReload={vi.fn()}>
        <ThrowingChild />
      </WarpkeepErrorBoundary>
    );

    const heading = screen.getByRole('heading', { name: 'THE REALM FALTERED' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole('alert').textContent).toMatch(/could not continue safely/i);
    expect(container.textContent).not.toContain(PRIVATE_FAILURE_DETAIL);
    expect(container.textContent).not.toMatch(/Error:|at ThrowingChild/);
  });

  it('replaces React root error logging with a detail-free event', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host, WARPKEEP_ROOT_ERROR_HANDLERS);

    act(() => {
      root.render(
        <WarpkeepErrorBoundary onRequestReload={vi.fn()}>
          <ThrowingChild />
        </WarpkeepErrorBoundary>
      );
    });

    const serializedCalls = JSON.stringify(consoleError.mock.calls);
    expect(serializedCalls).toContain('warpkeep_ui_failure');
    expect(serializedCalls).not.toContain(PRIVATE_FAILURE_DETAIL);
    expect(serializedCalls).not.toContain('ThrowingChild');

    act(() => root.unmount());
    host.remove();
  });

  it('offers one accessible reload request and guards repeated activation', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onRequestReload = vi.fn();

    render(
      <WarpkeepErrorBoundary onRequestReload={onRequestReload}>
        <ThrowingChild />
      </WarpkeepErrorBoundary>
    );

    const reload = screen.getByRole('button', { name: 'RELOAD WARPKEEP' });
    fireEvent.click(reload);
    fireEvent.click(reload);

    expect(onRequestReload).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'RELOADING…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Reloading the realm.');
  });
});

describe('Warpkeep document fallback', () => {
  const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const mainSource = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
  const bootCss = readFileSync(resolve(process.cwd(), 'public/warpkeep-boot.css'), 'utf8');
  const experienceCss = readFileSync(
    resolve(process.cwd(), 'src/components/WarpkeepExperience.css'),
    'utf8'
  );
  const noscriptCss = readFileSync(
    resolve(process.cwd(), 'public/warpkeep-noscript.css'),
    'utf8'
  );
  const spacetimeBrowserRuntime = readFileSync(
    resolve(process.cwd(), 'node_modules/spacetimedb/dist/index.browser.mjs'),
    'utf8'
  );

  it('ships visible boot content in the root before React starts', () => {
    const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
    const root = parsed.querySelector('#root');
    const status = root?.querySelector('[role="status"]');
    const contentSecurityPolicy = parsed.querySelector(
      'meta[http-equiv="Content-Security-Policy"]'
    )?.getAttribute('content');
    const scriptSource = contentSecurityPolicy
      ?.split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src '));
    const connectSource = contentSecurityPolicy
      ?.split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('connect-src '));

    expect(root?.querySelector('.warpkeep-boot')).not.toBeNull();
    expect(root?.querySelector('#warpkeep-boot-title')).toBeNull();
    expect(root?.querySelector('.warpkeep-boot')?.getAttribute('aria-label')).toBe('Warpkeep is opening');
    expect(root?.textContent).not.toContain('WARPKEEP');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toContain('Opening the realm…');
    expect(indexHtml).toContain('href="/warpkeep-boot.css"');
    expect(indexHtml).toContain('<meta name="referrer" content="no-referrer" />');
    expect(indexHtml).toContain('href="/favicon.svg"');
    expect(mainSource).toContain('WARPKEEP_ROOT_ERROR_HANDLERS');
    expect(contentSecurityPolicy).toContain("default-src 'none'");
    expect(scriptSource).toBe("script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'");
    expect(connectSource).toMatch(/^connect-src 'self' blob: /);
    expect(contentSecurityPolicy).toContain("script-src-attr 'none'");
    expect(contentSecurityPolicy).not.toMatch(/(?:^|[;\s])https:(?:[;\s]|$)/);
    expect(contentSecurityPolicy).not.toMatch(/(?:^|[;\s])wss?:(?:[;\s]|$)/);
    expect(contentSecurityPolicy).not.toMatch(/localhost|127\.0\.0\.1|\[::1\]/);
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain("frame-src 'none'");
    expect(contentSecurityPolicy).toContain("form-action 'none'");
    expect(contentSecurityPolicy).toContain('https://auth.warpkeep.com');
    expect(contentSecurityPolicy).toContain('https://relay.farcaster.xyz');
    expect(contentSecurityPolicy).toContain('https://mainnet.optimism.io');
    expect(contentSecurityPolicy).toContain('https://maincloud.spacetimedb.com');
    expect(contentSecurityPolicy).toContain('wss://maincloud.spacetimedb.com');
    expect(parsed.querySelector('[data-warpkeep-production-csp]')).not.toBeNull();
  });

  it('keeps the CSP compatibility exception aligned with the pinned browser SDK', () => {
    expect(spacetimeBrowserRuntime).toMatch(/serializer\s*=\s*Function\(/);
    expect(spacetimeBrowserRuntime).toMatch(/deserializer\s*=\s*Function\(/);
    expect(indexHtml).toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it('provides actionable no-JavaScript guidance and motion-safe styling', () => {
    expect(indexHtml).toMatch(/<noscript>[\s\S]*WARPKEEP REQUIRES JAVASCRIPT[\s\S]*Enable JavaScript/);
    expect(indexHtml).toContain('href="/warpkeep-noscript.css"');
    expect(noscriptCss).toMatch(/#root\s*{[\s\S]*display:\s*none\s*!important/);
    expect(bootCss).toContain('.warpkeep-boot--noscript');
    expect(bootCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(bootCss).toContain('@media (forced-colors: active)');
  });

  it('keeps pre-React and lazy scene loading continuous with the title palette', () => {
    const boot = readCssBlock(bootCss, '.warpkeep-boot {');
    const bootSigil = readCssBlock(bootCss, '.warpkeep-boot__sigil {');
    const experience = readCssBlock(experienceCss, '.warpkeep-experience {');
    const sceneLoader = readCssBlock(
      experienceCss,
      '.warpkeep-experience__scene-loader {'
    );
    const sceneLoaderGlyph = readCssBlock(
      experienceCss,
      '.warpkeep-experience__scene-loader span {'
    );

    expect(indexHtml).toContain('<meta name="theme-color" content="#010207" />');
    expect(boot).toContain('background: #010207');
    expect(boot).not.toMatch(/gradient\(/);
    expect(experience).toContain('background: #010207');
    expect(sceneLoader).toContain('background: #010207');
    expect(sceneLoader).not.toMatch(/gradient\(/);
    expect(bootSigil).toContain('color: #f1eee4');
    expect(sceneLoaderGlyph).toContain('border: 1px solid rgba(224, 222, 230, 0.6)');
    expect(sceneLoaderGlyph).not.toMatch(/rgba\((?:92, 45, 124|128, 73, 174)/);
  });

  it('keeps boot and lazy loading static and unglowing for reduced motion', () => {
    const bootReducedMotion = readCssBlock(
      bootCss,
      '@media (prefers-reduced-motion: reduce)'
    );
    const experienceReducedMotion = readCssBlock(
      experienceCss,
      '@media (prefers-reduced-motion: reduce)'
    );

    expect(bootReducedMotion).toMatch(
      /\.warpkeep-boot__sigil::after\s*\{[\s\S]*animation:\s*none;/
    );
    expect(experienceReducedMotion).toMatch(
      /\.warpkeep-experience__screen\s*\{[\s\S]*transition:\s*none\s*!important;/
    );
    expect(experienceReducedMotion).toMatch(
      /\.warpkeep-experience__scene-loader span\s*\{[\s\S]*animation:\s*none;[\s\S]*box-shadow:\s*none;/
    );
  });
});
