import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WarpkeepErrorBoundary } from '../src/components/errors/WarpkeepErrorBoundary';
import { WARPKEEP_ROOT_ERROR_HANDLERS } from '../src/components/errors/warpkeepRootErrorHandlers';

const PRIVATE_FAILURE_DETAIL = 'private-token-should-never-render';

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
  const noscriptCss = readFileSync(
    resolve(process.cwd(), 'public/warpkeep-noscript.css'),
    'utf8'
  );

  it('ships visible boot content in the root before React starts', () => {
    const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
    const root = parsed.querySelector('#root');
    const status = root?.querySelector('[role="status"]');

    expect(root?.querySelector('.warpkeep-boot')).not.toBeNull();
    expect(root?.querySelector('#warpkeep-boot-title')?.textContent).toBe('WARPKEEP');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toContain('Opening the realm…');
    expect(indexHtml).toContain('href="/warpkeep-boot.css"');
    expect(indexHtml).toContain('<meta name="referrer" content="no-referrer" />');
    expect(indexHtml).toContain('href="/favicon.svg"');
    expect(mainSource).toContain('WARPKEEP_ROOT_ERROR_HANDLERS');
  });

  it('provides actionable no-JavaScript guidance and motion-safe styling', () => {
    expect(indexHtml).toMatch(/<noscript>[\s\S]*WARPKEEP REQUIRES JAVASCRIPT[\s\S]*Enable JavaScript/);
    expect(indexHtml).toContain('href="/warpkeep-noscript.css"');
    expect(noscriptCss).toMatch(/#root\s*{[\s\S]*display:\s*none\s*!important/);
    expect(bootCss).toContain('.warpkeep-boot--noscript');
    expect(bootCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(bootCss).toContain('@media (forced-colors: active)');
  });
});
