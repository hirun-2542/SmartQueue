import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const port = process.env.SMARTQUEUE_E2E_PORT ?? '5310';
const baseURL = process.env.SMARTQUEUE_E2E_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: 'test-results/e2e',
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],
  use: {
    baseURL,
    headless: true,
    actionTimeout: 10000,
    navigationTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: { mode: 'only-on-failure', fullPage: true },
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
  ],
  webServer: process.env.SMARTQUEUE_E2E_URL ? undefined : {
    command: 'npm run build && dotnet run --project tests/SmartQueue.E2eHost/SmartQueue.E2eHost.csproj --no-launch-profile',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    env: {
      ASPNETCORE_TEST_CONTENTROOT_SMARTQUEUE_API: resolve('server'),
      PublicOrigin: baseURL,
      SMARTQUEUE_E2E_PORT: port,
    },
  },
});
