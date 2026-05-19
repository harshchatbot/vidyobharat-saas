import { test, expect } from '@playwright/test';

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:8000';
const PROJECT_ID = process.env.STORY_AD_QA_PROJECT_ID ?? '';

test('voice pre-production checks', async ({ page }) => {
  test.skip(!PROJECT_ID, 'STORY_AD_QA_PROJECT_ID is required');

  const consoleErrors: string[] = [];
  const estimateRequests: any[] = [];
  const settingsRequests: any[] = [];
  const selectVoiceRequests: any[] = [];
  const startRequests: any[] = [];
  const previewRequests: any[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.route(`${API_BASE}/api/storyboard/${PROJECT_ID}/production/estimate**`, async (route, req) => {
    estimateRequests.push(req.url());
    await route.continue();
  });
  await page.route(`${API_BASE}/api/storyboard/${PROJECT_ID}/production/settings`, async (route, req) => {
    settingsRequests.push(req.postDataJSON());
    await route.continue();
  });
  await page.route(`${API_BASE}/api/storyboard/${PROJECT_ID}/select-voice`, async (route, req) => {
    selectVoiceRequests.push(req.postDataJSON());
    await route.continue();
  });
  await page.route(`${API_BASE}/api/storyboard/${PROJECT_ID}/production/start`, async (route, req) => {
    startRequests.push(req.postDataJSON() ?? {});
    await route.continue();
  });
  await page.route(`${API_BASE}/api/storyboard/${PROJECT_ID}/voice-preview`, async (route, req) => {
    previewRequests.push(req.postDataJSON());
    await route.continue();
  });

  await page.goto(`/story-ad?project_id=${PROJECT_ID}`);
  await expect(page.getByRole('heading', { name: /Voice Selection/i })).toBeVisible({ timeout: 30000 });

  const languageSelect = page.locator('select').first();
  await expect(languageSelect).toBeVisible();
  const expectedLanguages = [
    'English (India)','Hindi (India)','Marathi (India)','Tamil (India)','Telugu (India)','Bangla (Bangladesh)','Gujarati (India)','Kannada (India)','Malayalam (India)','Punjabi (India)','Urdu (Pakistan)','English (US)'
  ];
  for (const lang of expectedLanguages) {
    await expect(languageSelect.locator(`option[value="${lang}"]`)).toHaveCount(1);
  }

  await languageSelect.selectOption('Hindi (India)');

  await page.getByRole('button', { name: /Preview/i }).first().click();
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: /Show all voices/i }).click();
  for (const voice of ['Achernar','Achird','Algenib','Algieba','Alnilam','Aoede','Autonoe','Callirrhoe','Charon','Despina','Enceladus','Erinome','Fenrir','Gacrux','Iapetus','Kore','Laomedeia','Leda','Orus','Pulcherrima','Puck','Rasalgethi','Sadachbia','Sadaltager','Schedar','Sulafat','Umbriel','Vindemiatrix','Zephyr','Zubenelgenubi']) {
    await expect(page.getByText(voice, { exact: true }).first()).toBeVisible();
  }

  for (const card of ['Budget • LTX 2.3','Balanced • Seedance v1','Best Quality • Kling Standard','Premium • Kling 4K']) {
    await expect(page.getByText(card)).toBeVisible();
  }

  const estimateText = page.getByText(/Estimated total credits:/i);
  await expect(estimateText).toBeVisible();
  const estimateBefore = await estimateText.textContent();

  await page.getByRole('button', { name: '10s' }).click();
  await page.waitForTimeout(1000);
  const estimateAfterDuration = await estimateText.textContent();

  await page.getByRole('button', { name: /Best Quality • Kling Standard/i }).click();
  await page.waitForTimeout(1000);
  const estimateAfterModel = await estimateText.textContent();

  await page.getByRole('button', { name: /✓ Confirm Voice Selection/i }).click();
  await page.waitForTimeout(2500);

  expect(previewRequests.length).toBeGreaterThan(0);
  expect(previewRequests[0]?.language_code).toBe('Hindi (India)');
  expect(previewRequests[0]?.voice).toBe('Kore');

  expect(settingsRequests.length).toBeGreaterThan(0);
  expect(settingsRequests.at(-1)?.selected_video_model_key).toBe('kling_standard');
  expect(settingsRequests.at(-1)?.selected_ad_duration_seconds).toBe(10);

  expect(selectVoiceRequests.length).toBeGreaterThan(0);
  expect(selectVoiceRequests.at(-1)?.language_code).toBe('Hindi (India)');
  expect(selectVoiceRequests.at(-1)?.voice).toBe('Kore');

  expect(startRequests.length).toBeGreaterThan(0);
  expect(estimateRequests.length).toBeGreaterThan(0);

  expect(estimateBefore).not.toEqual(estimateAfterDuration);
  expect(estimateAfterDuration).not.toEqual(estimateAfterModel);

  expect(consoleErrors).toEqual([]);
});
