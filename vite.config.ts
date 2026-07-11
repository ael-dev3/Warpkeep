import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  base: isGitHubPages ? '/Warpkeep/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // The Worker and SpacetimeDB module maintain their own isolated test
    // runners. Keeping the browser suite rooted here avoids running Node's
    // `node:test` module fixtures under jsdom/Vitest.
    include: ['tests/**/*.{test,spec}.{ts,tsx}']
  }
});
