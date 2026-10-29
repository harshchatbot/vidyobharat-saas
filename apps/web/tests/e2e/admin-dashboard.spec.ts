import { expect, test, type Page } from '@playwright/test';

const config = {
  revision: 0,
  cache_ttl_seconds: 45,
  config: {
    guest: {
      max_uploads: 20, max_exports: 3, max_uploaded_bytes: 262144000,
      max_storage_bytes: 524288000, max_processing_seconds: 600,
      max_concurrent_processing: 1, network_max_uploads: 100,
      network_max_exports: 15, network_max_uploaded_bytes: 1310720000,
      network_max_processing_seconds: 3000,
    },
    media: { max_file_bytes: 104857600 },
    editor: { max_clips: 12, max_duration_seconds: 60 },
    export: { list_limit: 50 },
    features: { guest_editor_enabled: true },
  },
};

async function mockAdmin(page: Page) {
  let currentConfig = structuredClone(config);
  await page.route('**/api/admin/backend/dashboard', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      total_guest_sessions: 12, active_guest_sessions: 3, accepted_uploads: 27,
      completed_exports: 5, failed_exports: 1, uploaded_bytes: 1000,
      active_storage_bytes: 800, recent_activity: [],
      coverage_note: 'Metrics cover retained guest-session and export records.',
    }),
  }));
  await page.route('**/api/admin/backend/config', async (route) => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON();
      currentConfig = { ...currentConfig, revision: 1, config: { ...currentConfig.config, guest: { ...currentConfig.config.guest, ...payload.changes.guest } } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentConfig) });
    } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentConfig) });
  });
  await page.route('**/api/admin/backend/config/audit?limit=10', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null }) }));
}

test('admin dashboard is responsive and labels retained sessions accurately', async ({ page }) => {
  await mockAdmin(page);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Guest editor overview' })).toBeVisible();
    await expect(page.getByRole('paragraph').filter({ hasText: /^Guest sessions$/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test('settings require review before committing a validated patch', async ({ page }) => {
  await mockAdmin(page);
  await page.goto('/admin/settings');
  await page.getByRole('spinbutton', { name: 'Maximum uploads', exact: true }).fill('25');
  await page.getByRole('button', { name: /Review 1 change/ }).click();
  await expect(page.getByRole('dialog')).toContainText('max_uploads');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('Revision 1')).toBeVisible();
});

test('admin login exchanges Firebase token without browser storage', async ({ page }) => {
  await page.route('**/identitytoolkit.googleapis.com/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ idToken: 'firebase-token', refreshToken: 'not-persisted', localId: 'admin', email: 'admin@example.com' }),
  }));
  await page.route('**/api/admin/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect.poll(() => page.url()).toContain('/admin');
  expect(await page.evaluate(() => localStorage.getItem('vidyo_access_token'))).toBeNull();
});
