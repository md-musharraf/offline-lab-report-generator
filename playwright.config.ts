import { defineConfig } from '@playwright/test';

// Electron end-to-end tests. Run `npm run build` first (or `npm run pack` + E2E_PACKAGED=1).
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: 'test-results',
});
