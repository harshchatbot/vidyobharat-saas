import { expect, test, type Page } from '@playwright/test';

const mockUserId = 'playwright-avatar-user';

async function seedSession(page: Page) {
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

async function mockAvatarProductApis(page: Page) {
  let capturedAssistPayload: Record<string, unknown> | null = null;
  let capturedPreviewPayload: Record<string, unknown> | null = null;
  let capturedCreatePayload: Record<string, unknown> | null = null;

  await page.route('**/api/recipes/avatar-product/tts-catalog', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'gemini_flash_tts',
        model: 'fal-ai/gemini-3.1-flash-tts',
        languages: [
          { code: 'English (India)', label: 'English (India)', native_label: 'English (India)' },
          { code: 'Hindi (India)', label: 'Hindi (India)', native_label: 'Hindi (India)' },
        ],
        voices: [
          {
            key: 'Kore',
            label: 'Kore',
            tone: 'Strong female',
            gender: 'female',
            provider_voice: 'Kore',
            supported_language_codes: [],
            description: 'Strong female voice.',
          },
          {
            key: 'Aoede',
            label: 'Aoede',
            tone: 'Warm female',
            gender: 'female',
            provider_voice: 'Aoede',
            supported_language_codes: [],
            description: 'Warm female voice.',
          },
        ],
      }),
    });
  });

  await page.route('**/api/recipes/avatar-product/assist', async (route) => {
    capturedAssistPayload = (await route.request().postDataJSON()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fields: {
          recipe_id: 'avatar_product',
          product_name: 'Lightweight wooden wall clock',
          product_category: 'home_decor',
          target_audience: 'Home decor shoppers',
          campaign_objective: 'drive_purchases',
          platform: 'Instagram Reels',
          main_benefit: 'Lightweight and easy to hang',
          script_mode: 'auto_generate',
        },
        canGenerate: true,
        nextQuestion: null,
        missingTier1: [],
        missingTier2: [],
        missingTier3: [],
        advancedControlsSummary: {
          product_category: 'home_decor',
          duration_seconds: '5',
        },
      }),
    });
  });

  await page.route(/\/api\/recipes(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'avatar_product',
          type: 'video',
          title: 'Avatar Product',
          slug: 'avatar-product',
          description: 'Talking-head product ad with an AI avatar.',
          short_label: 'Avatar ad',
          preview_video_url: 'https://videos.example.com/avatar-product.mp4',
          preview_image_url: 'https://images.example.com/avatar-product.jpg',
          active: true,
          featured: true,
          trending: false,
          order: 1,
          tags: ['ads', 'avatar'],
          duration_seconds: 10,
          input: { text: true, image: true },
          generation_defaults: {
            model_key: 'seedance_v1_lite_reference',
            aspect_ratio: '9:16',
            resolution: '720p',
            language: 'English (India)',
            voice: 'Kore',
            duration_seconds: 10,
            quality: 'affordable',
            narration_enabled: true,
            captions_enabled: false,
          },
          composer: {
            recipe_label: 'Avatar Product',
            mode: 'video',
            fragments: [
              { type: 'text', value: 'Create an avatar product ad for ' },
              { type: 'slot', slot_id: 'product_brief' },
              { type: 'text', value: ' using ' },
              { type: 'slot', slot_id: 'product_image' },
              { type: 'text', value: '.' },
            ],
            slots: [
              {
                id: 'product_brief',
                kind: 'text',
                label: 'Product brief',
                placeholder: 'lightweight wooden wall clock with WhatsApp orders',
                required: true,
                submit_target: 'text',
              },
              {
                id: 'product_image',
                kind: 'upload',
                label: 'Product image',
                placeholder: 'Upload product image',
                required: true,
                sample_label: 'Wall clock sample',
                sample_preview_url: 'https://images.example.com/wall-clock-sample.jpg',
                submit_target: 'image',
              },
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
        currentCredits: 500,
        monthlyCredits: 200,
        usedCredits: 0,
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
        estimatedCredits: 42,
        breakdown: [{ component: 'avatar_product_fixed', value: 42, label: 'Avatar Product' }],
        currentCredits: 500,
        remainingCredits: 458,
        sufficient: true,
        premium: false,
      }),
    });
  });

  await page.route('**/api/video/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          key: 'seedance_v1_lite_reference',
          label: 'Seedance Lite',
          description: 'Affordable reference video generation.',
          frontendHint: 'Affordable avatar product generation.',
          apiAdapter: 'fal',
          shortLabel: 'Seedance Lite',
          tier: 'creator',
          enabled: true,
          featured: true,
          qualityBadge: 'Affordable',
          speedBadge: 'Fast',
          creditBadge: 'Affordable',
          resolutionLabels: ['720p'],
          modeIds: ['creator_pro'],
          billingUnit: 'per_video',
        },
      ]),
    });
  });

  await page.route('**/api/image/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/ai/image/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/tts/catalog', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: [],
        voices: [],
        languages: [],
      }),
    });
  });

  await page.route('**/notifications?limit=20', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
      headers: {
        'access-control-allow-origin': '*',
      },
    });
  });

  await page.route('**/api/avatars/library**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        avatars: [
          {
            id: 'av-chitrakala',
            name: 'Chitrakala',
            scope: 'public',
            style: 'Friendly creator',
            gender: 'female',
            language_tags: ['Hindi (India)', 'English (India)'],
            thumbnail_url: 'https://images.example.com/chitrakala-thumb.png',
            tags: ['ugc', 'avatar'],
            category: 'ugc_influencer',
            reference_images: ['https://images.example.com/chitrakala-front.png'],
            reference_image_variants: [
              {
                id: 'front',
                url: 'https://images.example.com/chitrakala-front.png',
                tags: ['front', 'neutral', 'talking'],
              },
            ],
            primary_image: 'https://images.example.com/chitrakala-front.png',
            preview_video_url: null,
            prompt_template: 'Friendly Indian creator speaking naturally to camera.',
            negative_prompt: null,
            recommended_voice: 'Priya',
            voice_profile: null,
            status: 'ready',
            description: 'Chitrakala sample avatar',
            source: 'actor',
            avatar_type: 'system',
            provider: 'reference_image',
          },
        ],
      }),
    });
  });

  await page.route('**/api/ai/script/translate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: 'यह एक हल्की लकड़ी की वॉल क्लॉक है जो आसानी से लग जाती है।',
      }),
    });
  });

  await page.route('**/uploads/direct', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        asset_id: 'asset-wall-clock',
        upload_url: 'https://uploads.example.com/wall-clock.png',
        public_url: 'https://images.example.com/wall-clock-uploaded.png',
        method: 'POST',
        headers: {},
      }),
    });
  });

  await page.route('**/tts/preview', async (route) => {
    capturedPreviewPayload = (await route.request().postDataJSON()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        preview_url: 'https://audio.example.com/avatar-product-preview.mp3',
        provider: 'Gemini Flash TTS',
        resolved_voice: String(capturedPreviewPayload.voice ?? ''),
        cached: false,
        preview_limit: '20 uncached previews / 10 min · 280 chars max',
        provider_message: 'Avatar Product preview uses Gemini Flash TTS.',
        applied_credits: 0,
        remaining_credits: 500,
      }),
    });
  });

  await page.route('**/api/ai/video/create', async (route) => {
    capturedCreatePayload = (await route.request().postDataJSON()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'video-avatar-qa',
        status: 'queued',
      }),
    });
  });

  return {
    getAssistPayload: () => capturedAssistPayload,
    getPreviewPayload: () => capturedPreviewPayload,
    getCreatePayload: () => capturedCreatePayload,
  };
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

test('avatar product flow keeps Chitrakala, Hindi, female voice, and 5s duration', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    (window as any).__qaFetchLog = [];
    window.fetch = async (...args) => {
      const [input] = args;
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      (window as any).__qaFetchLog?.push(url);
      return originalFetch(...args);
    };
  });

  await seedSession(page);
  const captures = await mockAvatarProductApis(page);

  await page.goto('/create', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { level: 1, name: /choose a recipe\. create instantly\./i })).toBeVisible();

  await page.getByRole('button', { name: /avatar product/i }).click();
  await page.getByRole('button', { name: 'Use this recipe', exact: true }).click();

  await expect(page.getByText('Avatar product assistant')).toBeVisible();
  await expect(page.getByRole('button', { name: /chitrakala/i })).toBeVisible();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /upload product image/i }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('/Users/harshveersinghnirwan/Downloads/avatar_chitrakala5.png');
  await expect(page.getByRole('button', { name: /avatar_chitrakala5\.png/i })).toBeVisible();

  await page.getByPlaceholder('lightweight wooden wall clock with WhatsApp orders').fill('a lightweight wooden wall clock for WhatsApp orders');

  await page.getByRole('button', { name: /advanced controls/i }).click();
  await page.locator('select').filter({ has: page.locator('option[value="home_decor"]') }).selectOption('home_decor');

  await page.getByRole('button', { name: '… More', exact: true }).click();
  await page.getByRole('button', { name: /^5s$/i }).click();
  await page.getByRole('button', { name: '… More', exact: true }).click();

  const languageSelect = page.locator('label:has-text("Language") select').last();
  await languageSelect.selectOption('Hindi (India)');

  const voiceSelect = page.locator('label:has-text("Voice") select').last();
  await voiceSelect.selectOption('Aoede');

  const previewResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/tts/preview') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /preview voice/i }).click();
  await previewResponsePromise;
  await expect(page.locator('audio')).toHaveCount(1);

  const previewPayload = captures.getPreviewPayload();
  expect(previewPayload).not.toBeNull();
  expect(previewPayload?.language).toBe('Hindi (India)');
  expect(previewPayload?.voice).toBe('Aoede');

  const createResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/ai/video/create') && response.request().method() === 'POST',
    { timeout: 10_000 },
  );
  await page.getByRole('button', { name: /^generate$/i }).click({ force: true });
  let createResponseSeen = true;
  try {
    await createResponsePromise;
  } catch (error) {
    createResponseSeen = false;
  }

  if (!createResponseSeen) {
    const alerts = await page.locator('[role="alert"]').allInnerTexts();
    const fetchLog = await page.evaluate(() => (window as any).__qaFetchLog || []);
    const bodyText = await page.locator('body').innerText();
    const interestingLines = bodyText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => /(fill|select|upload|required|prompt|avatar|category|could not|preview|generate)/i.test(line))
      .slice(0, 20);
    throw new Error([
      'Create request was not sent within 10s.',
      alerts.length ? `alerts=${JSON.stringify(alerts)}` : 'alerts=[]',
      `assistPayload=${JSON.stringify(captures.getAssistPayload())}`,
      `fetchLog=${JSON.stringify(fetchLog)}`,
      `interestingLines=${JSON.stringify(interestingLines)}`,
      pageErrors.length ? `pageErrors=${JSON.stringify(pageErrors)}` : 'pageErrors=[]',
      consoleErrors.length ? `consoleErrors=${JSON.stringify(consoleErrors)}` : 'consoleErrors=[]',
    ].join('\n'));
  }
  await page.waitForURL('**/videos/video-avatar-qa');

  const createPayload = captures.getCreatePayload();
  expect(createPayload).not.toBeNull();
  expect(createPayload?.recipeId).toBe('avatar_product');
  expect(createPayload?.personaId).toBe('av-chitrakala');
  expect(createPayload?.useAvatarForTalkingScenes).toBe(true);
  expect(createPayload?.language).toBe('Hindi (India)');
  expect(createPayload?.voice).toBe('Aoede');
  expect((createPayload?.inputs as Record<string, unknown>)?.duration_seconds).toBe('5');
  expect((createPayload?.inputs as Record<string, unknown>)?.product_category).toBe('home_decor');
});
