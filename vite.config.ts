import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  base: isGitHubPages ? '/Warpkeep/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true
  }
});
