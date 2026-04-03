import { expect, test, type Page } from '@playwright/test';

const mockUserId = 'playwright-user';

async function seedTemplatesSession(page: Page) {
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

async function mockTemplatesApis(page: Page) {
  const templateListBody = JSON.stringify([
    {
      id: 'tpl-video-1',
      name: 'Launch Reel',
      title: 'Launch Reel',
      category: 'ads_promos',
      aspect_ratio: '9:16',
      thumbnail_url: 'https://images.example.com/template-video-thumb.jpg',
      type: 'video',
      description: 'A guided product launch reel.',
      short_description: 'Product launch workflow.',
      preview_image_url: 'https://images.example.com/template-video-preview.jpg',
      active: true,
      trending: true,
      badge: 'Quick Start',
      inputs: [{ key: 'product', label: 'Product', type: 'text', required: true, placeholder: 'Product name' }],
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
        duration_seconds: 8,
        quality: 'standard',
        voice: 'Shubh',
        language: 'English',
      },
    },
    {
      id: 'tpl-image-1',
      name: 'Launch Poster',
      title: 'Launch Poster',
      category: 'quick_starts',
      aspect_ratio: '4:5',
      thumbnail_url: 'https://images.example.com/template-image-thumb.jpg',
      type: 'image',
      description: 'A guided launch poster workflow.',
      short_description: 'Campaign poster workflow.',
      preview_image_url: 'https://images.example.com/template-image-preview.jpg',
      active: true,
      trending: false,
      inputs: [{ key: 'headline', label: 'Headline', type: 'text', required: true, placeholder: 'Main headline' }],
      recommended_model: {
        mode: 'design',
        label: 'Recraft',
        description: 'Design-first image model.',
        internal_model_key: 'recraft',
      },
      generation_defaults: {
        model_key: 'recraft',
        aspect_ratio: '4:5',
        resolution: '1536',
      },
    },
  ]);

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/credits/wallet') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currentCredits: 55,
          monthlyCredits: 40,
          usedCredits: 5,
          planName: 'Free',
          lastReset: new Date().toISOString(),
        }),
      });
      return;
    }

    if (url.pathname === '/api/estimateCredits') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          estimatedCredits: 18,
          breakdown: [{ component: 'model_price', value: 18, label: 'Base generation' }],
          currentCredits: 55,
          remainingCredits: 37,
          sufficient: true,
          premium: false,
        }),
      });
      return;
    }

    if (url.pathname === '/api/templates') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: templateListBody,
      });
      return;
    }

    if (url.pathname === '/projects') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'project-1',
            user_id: mockUserId,
            title: 'Brand Campaign',
            script: 'Launch assets',
            language: 'English',
            voice: 'Shubh',
            template: 'tpl-video-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          },
        ]),
      });
      return;
    }

    if (url.pathname === '/api/templates/preview') {
      const body = route.request().postDataJSON() as { templateId: string };
      const isVideo = body.templateId === 'tpl-video-1';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          templateId: body.templateId,
          contentType: isVideo ? 'video' : 'image',
          title: isVideo ? 'Launch Reel' : 'Launch Poster',
          prompt: isVideo ? 'Create a launch reel for a skincare product.' : 'Create a launch poster for a skincare product.',
          videoPrompt: isVideo ? 'Hook with the product close-up, then reveal benefits and CTA.' : null,
          imagePrompt: isVideo ? null : 'Bold poster with clean product framing and premium typography.',
          scriptPreview: isVideo ? 'Scene 1: Product hero shot. Scene 2: Benefits. Scene 3: CTA.' : null,
          recommendedModel: isVideo
            ? { label: 'Kling 3.0', description: 'Stable creator workflow model.', internal_model_key: 'kling3' }
            : { label: 'Recraft', description: 'Design-first image model.', internal_model_key: 'recraft' },
          recommendedModelMode: isVideo ? 'creator_pro' : 'design',
        }),
      });
      return;
    }

    await route.continue();
  });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

test.describe('Templates smoke', () => {
  test('templates page redirects signed-out users to login', async ({ page }) => {
    await page.goto('/templates');
    await expect(page).toHaveURL(/\/login/);
  });

  test('templates page renders the authenticated template library', async ({ page }) => {
    await seedTemplatesSession(page);
    await mockTemplatesApis(page);

    await page.goto('/templates', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: /answer a few questions/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search by outcome or niche/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^video$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^image$/i })).toBeVisible();
    await expect(page.getByText(/launch reel/i).first()).toBeVisible();
    await expect(page.getByText(/launch poster/i).first()).toBeVisible();
  });

  test('templates page opens a template modal with guided preview content', async ({ page }) => {
    await seedTemplatesSession(page);
    await mockTemplatesApis(page);

    await page.goto('/templates', { waitUntil: 'domcontentloaded' });

    await page.getByText(/launch reel/i).first().click();

    await expect(page.getByRole('heading', { level: 3, name: /launch reel/i })).toBeVisible();
    await expect(page.getByText(/^guided workflow$/i)).toBeVisible();
    await expect(page.getByText(/template inputs/i)).toBeVisible();
    await expect(page.getByText(/generated prompt preview/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /generate from template/i })).toBeVisible();
  });
});
