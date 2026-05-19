import { expect, test } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8000';

test.setTimeout(3 * 60 * 1000);

test('real script checkpoint exits loading screen', async ({ page }) => {
  const userId = `qa-script-real-${Date.now()}`;

  const initRes = await fetch(`${API_BASE}/api/storyboard/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-ID': userId },
    body: JSON.stringify({
      ad_category: 'ugc_testimonial',
      business_brief: 'Create a 5 second Instagram Reels UGC ad for stylish smart watches for professionals using Chitrakala avatar.',
      platform: 'instagram_reels',
      language: 'Hindi',
      tone: 'casual',
      avatar_id: 'av-chitrakala',
    }),
  });
  expect(initRes.ok).toBeTruthy();
  const initJson: any = await initRes.json();
  const projectId = String(initJson.project_id || '').trim();
  expect(projectId).toBeTruthy();

  await page.addInitScript((uid: string) => {
    localStorage.setItem('test-user-id', uid);
  }, userId);

  await page.goto(`/story-ad?project_id=${projectId}`);

  // Script checkpoint should render and move past loading once script is available.
  await expect(page.getByRole('heading', { name: /Script Checkpoint/i })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText(/Generating Script/i)).not.toBeVisible({ timeout: 120000 });

  const scriptBox = page.locator('div[aria-live="polite"]');
  await expect(scriptBox).toBeVisible({ timeout: 120000 });
  const txt = (await scriptBox.innerText()).trim();
  expect(txt.length).toBeGreaterThan(20);
});
