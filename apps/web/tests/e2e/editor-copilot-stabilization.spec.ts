import { expect, test, type Page, type Route } from '@playwright/test';

async function fulfillSession(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ guest_id: 'guest-copilot-test', expires_at: '2099-01-01T00:00:00Z', usage: { limits: { uploads: 20 }, remaining: { uploads: 20 } } }),
  });
}

async function mockEditor(page: Page, mediaHandler?: (route: Route) => Promise<void>) {
  await page.route('**/api/editor/guest/session', fulfillSession);
  await page.route('**/api/editor/audio-library**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route('**/api/editor/media', mediaHandler ?? ((route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })));
}

test('rapid Copilot submission invokes the editor component once', async ({ page }) => {
  await mockEditor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await page.getByRole('button', { name: 'AI Copilot' }).click();
  const composer = page.getByLabel('Ask AI Copilot to edit the project');
  await composer.fill('hi');
  await page.getByRole('button', { name: 'Propose' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  const conversation = page.getByLabel('Copilot conversation');
  await expect(conversation.getByText('You', { exact: true })).toHaveCount(1);
  await expect(conversation.getByText('You', { exact: true }).locator('..')).toContainText('hi');
  await expect(page.getByText(/I'm your AI video editing assistant/)).toHaveCount(1);
  await expect(composer).toHaveValue('');
});

test('media loading remains a transitional state until initialization completes', async ({ page }) => {
  let releaseMedia!: () => void;
  const mediaReady = new Promise<void>((resolve) => { releaseMedia = resolve; });
  await mockEditor(page, async (route) => {
    await mediaReady;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await expect(page.getByText('Loading uploaded media…')).toBeVisible();
  await expect(page.getByText('Editor could not start')).toHaveCount(0);
  releaseMedia();
  await expect(page.getByTestId('editor-preview-canvas')).toBeVisible();
});
