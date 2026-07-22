import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

type DeploymentEnvironment = Readonly<Record<string, string | undefined>>;

const SEMANTIC_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function readWarpkeepPackageVersion() {
  const packageJson = JSON.parse(
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
  ) as { version?: unknown };
  if (typeof packageJson.version !== 'string' || !SEMANTIC_VERSION_PATTERN.test(packageJson.version)) {
    throw new Error('Warpkeep package.json must contain a semantic product version.');
  }
  return packageJson.version;
}

function normalizeDeploymentBase(value: string) {
  if (
    value.length === 0
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || value.includes('?')
    || value.includes('#')
  ) {
    throw new Error('DEPLOY_BASE must be an absolute application path.');
  }

  const segments = value.split('/').slice(1);
  if (value.endsWith('/')) segments.pop();
  for (const segment of segments) {
    if (segment === '') {
      throw new Error('DEPLOY_BASE must not contain empty path segments.');
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error('DEPLOY_BASE must not contain invalid encoded segments.');
    }
    if (
      !decoded
      || decoded === '.'
      || decoded === '..'
      || decoded !== segment
      || !/^[A-Za-z0-9._~-]+$/.test(decoded)
    ) {
      throw new Error('DEPLOY_BASE must contain only canonical safe path segments.');
    }
  }

  return value.endsWith('/') ? value : `${value}/`;
}

/**
 * Custom-domain deployments explicitly pass `/`; legacy project Pages builds
 * retain `/Warpkeep/` until the canonical-domain cutover is complete.
 */
export function resolveDeploymentBase(environment: DeploymentEnvironment = process.env) {
  const requestedBase = environment.DEPLOY_BASE
    ?? (environment.GITHUB_PAGES === 'true' ? '/Warpkeep/' : '/');
  return normalizeDeploymentBase(requestedBase);
}

const deploymentBase = resolveDeploymentBase();
const productVersion = readWarpkeepPackageVersion();

function stripProductionCspFromLocalServe() {
  return {
    name: 'warpkeep-local-serve-csp-boundary',
    apply: 'serve' as const,
    transformIndexHtml(html: string) {
      return html.replace(
        /\s*<meta\s+data-warpkeep-production-csp\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/>/,
        ''
      );
    }
  };
}

export default defineConfig(({ command }) => ({
  base: deploymentBase,
  build: {
    // The public application is the sole HTML build entry. Local QA pages are
    // served by Vite in development and can never become an accidental
    // production entry through directory discovery or a future config change.
    rollupOptions: {
      input: resolve(process.cwd(), 'index.html')
    },
    // Three.js is isolated behind the title/realm boundaries and compresses to
    // roughly 150 KiB. Keep the warning just above that single vendor chunk so
    // any renewed application-bundle growth still fails visibly.
    chunkSizeWarningLimit: 600
  },
  define: {
    __WARPKEEP_LOCAL_QA__: JSON.stringify(command === 'serve'),
    __WARPKEEP_PRODUCT_VERSION__: JSON.stringify(productVersion)
  },
  // Vite's React development preamble is an inline module. The public build
  // keeps the strict document CSP, while localhost development removes only
  // that explicitly marked production meta element. Dedicated QA entries
  // retain their own loopback-only CSPs.
  plugins: [react(), stripProductionCspFromLocalServe()],
  test: {
    environment: 'jsdom',
    globals: true,
    // The Worker and SpacetimeDB module maintain their own isolated test
    // runners. Keeping the browser suite rooted here avoids running Node's
    // `node:test` module fixtures under jsdom/Vitest.
    include: ['tests/**/*.{test,spec}.{ts,tsx}']
  }
}));
