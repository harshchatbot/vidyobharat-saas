import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const isStatefulRun = process.env.PLAYWRIGHT_STATEFUL === '1';
const shouldManageServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: !isStatefulRun,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: isStatefulRun ? 1 : process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html'], ['list']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: shouldManageServer
    ? {
        command: isStatefulRun
          ? `npm run build && npx next start -p ${PORT} -H 127.0.0.1`
          : `npx next dev -p ${PORT} -H 127.0.0.1`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: isStatefulRun ? 180 * 1000 : 120 * 1000,
      }
    : undefined,
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
      },
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
