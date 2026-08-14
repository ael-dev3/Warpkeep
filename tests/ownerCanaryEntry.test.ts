import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {
  dirname,
  resolve,
} from 'node:path';

import { render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  MiniAppHostProvider,
  useMiniAppHost,
} from '../src/farcaster/miniapp/MiniAppHostProvider';
import type { MiniAppSdk } from '../src/farcaster/miniapp/miniAppRuntime';
import { DEFAULT_MINI_APP_BROWSER_RUNTIME } from '../src/farcaster/miniapp/miniAppRuntime';
import { hasExactMiniAppHint } from '../src/farcaster/miniapp/miniAppRuntime';

function importSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(
      /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    ),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1]!);
}

function resolveSourceImport(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(importer), specifier);
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function sourceGraph(entry: string): Set<string> {
  const sourceRoot = resolve(process.cwd(), 'src');
  const pending = [resolve(sourceRoot, entry)];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      const dependency = resolveSourceImport(path, specifier);
      if (dependency?.startsWith(`${sourceRoot}/`)) pending.push(dependency);
    }
  }
  return visited;
}

describe('isolated owner canary production entry', () => {
  it('has one exact undiscoverable production document and a dedicated module entry', () => {
    const html = readFileSync(resolve(process.cwd(), 'owner-canary/index.html'), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    expect(parsed.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')).toHaveLength(1);
    expect(parsed.querySelector('meta[data-warpkeep-owner-canary-production-csp]')).not.toBeNull();
    expect(parsed.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe('https://warpkeep.com/owner-canary/');
    expect(parsed.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
    expect(parsed.querySelector('meta[name="robots"]')?.getAttribute('content'))
      .toBe('noindex, nofollow, noarchive');
    expect(parsed.querySelector('script[type="module"]')?.getAttribute('src'))
      .toBe('/src/owner-canary/main.tsx');
    expect(parsed.querySelector('#root')?.getAttribute('data-owner-canary-root'))
      .toBe('v1');
    expect(parsed.querySelector('#owner-canary-root')).toBeNull();
    expect(html).not.toMatch(/(?:fc:miniapp|fc:frame|property="og:|rel="manifest")/i);
    expect(readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')).not.toContain('owner-canary');
    expect(readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8')).not.toContain('owner-canary');
  });

  it('mounts the isolated entry into the exact shell required by the Mini App host runtime', () => {
    const html = readFileSync(resolve(process.cwd(), 'owner-canary/index.html'), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const previous = document.body.innerHTML;
    try {
      document.body.innerHTML = parsed.body.innerHTML;
      const shell = DEFAULT_MINI_APP_BROWSER_RUNTIME.getMountedShell();
      expect(shell).toBe(document.getElementById('root'));
      expect(shell?.isConnected).toBe(true);
      expect(shell?.childNodes.length).toBeGreaterThan(0);
      expect(readFileSync(resolve(process.cwd(), 'src/owner-canary/main.tsx'), 'utf8'))
        .toContain("document.getElementById('root')");
    } finally {
      document.body.innerHTML = previous;
    }
  });

  it('documents only the exact Mini App-hinted production launch URL', () => {
    const runbook = readFileSync(
      resolve(process.cwd(), 'docs/operations/owner-player-canary.md'),
      'utf8',
    );
    const approved = new URL('https://warpkeep.com/owner-canary/?miniApp=true');
    expect(approved.origin).toBe('https://warpkeep.com');
    expect(approved.pathname).toBe('/owner-canary/');
    expect(hasExactMiniAppHint(approved.search)).toBe(true);
    expect(runbook).toContain('`https://warpkeep.com/owner-canary/?miniApp=true`');
    expect(runbook).toContain('exactly one literal `miniApp=true`');
    expect(runbook).not.toContain(
      'exact URL `https://warpkeep.com/owner-canary/`',
    );
  });

  it('reaches a verified mounted Mini App host at the exact production path and hint', async () => {
    const html = readFileSync(resolve(process.cwd(), 'owner-canary/index.html'), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const previousBody = document.body.innerHTML;
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const ready = vi.fn(async () => undefined);
    const sdk: MiniAppSdk = {
      isInMiniApp: vi.fn(async () => true),
      context: Promise.resolve({
        user: { fid: 12345 },
        client: {
          clientFid: 9150,
          added: true,
          platformType: 'desktop',
          safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        },
        features: { haptics: false },
        location: { type: 'launcher' },
      }),
      getCapabilities: async () => ['actions.ready'],
      actions: { ready },
    };
    let hostState = 'missing';
    function Probe() {
      hostState = useMiniAppHost().state;
      return createElement('span', { 'data-owner-canary-host-probe': hostState });
    }
    try {
      window.history.replaceState({}, '', '/owner-canary/?miniApp=true');
      document.body.innerHTML = parsed.body.innerHTML;
      const root = document.getElementById('root');
      expect(root).not.toBeNull();
      const mounted = render(
        createElement(
          MiniAppHostProvider,
          {
            children: createElement(Probe),
            sdkLoader: async () => sdk,
          },
        ),
        { container: root! },
      );
      await waitFor(() => expect(hostState).toBe('miniapp'));
      expect(ready).toHaveBeenCalledExactlyOnceWith({ disableNativeGestures: true });
      expect(DEFAULT_MINI_APP_BROWSER_RUNTIME.search()).toBe('?miniApp=true');
      expect(DEFAULT_MINI_APP_BROWSER_RUNTIME.getMountedShell()).toBe(root);
      mounted.unmount();
    } finally {
      window.history.replaceState({}, '', previousUrl || '/');
      document.body.innerHTML = previousBody;
    }
  });

  it('keeps the complete owner entry graph outside normal App, providers, and Greater Realm presentation', () => {
    const graph = [...sourceGraph('owner-canary/main.tsx')];
    const relativeGraph = graph.map((path) => path.slice(resolve(process.cwd(), 'src').length + 1));
    expect(relativeGraph).toEqual(expect.arrayContaining([
      'owner-canary/main.tsx',
      'owner-canary/OwnerCanaryApp.tsx',
      'farcaster/miniapp/MiniAppHostProvider.tsx',
    ]));
    expect(relativeGraph).not.toEqual(expect.arrayContaining([
      'App.tsx',
      'spacetime/WarpkeepSpacetimeProvider.tsx',
      'spacetime/greaterRealmProviderBridge.ts',
    ]));
    expect(relativeGraph.some((path) => path.startsWith('greater-realm/'))).toBe(false);
    const combinedSource = graph.map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(combinedSource).not.toMatch(
      /(?:GREATER_REALM_CLIENT_PRESENTATION_ALLOWED|WarpkeepSpacetimeProvider|greaterRealmProviderBridge|GreaterRealmWorldScene)/,
    );
    expect(combinedSource).not.toMatch(/(?:localStorage|sessionStorage|document\.cookie|indexedDB)/);
    const ownerApp = readFileSync(
      resolve(process.cwd(), 'src/owner-canary/OwnerCanaryApp.tsx'),
      'utf8',
    );
    expect(ownerApp).not.toMatch(/host\.context|context\.user|\.user\.fid/);
    const publicBrowserBoundary = [
      ownerApp,
      readFileSync(
        resolve(process.cwd(), 'src/owner-canary/ownerCanaryController.ts'),
        'utf8',
      ),
      readFileSync(
        resolve(process.cwd(), 'src/owner-canary/ownerCanaryEvidence.ts'),
        'utf8',
      ),
    ].join('\n');
    expect(publicBrowserBoundary).not.toMatch(
      /(?:serverBaselineCommitment|commandSetCommitment|pc1-[dr][0-9]{2}-|idempotencyKey)/,
    );
  });
});
