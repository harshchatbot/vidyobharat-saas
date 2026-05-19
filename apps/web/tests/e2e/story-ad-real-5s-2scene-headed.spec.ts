import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

test.setTimeout(15 * 60 * 1000);

test('REAL headed storyboard avatar-led smoke (5s, 2 scenes)', async ({ page }) => {
  console.log('[test] start');
  const userId = `playwright-real-headed-${Date.now()}`;
  let projectId = '';

  const failedCalls: string[] = [];
  const workflowStates: string[] = [];

  page.on('console', (msg) => {
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.log(`[pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    const failure = `${req.method()} ${req.url()} => ${req.failure()?.errorText || 'failed'}`;
    failedCalls.push(failure);
    console.log(`[requestfailed] ${failure}`);
  });

  await page.addInitScript((uid: string) => {
    window.localStorage.setItem('test-user-id', uid);
  }, userId);

  await page.goto('/story-ad?step=category');
  console.log('[test] goto complete');

  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();
  console.log('[test] clicked UGC Testimonial');
  await page.getByRole('button', { name: /Create with Avatar/i }).click();
  console.log('[test] clicked Create with Avatar');
  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();
  console.log('[test] re-clicked UGC Testimonial');
  await page.getByRole('button', { name: /Continue to Brief/i }).click();
  console.log('[test] clicked Continue to Brief');

  await page.getByPlaceholder(/Describe your product, target audience/i).fill(
    'Create a 5 second UGC testimonial ad on Instagram Reels for stylish smart watches for professionals with Chitrakala avatar.'
  );

  await page.getByRole('button', { name: /Review & Generate/i }).click();
  console.log('[test] clicked Review & Generate');
  await page.getByRole('checkbox', { name: /I\'m ready to generate my ad/i }).check();
  console.log('[test] checked readiness');

  const initResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/storyboard/initialize') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Generate My Ad/i }).click();
  console.log('[test] clicked Generate My Ad');
  const initResponse = await initResponsePromise;
  expect(initResponse.ok()).toBeTruthy();
  const initJson = await initResponse.json();
  projectId = String(initJson?.project_id || '').trim();
  expect(projectId).toBeTruthy();
  console.log(`[test] project_id=${projectId}`);

  await expect(page.getByRole('heading', { name: /Script Checkpoint/i })).toBeVisible({ timeout: 180000 });
  await page.getByRole('button', { name: /Approve Script/i }).click();

  const storyboardResp = await page.evaluate(
    async ({ pid, apiBase, uid }) => {
      const res = await fetch(`${apiBase}/api/storyboard/${pid}/generate-storyboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-ID': uid },
        body: JSON.stringify({ confirmation: true }),
      });
      return { ok: res.ok, status: res.status, text: await res.text() };
    },
    { pid: projectId, apiBase: API_BASE, uid: userId }
  );
  console.log('[test] generate-storyboard response', storyboardResp);
  expect(storyboardResp.ok).toBeTruthy();

  await expect(page.getByRole('heading', { name: /Storyboard Checkpoint/i })).toBeVisible({ timeout: 180000 });

  let storyboardPayload: any = null;
  for (let i = 0; i < 60; i += 1) {
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
  const totalDuration = (storyboardPayload?.scenes || []).reduce(
    (sum: number, s: any) => sum + Number(s?.duration_seconds || 0),
    0
  );

  console.log(`[test] scene_count=${sceneCount} total_duration=${totalDuration}`);
  expect(sceneCount).toBe(2);
  expect(totalDuration).toBe(5);

  const sceneTextBlob = JSON.stringify(storyboardPayload?.scenes || []).toLowerCase();
  expect(sceneTextBlob.includes('chitrakala') || sceneTextBlob.includes('avatar')).toBeTruthy();

  await page.getByRole('button', { name: /Approve Storyboard/i }).click();
  await expect(page.getByRole('heading', { name: /Image Checkpoint/i })).toBeVisible({ timeout: 180000 });

  const generateImagesResp = await page.evaluate(
    async ({ pid, apiBase, uid }) => {
      const res = await fetch(`${apiBase}/api/storyboard/${pid}/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-ID': uid },
        body: JSON.stringify({ confirmation: true }),
      });
      return { ok: res.ok, status: res.status, text: await res.text() };
    },
    { pid: projectId, apiBase: API_BASE, uid: userId }
  );
  console.log('[test] generate-images response', generateImagesResp);
  expect(generateImagesResp.ok).toBeTruthy();

  // Verify workflow advances and no infinite initial loading stall.
  let latestProject: any = null;
  for (let i = 0; i < 30; i += 1) {
    latestProject = await page.evaluate(
      async ({ pid, apiBase, uid }) => {
        const res = await fetch(`${apiBase}/api/storyboard/${pid}`, {
          headers: { 'Content-Type': 'application/json', 'X-User-ID': uid },
        });
        return res.ok ? await res.json() : null;
      },
      { pid: projectId, apiBase: API_BASE, uid: userId }
    );
    const state = String(latestProject?.project?.workflow_state || '').toLowerCase();
    if (state) {
      workflowStates.push(state);
      console.log(`[test] workflow_state=${state}`);
    }
    if (state === 'images_generating' || state === 'images_awaiting_approval') {
      break;
    }
    await page.waitForTimeout(2000);
  }

  expect(workflowStates.some((s) => s === 'images_generating' || s === 'images_awaiting_approval')).toBeTruthy();

  // Soft assertion: no explicit mock banners in UI body text.
  const pageText = (await page.locator('body').innerText()).toLowerCase();
  expect(pageText.includes('mock mode')).toBeFalsy();

  if (failedCalls.length) {
    console.log('[test] failed network calls', failedCalls);
  }

  console.log('[test] completed headed real smoke run', {
    projectId,
    sceneCount,
    totalDuration,
    workflowStates,
    failedCalls,
  });
});
