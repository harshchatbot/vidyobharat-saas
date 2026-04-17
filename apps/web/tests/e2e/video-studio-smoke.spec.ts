import { expect, test, type Page } from '@playwright/test';

const mockUserId = 'playwright-user';

async function seedVideoStudioSession(page: Page) {
  await page.context().addCookies([
    {
      name: 'vidyo_user_id',
      value: mockUserId,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'vidyo_access_token',
      value: 'playwright-token',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

async function mockVideoStudioApis(page: Page) {
  await page.route('**/api/recipes**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'deep_dive_explainer',
          type: 'video',
          title: 'Deep Dive Explainer',
          slug: 'deep-dive-explainer',
          description: 'Explain bigger topics with a longer visual narrative.',
          short_label: 'Deep dive',
          preview_video_url: 'https://videos.example.com/deep-dive.mp4',
          preview_image_url: 'https://images.example.com/deep-dive.jpg',
          active: true,
          featured: true,
          trending: false,
          order: 1,
          tags: ['explainer', 'education'],
          duration_seconds: 36,
          input: { text: true },
          generation_defaults: {
            model_key: 'sora2',
            aspect_ratio: '9:16',
            resolution: '720p',
            language: 'en-IN',
            voice: 'Shubh',
            duration_seconds: 36,
            quality: 'premium',
          },
          composer: {
            recipe_label: 'Deep Dive Explainer',
            mode: 'video',
            fragments: [
              { type: 'text', value: 'Explain ' },
              { type: 'slot', slot_id: 'topic' },
              { type: 'text', value: ' in a visual deep-dive format.' },
            ],
            slots: [
              { id: 'topic', kind: 'text', label: 'Topic', placeholder: 'how black holes work' },
            ],
          },
        },
        {
          id: 'ugc_ad',
          type: 'video',
          title: 'UGC Ad',
          slug: 'ugc-ad',
          description: 'Creator-style ad videos for products and local services.',
          short_label: 'UGC ad',
          preview_video_url: 'https://videos.example.com/ugc-ad.mp4',
          preview_image_url: 'https://images.example.com/ugc-ad.jpg',
          active: true,
          featured: true,
          trending: false,
          order: 2,
          tags: ['ads', 'ugc'],
          duration_seconds: 24,
          input: { text: true },
          generation_defaults: {
            model_key: 'kling3',
            aspect_ratio: '9:16',
            resolution: '720p',
            language: 'en-IN',
            voice: 'Shubh',
            duration_seconds: 24,
            quality: 'creator_pro',
          },
          composer: {
            recipe_label: 'UGC Ad',
            mode: 'video',
            fragments: [
              { type: 'text', value: 'Create a local-service UGC ad for ' },
              { type: 'slot', slot_id: 'business' },
              { type: 'text', value: '.' },
            ],
            slots: [
              { id: 'business', kind: 'text', label: 'Business', placeholder: 'a dental clinic in Jaipur' },
            ],
          },
        },
      ]),
    });
  });

  await page.route('**/api/credits/wallet**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentCredits: 80,
        monthlyCredits: 40,
        usedCredits: 8,
        planName: 'Free',
        lastReset: new Date().toISOString(),
      }),
    });
  });

  await page.route('**/api/estimateCredits**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        estimatedCredits: 18,
        breakdown: [
          { component: 'model_price', value: 15, label: 'Base generation' },
          { component: 'auto_tag', value: 3, label: 'Auto tag' },
        ],
        currentCredits: 80,
        remainingCredits: 62,
        sufficient: true,
        premium: false,
      }),
    });
  });

  await page.route('**/api/video/models**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          key: 'kling3',
          label: 'Kling 3.0',
          description: 'Stable short-form generation.',
          frontendHint: 'Best low-friction option for quick creator videos.',
          apiAdapter: 'fal',
          shortLabel: 'Kling 3',
          tier: 'creator',
          enabled: true,
          featured: true,
          qualityBadge: 'Stable',
          speedBadge: 'Fast',
          creditBadge: 'Affordable',
          resolutionLabels: ['720p', '1080p'],
          modeIds: ['creator_pro'],
          billingUnit: 'per_video',
        },
        {
          key: 'sora2',
          label: 'Sora 2',
          description: 'Premium flagship video generation.',
          frontendHint: 'Use when you want premium motion and polish.',
          apiAdapter: 'openai',
          shortLabel: 'Sora 2',
          tier: 'premium',
          enabled: true,
          featured: true,
          qualityBadge: 'Premium',
          speedBadge: 'Slower',
          creditBadge: 'High',
          resolutionLabels: ['720p'],
          modeIds: ['premium'],
          billingUnit: 'per_video',
        },
        {
          key: 'veo3',
          label: 'Veo 3.1',
          description: 'High-quality cinematic generation.',
          frontendHint: 'Use for polished hero visuals and premium ads.',
          apiAdapter: 'google',
          shortLabel: 'Veo 3.1',
          tier: 'premium',
          enabled: true,
          featured: true,
          qualityBadge: 'Premium',
          speedBadge: 'Medium',
          creditBadge: 'High',
          resolutionLabels: ['720p', '1080p'],
          modeIds: ['premium'],
          billingUnit: 'per_video',
        },
      ]),
    });
  });

  await page.route('**/tts/catalog**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'sarvam',
        model: 'bulbul',
        languages: [
          { code: 'en-IN', label: 'English', native_label: 'English' },
          { code: 'hi-IN', label: 'Hindi', native_label: 'हिन्दी' },
        ],
        voices: [
          {
            key: 'Shubh',
            label: 'Shubh',
            tone: 'Warm',
            gender: 'Male',
            provider_voice: 'shubh',
            supported_language_codes: ['en-IN', 'hi-IN'],
            description: 'General-purpose creator voice.',
          },
          {
            key: 'Asha',
            label: 'Asha',
            tone: 'Bright',
            gender: 'Female',
            provider_voice: 'asha',
            supported_language_codes: ['en-IN', 'hi-IN'],
            description: 'Energetic commercial voice.',
          },
        ],
      }),
    });
  });

  await page.route('**/ai/images**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'img-1',
          parent_image_id: null,
          project_id: 'project-1',
          mode_id: 'fast_social',
          template_id: 'tpl-video-1',
          model_key: 'budget_image_model',
          prompt: 'Brand bottle hero still on wet stone.',
          aspect_ratio: '9:16',
          resolution: '1536',
          reference_urls: [],
          image_url: 'https://images.example.com/video-ref-1.jpg',
          thumbnail_url: 'https://images.example.com/video-ref-1-thumb.jpg',
          action_type: null,
          status: 'completed',
          is_public_inspiration: false,
          moderation_status: 'approved',
          inspiration_score: 0,
          like_count: 0,
          auto_tags: ['brand'],
          user_tags: ['launch'],
          applied_credits: 3,
          remaining_credits: 77,
          created_at: new Date().toISOString(),
        },
      ]),
    });
  });

  await page.route('**/videos**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'video-1',
          user_id: mockUserId,
          project_id: 'project-1',
          mode_id: 'creator_pro',
          template_id: 'tpl-video-1',
          title: 'Skincare Launch Reel',
          template: 'launch_reel',
          language: 'English',
          script: 'A premium skincare launch reel with soft camera motion.',
          voice: 'Shubh',
          aspect_ratio: '9:16',
          resolution: '720p',
          duration_mode: 'custom',
          duration_seconds: 8,
          captions_enabled: false,
          narration_enabled: true,
          caption_style: 'clean',
          audio_sample_rate_hz: 22050,
          status: 'completed',
          progress: 100,
          image_urls: [],
          selected_model: 'kling3',
          provider_name: 'Kling',
          source_image_url: null,
          reference_images: [],
          music_mode: 'none',
          music_track_id: null,
          music_file_url: null,
          music_volume: 0.8,
          duck_music: true,
          thumbnail_url: 'https://images.example.com/video-thumb-1.jpg',
          output_url: 'https://videos.example.com/video-1.mp4',
          error_message: null,
          is_public_inspiration: false,
          moderation_status: 'approved',
          inspiration_score: 0,
          like_count: 0,
          auto_tags: ['launch'],
          user_tags: ['brand'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  });

  await page.route('**/api/templates?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'tpl-video-1',
          name: 'Launch Reel',
          title: 'Launch Reel',
          category: 'ads',
          aspect_ratio: '9:16',
          thumbnail_url: 'https://images.example.com/template-video-thumb.jpg',
          type: 'video',
          description: 'A guided product launch reel.',
          short_description: 'Product launch workflow.',
          preview_image_url: 'https://images.example.com/template-video-preview.jpg',
          script_hint: 'Lead with the hero product moment and close with a clean CTA.',
          topic_hint: 'Launch reel for a premium skincare product',
          prompt_template: 'Create a launch reel for {product}.',
          active: true,
          badge: 'Quick Start',
          recommended_model: {
            mode: 'creator_pro',
            label: 'Kling 3.0',
            description: 'Stable creator workflow model.',
            internal_model_key: 'kling3',
          },
          generation_defaults: {
            model_key: 'kling3',
            aspect_ratio: '9:16',
            resolution: '720p',
            voice: 'Shubh',
            language: 'English',
            duration_seconds: 8,
            quality: 'standard',
          },
        },
      ]),
    });
  });

  await page.route('**/projects**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'project-1',
          user_id: mockUserId,
          title: 'Brand Campaign',
          script: 'Skincare launch campaign',
          language: 'English',
          voice: 'Shubh',
          template: 'tpl-video-1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          image_count: 2,
          video_count: 1,
        },
      ]),
    });
  });

  await page.route('**/music-tracks**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'track-1',
          name: 'Clean Beat',
          duration_sec: 30,
          preview_url: 'https://audio.example.com/track-1.mp3',
        },
      ]),
    });
  });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

test.describe('Video studio smoke', () => {
  test('create page redirects signed-out users to login', async ({ page }) => {
    await page.goto('/create');
    await expect(page).toHaveURL(/\/login/);
  });

  test('create page renders the main video studio shell for a signed-in user', async ({ page }) => {
    await seedVideoStudioSession(page);
    await mockVideoStudioApis(page);

    await page.goto('/create', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: /choose a recipe\. create instantly\./i })).toBeVisible();
    await expect(page.getByRole('button', { name: /generate/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^recipes$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^ads$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^explainer$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^inspiration photos$/i })).toBeVisible();
  });

  test('create page keeps only the simplified recipe tabs visible', async ({ page }) => {
    await seedVideoStudioSession(page);
    await mockVideoStudioApis(page);

    await page.goto('/create', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /^all$/i })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^ads$/i })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^explainer$/i })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^inspiration photos$/i })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /trending/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /entertainment/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /story/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /character/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /real estate/i })).toHaveCount(0);
  });
});
