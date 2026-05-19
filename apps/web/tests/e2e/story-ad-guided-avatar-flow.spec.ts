import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

type ProjectState = {
  id: string;
  user_id: string;
  ad_category: string;
  creation_mode: 'avatar' | 'storyboard';
  workflow_state: string;
  business_brief: string;
  platform: string;
  language: string;
  tone: string;
  avatar_id?: string;
  display_script?: string;
  tts_script?: string;
  selected_voice?: string;
  duration_seconds?: number;
  credits_estimated: number;
  credits_consumed: number;
  created_at: string;
  updated_at: string;
};

type Scene = {
  id: string;
  scene_number: number;
  scene_type: string;
  spoken_line: string;
  visual_description: string;
  shot_type: string;
  base_image_url: string | null;
  state: string;
  user_approved: boolean | null;
  avatar_action?: string;
  environment?: string;
  mood?: string;
  duration_seconds: number;
};

test('story-ad guided avatar flow progresses to production with chitrakala continuity', async ({ page }) => {
  const now = new Date().toISOString();
  const projectId = 'story-ad-e2e-project';
  const userId = 'playwright-story-user';

  let project: ProjectState | null = null;
  let scenes: Scene[] = [];

  await page.addInitScript((uid) => {
    window.localStorage.setItem('test-user-id', uid);
  }, userId);

  await page.route(`${API_BASE}/api/storyboard/initialize`, async (route) => {
    const payload = route.request().postDataJSON() as Record<string, any>;
    project = {
      id: projectId,
      user_id: userId,
      ad_category: String(payload.ad_category || 'ugc_testimonial'),
      creation_mode: String(payload.creation_mode || 'avatar') as 'avatar' | 'storyboard',
      workflow_state: 'initialized',
      business_brief: String(payload.business_brief || ''),
      platform: String(payload.platform || 'instagram_reels'),
      language: String(payload.language || 'hi'),
      tone: String(payload.tone || 'casual'),
      avatar_id: 'chitrakala',
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
        ad_category: project.ad_category,
        created_at: now,
      }),
    });
  });

  await page.route(`${API_BASE}/api/storyboard/${projectId}/generate-script`, async (route) => {
    if (project) {
      project.workflow_state = 'script_awaiting_approval';
      project.display_script =
        'Namaste! Main Chitrakala hoon. Yeh wooden wall clock ghar ko elegant look deta hai. Aaj hi order kariye.';
      project.tts_script = project.display_script;
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', result: { status: 'queued' } }),
    });
  });

  await page.route(`${API_BASE}/api/storyboard/${projectId}/approve-script`, async (route) => {
    if (project) {
      project.workflow_state = 'script_approved';
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', result: { workflow_state: 'script_approved' } }),
    });
  });

  await page.route(`${API_BASE}/api/storyboard/${projectId}/generate-storyboard`, async (route) => {
    if (project) {
      project.workflow_state = 'storyboard_awaiting_approval';
      project.duration_seconds = 10;
      project.updated_at = new Date().toISOString();
    }
    scenes = [
      {
        id: 'scene-1',
        scene_number: 1,
        scene_type: 'hook',
        spoken_line: 'Yeh premium wooden wall clock dekhiye.',
        visual_description: 'Chitrakala smiles in frame, product visible at chest level.',
        shot_type: 'medium',
        base_image_url: 'https://images.example.com/scene-1.jpg',
        state: 'awaiting_approval',
        user_approved: null,
        avatar_action: 'Show clock beside face, no mouth occlusion',
        environment: 'home decor setup',
        mood: 'friendly',
        duration_seconds: 2,
      },
      {
        id: 'scene-2',
        scene_number: 2,
        scene_type: 'benefit',
        spoken_line: 'Iska handcrafted finish aapke room ko classy banata hai.',
        visual_description: 'Chitrakala points to texture detail of the wall clock.',
        shot_type: 'close-up',
        base_image_url: 'https://images.example.com/scene-2.jpg',
        state: 'awaiting_approval',
        user_approved: null,
        avatar_action: 'Natural gesture with product',
        environment: 'living room wall',
        mood: 'warm',
        duration_seconds: 2,
      },
      {
        id: 'scene-3',
        scene_number: 3,
        scene_type: 'social-proof',
        spoken_line: 'Lightweight hai aur lagana bhi easy.',
        visual_description: 'Chitrakala demonstrates ease of placement.',
        shot_type: 'medium',
        base_image_url: 'https://images.example.com/scene-3.jpg',
        state: 'awaiting_approval',
        user_approved: null,
        avatar_action: 'Calm talking pose',
        environment: 'home corner',
        mood: 'confident',
        duration_seconds: 2,
      },
      {
        id: 'scene-4',
        scene_number: 4,
        scene_type: 'cta',
        spoken_line: 'Festive gifting ke liye perfect choice.',
        visual_description: 'Chitrakala holds product lower than chin line.',
        shot_type: 'medium',
        base_image_url: 'https://images.example.com/scene-4.jpg',
        state: 'awaiting_approval',
        user_approved: null,
        avatar_action: 'Friendly recommendation expression',
        environment: 'decor shelf',
        mood: 'joyful',
        duration_seconds: 2,
      },
      {
        id: 'scene-5',
        scene_number: 5,
        scene_type: 'close',
        spoken_line: 'Abhi order kijiye.',
        visual_description: 'Chitrakala final nod with product in frame.',
        shot_type: 'close-up',
        base_image_url: 'https://images.example.com/scene-5.jpg',
        state: 'awaiting_approval',
        user_approved: null,
        avatar_action: 'Final CTA pose',
        environment: 'clean backdrop',
        mood: 'assured',
        duration_seconds: 2,
      },
    ];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        result: { status: 'queued', scene_count: scenes.length },
      }),
    });
  });

  await page.route(`${API_BASE}/api/storyboard/${projectId}/storyboard`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', scenes }),
    });
  });

  await page.route(`${API_BASE}/api/storyboard/${projectId}/approve-storyboard`, async (route) => {
    if (project) {
      project.workflow_state = 'storyboard_approved';
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', result: { workflow_state: 'storyboard_approved' } }),
    });
  });

  await page.route(new RegExp(`${API_BASE}/api/storyboard/${projectId}/scenes/.+/approve`), async (route) => {
    const url = route.request().url();
    const sceneId = url.split('/scenes/')[1]?.split('/')[0];
    const payload = route.request().postDataJSON() as { user_approved?: boolean };
    scenes = scenes.map((scene) => (scene.id === sceneId ? { ...scene, user_approved: !!payload.user_approved } : scene));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', user_approved: !!payload.user_approved }),
    });
  });

  await page.route(`${API_BASE}/api/storyboard/${projectId}/generate-images`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', message: 'estimate provided' }),
    });
  });

  await page.route(`${API_BASE}/api/storyboard/${projectId}/approve-images`, async (route) => {
    if (project) {
      project.workflow_state = 'images_approved';
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', result: { workflow_state: 'images_approved' } }),
    });
  });

  await page.route(`${API_BASE}/api/storyboard/${projectId}/voice-preview`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        audio_url: 'data:audio/mp3;base64,SUQzBAAAAAAA',
        voice: 'Emma',
      }),
    });
  });

  await page.route(`${API_BASE}/api/storyboard/${projectId}/select-voice`, async (route) => {
    if (project) {
      project.selected_voice = 'Emma';
      project.workflow_state = 'production_starting';
      project.updated_at = new Date().toISOString();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        voice: 'Emma',
        workflow_state: 'production_starting',
      }),
    });
  });

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

  await page.route(`${API_BASE}/api/storyboard/${projectId}`, async (route) => {
    if (!project) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
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

  await page.goto('/story-ad?step=category');

  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();
  await expect(page.getByText(/How to Create Your UGC Testimonial Ad/i)).toBeVisible();
  await page.getByRole('button', { name: /Create with Avatar/i }).click();

  await page.getByRole('button', { name: /UGC Testimonial/i }).first().click();
  await page.getByRole('button', { name: /Continue to Brief/i }).click();

  await page.getByPlaceholder(/Describe your product, target audience/i).fill(
    'Handcrafted wooden wall clock for modern homes. Use chitrakala avatar as presenter and keep identity consistent across scenes.'
  );
  await page.getByRole('button', { name: /Review & Generate/i }).click();

  await page.getByRole('checkbox', { name: /I\'m ready to generate my ad/i }).check();
  await page.getByRole('button', { name: /Generate My Ad/i }).click();

  await expect(page.getByRole('heading', { name: /Script Checkpoint/i })).toBeVisible();
  await expect(page.getByText(/Chitrakala/i)).toBeVisible();
  await page.getByRole('button', { name: /Approve Script/i }).click();

  await expect(page.getByRole('heading', { name: /Storyboard Checkpoint/i })).toBeVisible();
  await expect(page.getByText(/Chitrakala/i)).toHaveCount(5);
  await page.getByRole('button', { name: /Approve Storyboard/i }).click();

  await expect(page.getByRole('heading', { name: /Image Checkpoint/i })).toBeVisible();
  await page.getByRole('button', { name: /Approve All Images/i }).click();

  await expect(page.getByRole('heading', { name: /Voice Selection/i })).toBeVisible();
  await page.getByRole('button', { name: /Preview \(3 credits\)/i }).first().click();
  await page.getByText(/Preview playing/i).first().waitFor({ state: 'visible' });
  await page.getByText('Emma').first().click();
  await page.getByRole('button', { name: /Confirm Voice Selection/i }).click();

  await expect(page.getByRole('heading', { name: /Production in Progress/i })).toBeVisible();
});
