import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

test.setTimeout(20 * 60 * 1000);

test('real storyboard avatar-led 10s generation via UI', async ({ page }) => {
  const userId = `playwright-real-${Date.now()}`;
  let projectId = '';
  await page.addInitScript((uid: string) => {
    window.localStorage.setItem('test-user-id', uid);
  }, userId);

  await page.goto('/story-ad?step=category');

  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();
  await expect(page.getByText(/How to Create Your UGC Testimonial Ad/i)).toBeVisible();
  await page.getByRole('button', { name: /Create with Avatar/i }).click();

  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();
  await page.getByRole('button', { name: /Continue to Brief/i }).click();

  await page.getByPlaceholder(/Describe your product, target audience/i).fill(
    'Create a 10-second Hindi UGC testimonial for a handcrafted wooden wall clock. Use Chitrakala consistently in all avatar scenes.'
  );
  await page.getByRole('button', { name: /Review & Generate/i }).click();

  await page.getByRole('checkbox', { name: /I\'m ready to generate my ad/i }).check();
  const initResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes('/api/storyboard/initialize') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Generate My Ad/i }).click();
  const initResponse = await initResponsePromise;
  if (initResponse.ok()) {
    const initJson = await initResponse.json();
    projectId = String(initJson?.project_id || '').trim();
  }

  await expect(page.getByRole('heading', { name: /Script Checkpoint/i })).toBeVisible();
  await page.getByRole('button', { name: /Approve Script/i }).click();

  await expect(page.getByRole('heading', { name: /Storyboard Checkpoint/i })).toBeVisible();
  await page.getByRole('button', { name: /Approve Storyboard/i }).click();

  await expect(page.getByRole('heading', { name: /Image Checkpoint/i })).toBeVisible();
  await page.getByRole('button', { name: /Approve All Images/i }).click();

  await expect(page.getByRole('heading', { name: /Voice Selection/i })).toBeVisible();
  await page.getByText(/^Emma$/i).first().click();
  await page.getByRole('button', { name: /Confirm Voice Selection/i }).click();

  await expect(page.getByRole('heading', { name: /Production in Progress/i })).toBeVisible();
  const confirmProceedBtn = page.getByRole('button', { name: /Confirm & Proceed/i });
  if (await confirmProceedBtn.isVisible()) {
    await confirmProceedBtn.click();
  }

  // Best-effort: poll project endpoint until final video appears or timeout.
  expect(projectId).toBeTruthy();

  let finalVideoUrl = '';
  const start = Date.now();
  while (Date.now() - start < 12 * 60 * 1000) {
    const confirmProceedBtnDuringPoll = page.getByRole('button', { name: /Confirm & Proceed/i });
    if (await confirmProceedBtnDuringPoll.isVisible()) {
      await confirmProceedBtnDuringPoll.click();
      await page.waitForTimeout(1000);
    }

    const payload = await page.evaluate(
      async ({ pid, apiBase, uid }) => {
        const res = await fetch(`${apiBase}/api/storyboard/${pid}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': uid,
          },
        });
        if (!res.ok) return { ok: false, status: res.status };
        return { ok: true, data: await res.json() };
      },
      { pid: projectId, apiBase: API_BASE, uid: userId }
    );
    if (payload && (payload as any).ok) {
      const project = (payload as any).data?.project || {};
      finalVideoUrl = String(project.final_video_url || '').trim();
      if (finalVideoUrl) {
        break;
      }
    }
    await page.waitForTimeout(8000);
  }

  expect(finalVideoUrl, 'final_video_url should be present for completed generation').toBeTruthy();
});
