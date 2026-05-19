import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

test('story-ad complete workflow with avatar selection', async ({ page }) => {
  const now = new Date().toISOString();
  const projectId = 'story-ad-qa-project';
  const userId = 'playwright-qa-user';

  let project: any = null;
  let scenes: any[] = [];

  // Set test user ID in localStorage
  await page.addInitScript((uid) => {
    window.localStorage.setItem('test-user-id', uid);
  }, userId);

  // Mock avatar library endpoint
  await page.route('**/api/avatars/library', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        preset_avatars: [
          {
            id: 'chitrakala',
            personaId: 'chitrakala',
            name: 'Chitrakala',
            thumbnail_url: 'https://images.example.com/chitrakala-thumb.jpg',
            primary_image: 'https://images.example.com/chitrakala.jpg',
            preview_video_url: 'https://videos.example.com/chitrakala-demo.mp4',
            description: 'Professional female avatar',
            sourceLabel: 'Public',
            languageInfo: 'Hindi, English',
            voiceInfo: 'Natural, warm tone',
          },
        ],
        user_avatars: [],
        avatars: [],
      }),
    });
  });

  // Mock storyboard initialize endpoint
  await page.route(`${API_BASE}/api/storyboard/initialize`, async (route) => {
    const payload = route.request().postDataJSON() as Record<string, any>;
    project = {
      id: projectId,
      user_id: userId,
      ad_category: String(payload.ad_category || 'ugc_testimonial'),
      workflow_state: 'initialized',
      business_brief: String(payload.business_brief || ''),
      platform: String(payload.platform || 'instagram_reels'),
      language: String(payload.language || 'hi'),
      tone: String(payload.tone || 'casual'),
      avatar_id: payload.avatar_id || null,
      credits_estimated: 50,
      credits_consumed: 0,
      created_at: now,
      updated_at: now,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        project_id: projectId,
        workflow_state: 'initialized',
        created_at: now,
      }),
    });
  });

  // Mock generate script
  await page.route(`${API_BASE}/api/storyboard/${projectId}/generate-script`, async (route) => {
    if (project) {
      project.workflow_state = 'script_awaiting_approval';
      project.display_script = 'Chitrakala avatar script here.';
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', result: { status: 'queued' } }),
    });
  });

  // Mock approve script
  await page.route(`${API_BASE}/api/storyboard/${projectId}/approve-script`, async (route) => {
    if (project) {
      project.workflow_state = 'script_approved';
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success' }),
    });
  });

  // Mock update script
  await page.route(`${API_BASE}/api/storyboard/${projectId}/update-script`, async (route) => {
    const payload = route.request().postDataJSON() as Record<string, any>;
    if (project) {
      project.display_script = payload.display_script;
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success' }),
    });
  });

  // Mock regenerate script
  await page.route(`${API_BASE}/api/storyboard/${projectId}/regenerate-script`, async (route) => {
    if (project) {
      project.workflow_state = 'script_awaiting_approval';
      project.display_script = 'Regenerated script by Chitrakala.';
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success' }),
    });
  });

  // Mock generate storyboard
  await page.route(`${API_BASE}/api/storyboard/${projectId}/generate-storyboard`, async (route) => {
    if (project) {
      project.workflow_state = 'storyboard_awaiting_approval';
      project.duration_seconds = 15;
      project.updated_at = new Date().toISOString();
    }
    scenes = [
      {
        id: 'scene-1',
        scene_number: 1,
        scene_type: 'hook',
        spoken_line: 'Welcome to our product demonstration.',
        visual_description: 'Chitrakala smiling at camera',
        shot_type: 'medium',
        base_image_url: 'https://images.example.com/scene-1.jpg',
        state: 'awaiting_approval',
        user_approved: null,
        duration_seconds: 5,
      },
      {
        id: 'scene-2',
        scene_number: 2,
        scene_type: 'benefit',
        spoken_line: 'This product will change your life.',
        visual_description: 'Chitrakala pointing at product',
        shot_type: 'close-up',
        base_image_url: 'https://images.example.com/scene-2.jpg',
        state: 'awaiting_approval',
        user_approved: null,
        duration_seconds: 5,
      },
      {
        id: 'scene-3',
        scene_number: 3,
        scene_type: 'cta',
        spoken_line: 'Order now and get 20% discount.',
        visual_description: 'Chitrakala with product',
        shot_type: 'medium',
        base_image_url: 'https://images.example.com/scene-3.jpg',
        state: 'awaiting_approval',
        user_approved: null,
        duration_seconds: 5,
      },
    ];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', result: { scene_count: scenes.length } }),
    });
  });

  // Mock get storyboard
  await page.route(`${API_BASE}/api/storyboard/${projectId}/storyboard`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', scenes }),
    });
  });

  // Mock approve storyboard
  await page.route(`${API_BASE}/api/storyboard/${projectId}/approve-storyboard`, async (route) => {
    if (project) {
      project.workflow_state = 'storyboard_approved';
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success' }),
    });
  });

  // Mock scene approval
  await page.route(new RegExp(`${API_BASE}/api/storyboard/${projectId}/scenes/.+/approve`), async (route) => {
    const url = route.request().url();
    const sceneId = url.split('/scenes/')[1]?.split('/')[0];
    const payload = route.request().postDataJSON() as { user_approved?: boolean };
    scenes = scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, user_approved: !!payload.user_approved } : scene
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success' }),
    });
  });

  // Mock generate images
  await page.route(`${API_BASE}/api/storyboard/${projectId}/generate-images`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', message: 'estimate provided' }),
    });
  });

  // Mock approve images
  await page.route(`${API_BASE}/api/storyboard/${projectId}/approve-images`, async (route) => {
    if (project) {
      project.workflow_state = 'images_approved';
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success' }),
    });
  });

  // Mock get project
  await page.route(`${API_BASE}/api/storyboard/${projectId}`, async (route) => {
    if (!project) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not found' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        project: project,
      }),
    });
  });

  // Mock credit estimate
  await page.route(new RegExp(`${API_BASE}/api/storyboard/${projectId}/credit-estimate.*`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        estimate: { cost_credits: 10, can_afford: true, available_credits: 999 },
      }),
    });
  });

  // Start the test
  await page.goto('/story-ad?step=category');

  // Step 1: Select category
  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();
  await expect(page.getByRole('button', { name: /Create with Avatar/i })).toBeVisible();

  // Step 2: Click "Create with Avatar"
  await page.getByRole('button', { name: /Create with Avatar/i }).click();

  // Step 3: Avatar picker should now be visible
  await expect(page.getByRole('heading', { name: /Choose your spokesperson/i })).toBeVisible();

  // Step 4: Select Chitrakala avatar (wait for avatars to load)
  await expect(page.getByText('Chitrakala', { exact: false })).toBeVisible({ timeout: 5000 });

  // Step 5: Click "Use" button on the Chitrakala card - it's the purple button that says "Use"
  // There are two buttons on the card: "Preview" and "Use"
  const useButtons = page.getByRole('button', { name: /^Use$/i });
  await useButtons.first().click();

  // Step 6: Now should be at Step 1 (Platform selection)
  await expect(page.getByRole('heading', { name: /Choose Your Ad Style & Platform/i })).toBeVisible();

  // Click on UGC Testimonial to select it (though it might already be pre-selected)
  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();

  // Click on Instagram Reels to select it
  await page.getByRole('button', { name: /Instagram Reels/i }).first().click();

  // Move forward (button should now be enabled)
  await page.getByRole('button', { name: /Continue to Brief/i }).click();

  // Step 7: Now at Step 2 (Business Brief)
  await expect(page.getByPlaceholder(/Describe your product/i)).toBeVisible();

  // Step 8: Fill in business brief
  await page.getByPlaceholder(/Describe your product/i).fill('Premium coffee maker for home enthusiasts');
  await page.getByRole('button', { name: /Review & Generate/i }).click();

  // Step 9: Check confirmation checkbox and generate
  await page.getByRole('checkbox', { name: /ready to generate/i }).check();
  await page.getByRole('button', { name: /Generate My Ad/i }).click();

  // Step 9.5: Select Mock Test mode from dialog
  console.log('Waiting for Testing Mode dialog...');
  await expect(page.getByRole('heading', { name: /Choose Testing Mode/i })).toBeVisible({ timeout: 5000 });
  console.log('Testing Mode dialog appeared, clicking Mock Test button...');
  await page.getByRole('button', { name: /Mock Test/i }).click();
  console.log('Mock Test mode selected');

  // Step 10: Script Checkpoint should appear
  console.log('Waiting for Script Checkpoint...');
  await expect(page.getByRole('heading', { name: /Script Checkpoint/i })).toBeVisible({ timeout: 10000 });
  console.log('Script Checkpoint appeared!');

  // Step 11: Test script editing
  await page.getByRole('button', { name: /Edit/i }).click();
  await page.getByRole('textbox').clear();
  await page.getByRole('textbox').fill('Updated script by Chitrakala');
  await page.getByRole('button', { name: /Save Changes/i }).click();

  // Step 12: Test script regeneration
  await page.getByRole('button', { name: /Regenerate/i }).click();
  await page.waitForTimeout(2000);

  // Step 13: Approve script
  console.log('Approving script...');
  await page.getByRole('button', { name: /Approve Script/i }).click();
  console.log('Script approval initiated, waiting for storyboard checkpoint...');

  // Step 14: Storyboard checkpoint
  await expect(page.getByRole('heading', { name: /Storyboard Checkpoint/i })).toBeVisible({ timeout: 10000 });
  console.log('Storyboard Checkpoint visible, approving...');
  await page.getByRole('button', { name: /Approve Storyboard/i }).click();
  console.log('Storyboard approval initiated, waiting for image checkpoint...');

  // Step 15: Image checkpoint
  await expect(page.getByRole('heading', { name: /Image Checkpoint/i })).toBeVisible({ timeout: 10000 });
  console.log('Image Checkpoint visible');

  // Step 16: Images should be loaded and ready for approval
  // We can see the "Approve All Images" button is available
  console.log('Waiting for Approve All Images button...');
  await expect(page.getByRole('button', { name: /Approve All Images/i })).toBeVisible({ timeout: 5000 });

  // Step 17: Approve all images and proceed
  console.log('Approving all images...');
  await page.getByRole('button', { name: /Approve All Images/i }).click();
  console.log('Image approval initiated, waiting for next checkpoint...');

  // Step 18: Should proceed to Voice Selector or Production
  // Give it time to transition
  await page.waitForTimeout(2000);

  console.log('✅ Workflow completed successfully!');
});
