import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

test.setTimeout(12 * 60 * 1000);

test('real storyboard avatar-led 5s flow (headless)', async ({ page }) => {
  const userId = `playwright-real-5s-${Date.now()}`;
  let projectId = '';

  await page.addInitScript((uid: string) => {
    window.localStorage.setItem('test-user-id', uid);
  }, userId);

  await page.goto('/story-ad?step=category');

  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();
  await page.getByRole('button', { name: /Create with Avatar/i }).click();
  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();
  await page.getByRole('button', { name: /Continue to Brief/i }).click();

  await page.getByPlaceholder(/Describe your product, target audience/i).fill(
    'Create a 5 second Hindi UGC testimonial ad for handcrafted wooden wall clock with chitrakala avatar.'
  );
  await page.getByRole('button', { name: /Review & Generate/i }).click();
  await page.getByRole('checkbox', { name: /I\'m ready to generate my ad/i }).check();

  const initResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/storyboard/initialize') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Generate My Ad/i }).click();
  const initResponse = await initResponsePromise;
  expect(initResponse.ok()).toBeTruthy();
  const initJson = await initResponse.json();
  projectId = String(initJson?.project_id || '').trim();
  expect(projectId).toBeTruthy();

  await expect(page.getByRole('heading', { name: /Script Checkpoint/i })).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: /Approve Script/i }).click();
  await page.evaluate(
    async ({ pid, apiBase, uid }) => {
      await fetch(`${apiBase}/api/storyboard/${pid}/generate-storyboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-ID': uid },
        body: JSON.stringify({ confirmation: true }),
      });
    },
    { pid: projectId, apiBase: API_BASE, uid: userId }
  );

  await expect(page.getByRole('heading', { name: /Storyboard Checkpoint/i })).toBeVisible({ timeout: 120000 });

  let storyboardPayload: any = null;
  for (let i = 0; i < 30; i += 1) {
    storyboardPayload = await page.evaluate(
      async ({ pid, apiBase, uid }) => {
        const res = await fetch(`${apiBase}/api/storyboard/${pid}/storyboard`, {
          headers: { 'Content-Type': 'application/json', 'X-User-ID': uid },
        });
        return res.ok ? await res.json() : null;
      },
      { pid: projectId, apiBase: API_BASE, uid: userId }
    );
    const count = Number(storyboardPayload?.scene_count || 0);
    if (count > 0) break;
    await page.waitForTimeout(2000);
  }

  expect(storyboardPayload).toBeTruthy();
  const sceneCount = Number(storyboardPayload?.scene_count || 0);
  expect(sceneCount).toBeGreaterThan(0);
  expect(sceneCount).toBeLessThanOrEqual(3);

  await page.getByRole('button', { name: /Approve Storyboard/i }).click();
  await expect(page.getByRole('heading', { name: /Image Checkpoint/i })).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: /Approve All Images/i }).click();

  await expect(page.getByRole('heading', { name: /Voice Selection/i })).toBeVisible({ timeout: 120000 });
  await page.getByText(/^Aoede$/i).first().click();
  await page.getByRole('button', { name: /Confirm Voice Selection/i }).click();

  await expect(page.getByRole('heading', { name: /Production in Progress/i })).toBeVisible({ timeout: 120000 });
  const confirmProceedBtn = page.getByRole('button', { name: /Confirm & Proceed/i });
  if (await confirmProceedBtn.isVisible()) {
    await confirmProceedBtn.click();
  }

  const projectPayload = await page.evaluate(
    async ({ pid, apiBase, uid }) => {
      const res = await fetch(`${apiBase}/api/storyboard/${pid}`, {
        headers: { 'Content-Type': 'application/json', 'X-User-ID': uid },
      });
      return res.ok ? await res.json() : null;
    },
    { pid: projectId, apiBase: API_BASE, uid: userId }
  );
  expect(projectPayload).toBeTruthy();
});
