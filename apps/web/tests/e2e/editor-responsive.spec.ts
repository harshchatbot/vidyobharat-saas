import { expect, test, type Page } from '@playwright/test';

const IMAGE_ID = 'a'.repeat(32);
const VIDEO_ID = 'b'.repeat(32);
const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function mockGuestEditor(page: Page, contentRequests?: Map<string, number>) {
  await page.route('**/api/editor/guest/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        guest_id: 'guest-test',
        expires_at: '2099-01-01T00:00:00Z',
        usage: { limits: { uploads: 20 }, remaining: { uploads: 20 } },
      }),
    });
  });
  await page.route('**/api/editor/media', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [
        { media_id: IMAGE_ID, original_filename: 'a-very-long-photo-filename-for-truncation.png', media_type: 'image', content_type: 'image/png' },
        { media_id: VIDEO_ID, original_filename: 'sample-video.mp4', media_type: 'video', content_type: 'video/mp4', duration_seconds: 6 },
      ] }),
    });
  });
  await page.route('**/api/editor/media/*/content', async (route) => {
    const mediaId = new URL(route.request().url()).pathname.split('/').at(-2) ?? '';
    contentRequests?.set(mediaId, (contentRequests.get(mediaId) ?? 0) + 1);
    await route.fulfill({ status: 200, contentType: mediaId === IMAGE_ID ? 'image/png' : 'video/mp4', body: pixelPng });
  });
}

test('guest workspace remains usable without page overflow across target widths', async ({ page }) => {
  await mockGuestEditor(page);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 812 : 900 });
    await page.goto('/editor');
    await expect(page.getByTestId('editor-preview-canvas')).toBeVisible();

    const geometry = await page.getByTestId('editor-preview-canvas').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        ratio: bounds.width / bounds.height,
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(Math.abs(geometry.ratio - 9 / 16)).toBeLessThan(0.02);
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    if (width >= 1024) {
      const vertical = await page.evaluate(() => ({ page: document.documentElement.scrollHeight, viewport: document.documentElement.clientHeight }));
      expect(vertical.page).toBeLessThanOrEqual(vertical.viewport);
    }

    if (width < 768) {
      await expect(page.getByRole('navigation', { name: 'Mobile editor tools' })).toBeVisible();
      await page.getByRole('button', { name: 'Open inspector' }).click();
      await expect(page.getByTestId('mobile-editor-sheet').getByText('Select a clip, text, effect, or audio item to edit it.')).toBeVisible();
      await page.getByRole('button', { name: 'Close panel' }).click();
    } else if (width < 1024) {
      await expect(page.getByRole('navigation', { name: 'Editor tools' })).toBeVisible();
      await page.getByRole('button', { name: 'Open inspector' }).click();
      await expect(page.getByTestId('mobile-editor-sheet')).toBeVisible();
      await page.getByRole('button', { name: 'Close panel' }).click();
    } else {
      await expect(page.getByRole('navigation', { name: 'Editor tools' })).toBeVisible();
      await expect(page.getByText('Select a clip, text, effect, or audio item to edit it.')).toBeVisible();
    }
  }
});

test('media thumbnails, visual inspector variants, and timeline delete remain functional', async ({ page }) => {
  const contentRequests = new Map<string, number>();
  await mockGuestEditor(page, contentRequests);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  await expect(page.getByRole('img', { name: 'a-very-long-photo-filename-for-truncation.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a-very-long-photo-filename-for-truncation.png to timeline' }).click();
  const inspector = page.getByRole('complementary').last();
  await expect(inspector.getByText('Image', { exact: true })).toBeVisible();
  await expect(inspector.getByLabel('Fit')).toBeVisible();
  await expect(inspector.getByLabel('Duration')).toBeVisible();
  await expect(inspector.getByLabel('Mute')).toHaveCount(0);
  await expect(page.getByText('Visuals', { exact: true })).toBeVisible();
  expect(contentRequests.get(IMAGE_ID)).toBe(1);

  await page.getByRole('button', { name: 'Add sample-video.mp4 to timeline' }).click();
  await expect(inspector.getByText('Video', { exact: true })).toBeVisible();
  await expect(inspector.getByLabel('Mute')).toBeVisible();
  await expect(inspector.getByLabel('Trim start')).toBeVisible();
  await page.getByLabel('Timeline editing controls').getByRole('button', { name: 'Delete' }).click();
  await expect(inspector.getByText('Select a clip, text, effect, or audio item to edit it.')).toBeVisible();
});

test('media deletion is confirmed and blocked while the media is on the timeline', async ({ page }) => {
  await mockGuestEditor(page);
  let deletedMediaId = '';
  await page.route(`**/api/editor/media/${IMAGE_ID}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      deletedMediaId = IMAGE_ID;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');

  const deleteMedia = page.getByRole('button', { name: 'Delete a-very-long-photo-filename-for-truncation.png' });
  await page.getByRole('button', { name: 'Add a-very-long-photo-filename-for-truncation.png to timeline' }).click();
  await expect(deleteMedia).toBeDisabled();
  await page.getByRole('button', { name: 'Remove selected timeline item' }).click();
  await expect(deleteMedia).toBeEnabled();
  page.once('dialog', (dialog) => dialog.accept());
  await deleteMedia.click();

  await expect(page.getByText('a-very-long-photo-filename-for-truncation.png')).toHaveCount(0);
  expect(deletedMediaId).toBe(IMAGE_ID);
});

test('filter selection opens uncommitted and Cancel closes the preview panel', async ({ page }) => {
  await mockGuestEditor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await page.getByRole('navigation', { name: 'Editor tools' }).getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByRole('region', { name: 'Filter gallery' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Apply/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('region', { name: 'Filter gallery' })).toBeHidden();
});

test('text template preview is temporary until Apply and Cancel restores committed styling', async ({ page }) => {
  await mockGuestEditor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  const tools = page.getByRole('navigation', { name: 'Editor tools' });

  await tools.getByRole('button', { name: 'Text' }).click();
  await expect(page.getByRole('region', { name: 'Text library' })).toBeVisible();
  await expect(page.getByTestId('text-overlay')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Text Templates' }).click();
  await page.getByRole('button', { name: /Neon/ }).click();
  await expect(page.getByTestId('text-overlay')).toBeVisible();
  await expect(page.getByText('Your text', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('text-overlay')).toHaveCount(0);

  await tools.getByRole('button', { name: 'Text' }).click();
  await page.getByRole('tab', { name: 'Text Templates' }).click();
  await page.getByRole('button', { name: /Neon/ }).click();
  await page.getByRole('button', { name: 'Add text' }).click();
  const savedOverlay = page.getByTestId('text-overlay');
  await expect(savedOverlay).toBeVisible();
  await expect(savedOverlay.locator('div').first()).toHaveCSS('color', 'rgb(103, 232, 249)');

  await tools.getByRole('button', { name: 'Text' }).click();
  await page.getByRole('tab', { name: 'Text Templates' }).click();
  await page.getByRole('button', { name: /Minimal/ }).click();
  await expect(savedOverlay.locator('div').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(savedOverlay.locator('div').first()).toHaveCSS('color', 'rgb(103, 232, 249)');
});

test('export dialog keeps preview ratio and serialized output settings aligned', async ({ page }) => {
  await mockGuestEditor(page);
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/editor/exports', async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
      job_id: 'c'.repeat(32), status: 'queued', progress_stage: 'queued',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z', status_url: `/api/editor/exports/${'c'.repeat(32)}`,
    }) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Add a-very-long-photo-filename-for-truncation.png to timeline' }).click();
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '16:9' }).click();
  await dialog.getByRole('button', { name: '1080p' }).click();
  await dialog.getByRole('button', { name: '60 FPS' }).click();
  await dialog.getByLabel('Filename').fill('Client Launch');
  const ratio = await page.getByTestId('editor-preview-canvas').evaluate((element) => {
    const bounds = element.getBoundingClientRect(); return bounds.width / bounds.height;
  });
  expect(Math.abs(ratio - 16 / 9)).toBeLessThan(0.02);
  await dialog.getByRole('button', { name: 'Export MP4' }).click();
  await expect.poll(() => submitted).toBeTruthy();
  expect(submitted).toMatchObject({ aspect_ratio: '16:9', width: 1920, height: 1080, fps: 60, output_filename: 'Client Launch.mp4' });
});

test('Copilot signed-out state does not send a model request', async ({ page }) => {
  await mockGuestEditor(page);
  let planRequests = 0;
  await page.route('**/api/editor/copilot/plan', async (route) => {
    planRequests += 1;
    await route.fulfill({ status: 500, body: '{}' });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  await page.getByLabel('Ask AI Copilot to edit the project').fill('Make this cinematic');
  await page.getByRole('button', { name: 'Propose' }).click();
  await expect(page.getByRole('link', { name: 'Sign in to continue' })).toBeVisible();
  expect(planRequests).toBe(0);
});

test('Copilot proposal previews without export and Cancel or Apply remain atomic', async ({ page }) => {
  await mockGuestEditor(page);
  await page.addInitScript(() => window.localStorage.setItem('vidyo_access_token', 'test-firebase-id-token'));
  let exportRequests = 0;
  await page.route('**/api/editor/exports', async (route) => {
    exportRequests += 1;
    await route.fulfill({ status: 500, body: '{}' });
  });
  await page.route('**/api/editor/copilot/plan', async (route) => {
    const request = route.request().postDataJSON() as { projectRevision: string };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: {
          schemaVersion: '1.0', requestId: 'copilot-test', projectRevision: request.projectRevision,
          summary: 'Change the canvas to widescreen.', warnings: [],
          operations: [{ op: 'set_aspect_ratio', aspectRatio: '16:9' }],
        },
        usage: { inputTokens: 20, outputTokens: 10, estimatedCostUsd: 0.0001 },
      }),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Add a-very-long-photo-filename-for-truncation.png to timeline' }).click();
  await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  const prompt = page.getByLabel('Ask AI Copilot to edit the project');
  await prompt.fill('Make it widescreen');
  await page.getByRole('button', { name: 'Propose' }).click();
  await expect(page.getByRole('region', { name: 'Proposed edits' })).toBeVisible();
  await expect(page.getByText(/Temporary Copilot preview/)).toBeVisible();
  expect(exportRequests).toBe(0);
  let ratio = await page.getByTestId('editor-preview-canvas').evaluate((element) => {
    const bounds = element.getBoundingClientRect(); return bounds.width / bounds.height;
  });
  expect(Math.abs(ratio - 16 / 9)).toBeLessThan(0.02);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  ratio = await page.getByTestId('editor-preview-canvas').evaluate((element) => {
    const bounds = element.getBoundingClientRect(); return bounds.width / bounds.height;
  });
  expect(Math.abs(ratio - 9 / 16)).toBeLessThan(0.02);

  await prompt.fill('Make it widescreen');
  await page.getByRole('button', { name: 'Propose' }).click();
  await expect(page.getByRole('region', { name: 'Proposed edits' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply edits' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  ratio = await page.getByTestId('editor-preview-canvas').evaluate((element) => {
    const bounds = element.getBoundingClientRect(); return bounds.width / bounds.height;
  });
  expect(Math.abs(ratio - 9 / 16)).toBeLessThan(0.02);
  expect(exportRequests).toBe(0);
});

test('mobile Copilot uses the existing bottom sheet and keeps preview visible', async ({ page }) => {
  await mockGuestEditor(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Open AI Copilot' }).click();
  const sheet = page.getByTestId('mobile-editor-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('editor-preview-canvas')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Copilot null update placeholders preview and apply an animated slideshow title', async ({ page }) => {
  await mockGuestEditor(page);
  await page.addInitScript(() => window.localStorage.setItem('vidyo_access_token', 'test-firebase-id-token'));
  await page.route('**/api/editor/copilot/plan', async (route) => {
    const request = route.request().postDataJSON() as { projectRevision: string; project: { tracks: { id: string; items: { id: string }[] }[] } };
    const clips = request.project.tracks.find((track) => track.id === 'video')!.items;
    expect(clips).toHaveLength(2);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      plan: {
        schemaVersion: '1.0', requestId: 'null-placeholder-test', projectRevision: request.projectRevision,
        summary: 'Two images and an animated title.', warnings: [], operations: [
          ...clips.map((clip, index) => ({ op: 'update_item', itemId: clip.id, changes: { startTime: index * 3, duration: 3, text: null, fontSize: null, shadow: null, inAnimation: null } })),
          { op: 'add_text', item: {
            id: 'ai-title', kind: 'text', trackId: 'text', label: 'My First AI Video', text: 'My First AI Video',
            startTime: 0, duration: 3, fontFamily: 'Inter', fontSize: 40, color: '#ffffff', bold: false,
            x: 0.5, y: 0.5, width: 0.8, rotation: 0, alignment: 'center', outlineColor: '#000000',
            outlineWidth: 0, shadow: true, backgroundColor: '#000000', backgroundOpacity: 0,
            inAnimation: 'fade-in', outAnimation: 'none', loopAnimation: 'none', inAnimationDuration: 1, outAnimationDuration: 0.5,
          } },
        ],
      }, usage: { inputTokens: 20, outputTokens: 10, estimatedCostUsd: 0 },
    }) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  // Two image clips can reference the same uploaded image; their item IDs differ.
  const add = page.getByRole('button', { name: 'Add a-very-long-photo-filename-for-truncation.png to timeline' });
  await add.click();
  await add.click();
  await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  await page.getByLabel('Ask AI Copilot to edit the project').fill('Keep order, three seconds each, add My First AI Video with a one-second fade-in.');
  await page.getByRole('button', { name: 'Propose' }).click();
  await expect(page.getByRole('region', { name: 'Proposed edits' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply edits' })).toBeEnabled();
  await page.getByRole('button', { name: 'Apply edits' }).click();
  await expect(page.getByRole('region', { name: 'Proposed edits' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'My First AI Video', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'My First AI Video', exact: true })).toHaveCount(0);
});
