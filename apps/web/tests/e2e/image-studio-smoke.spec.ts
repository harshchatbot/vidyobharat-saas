import { expect, test, type Page } from '@playwright/test';

const mockUserId = 'playwright-user';

async function seedImageStudioSession(page: Page) {
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

async function mockImageStudioApis(page: Page) {
  await page.route('**/api/credits/wallet**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentCredits: 65,
        monthlyCredits: 40,
        usedCredits: 12,
        planName: 'Free',
        lastReset: new Date().toISOString(),
      }),
    });
  });

  await page.route('**/api/estimateCredits', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        estimatedCredits: 3,
        breakdown: [
          { component: 'base', value: 1, label: 'Base generation' },
          { component: 'model_multiplier', value: 2, label: 'Model quality' },
        ],
        currentCredits: 65,
        remainingCredits: 62,
        sufficient: true,
        premium: false,
      }),
    });
  });

  await page.route('**/ai/image/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          key: 'budget_image_model',
          label: 'Fast Social Images',
          description: 'Budget-friendly image generation for quick social content and rapid iteration.',
          frontend_hint: 'Primary fast lane.',
          provider: 'Together',
          badge: 'Affordable',
          logo_label: 'T',
          provider_id: 'together',
          canonical_model_key: 'budget_image_model',
          mode_ids: ['fast_social'],
          billing_unit: 'per_image',
        },
        {
          key: 'gpt_image_1_5',
          label: 'GPT Image 1.5',
          description: 'Premium realistic image generation with strong prompt fidelity.',
          frontend_hint: 'Best for polished brand visuals.',
          provider: 'OpenAI',
          badge: 'Recommended',
          logo_label: 'O',
          provider_id: 'openai',
          canonical_model_key: 'gpt_image_1_5',
          mode_ids: ['creator_quality'],
          billing_unit: 'per_image',
        },
        {
          key: 'recraft',
          label: 'Recraft',
          description: 'Design-focused image generation for posters and structured graphics.',
          frontend_hint: 'Best for graphics and layouts.',
          provider: 'Recraft',
          badge: 'Design',
          logo_label: 'R',
          provider_id: 'recraft',
          canonical_model_key: 'recraft',
          mode_ids: ['design_carousel'],
          billing_unit: 'per_image',
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
          id: 'tpl-image-1',
          name: 'Launch Poster',
          category: 'Ads',
          description: 'A crisp launch poster for product announcements.',
          short_description: 'Clean product launch visual.',
          prompt_template: 'Design a launch poster for {product}.',
          aspect_ratio: '4:5',
          preview_image_url: 'https://images.example.com/template-launch.jpg',
          thumbnail_url: 'https://images.example.com/template-launch-thumb.jpg',
          visual_prompt: 'Premium ad layout with bold typography.',
          inputs: [{ key: 'product', label: 'Product', type: 'text', placeholder: 'Product name' }],
          generation_defaults: {
            aspect_ratio: '4:5',
            resolution: '1536',
            model_key: 'recraft',
          },
        },
        {
          id: 'tpl-image-2',
          name: 'Creator Thumbnail',
          category: 'Social',
          description: 'A high-energy creator thumbnail.',
          short_description: 'YouTube-ready creator art.',
          prompt_template: 'Create a creator thumbnail for {topic}.',
          aspect_ratio: '16:9',
          preview_image_url: 'https://images.example.com/template-thumb.jpg',
          thumbnail_url: 'https://images.example.com/template-thumb-small.jpg',
          visual_prompt: 'High contrast with title-safe space.',
          inputs: [{ key: 'topic', label: 'Topic', type: 'text', placeholder: 'Topic' }],
          generation_defaults: {
            aspect_ratio: '16:9',
            resolution: '1536',
            model_key: 'gpt_image_1_5',
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
          script: 'Launch visuals for summer collection',
          language: 'English',
          voice: 'Asha',
          template: 'tpl-image-1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          asset_count: 2,
          image_count: 1,
          video_count: 1,
          last_activity_at: new Date().toISOString(),
        },
      ]),
    });
  });

  await page.route('**/ai/images/inspiration**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'insp-1',
          creator_name: 'RangManch',
          model_key: 'gpt_image_1_5',
          title: 'Monsoon Streetwear',
          prompt: 'Editorial streetwear portrait in monsoon lighting.',
          image_url: 'https://images.example.com/inspiration-1.jpg',
          aspect_ratio: '4:5',
          resolution: '1536',
          created_at: new Date().toISOString(),
          reference_urls: [],
          tags: ['fashion', 'editorial'],
          like_count: 12,
          liked_by_user: false,
          moderation_status: 'approved',
        },
      ]),
    });
  });

  await page.route('**/ai/images?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'img-1',
          parent_image_id: null,
          project_id: 'project-1',
          mode_id: 'fast_social',
          template_id: 'tpl-image-1',
          model_key: 'budget_image_model',
          prompt: 'Bright skincare product shot on a marble table.',
          aspect_ratio: '4:5',
          resolution: '1536',
          reference_urls: [],
          image_url: 'https://images.example.com/generated-1.jpg',
          thumbnail_url: 'https://images.example.com/generated-1-thumb.jpg',
          action_type: null,
          status: 'completed',
          is_public_inspiration: false,
          moderation_status: 'approved',
          inspiration_score: 0,
          like_count: 0,
          auto_tags: ['product', 'luxury'],
          user_tags: ['campaign'],
          applied_credits: 3,
          remaining_credits: 62,
          created_at: new Date().toISOString(),
        },
      ]),
    });
  });

  await page.route('**/assets/tags?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { tag: 'product', count: 1 },
        { tag: 'campaign', count: 1 },
      ]),
    });
  });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

test.describe('Image studio smoke', () => {
  test('images page redirects signed-out users to login', async ({ page }) => {
    await page.goto('/images');
    await expect(page).toHaveURL(/\/login/);
  });

  test('images page renders the main studio shell for a signed-in user', async ({ page }) => {
    await seedImageStudioSession(page);
    await mockImageStudioApis(page);

    await page.goto('/images', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: /generate images in one focused workspace/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /browse templates/i }).first()).toBeVisible();
    await expect(page.getByText(/^create image$/i)).toBeVisible();
    await expect(page.getByText(/^template$/i)).toBeVisible();
    await expect(page.getByText(/^project$/i)).toBeVisible();
    await expect(page.getByText(/^model$/i).first()).toBeVisible();
    await expect(page.getByText(/^orientation & output$/i)).toBeVisible();
    await expect(page.getByText(/^prompt$/i)).toBeVisible();
    await expect(page.getByText(/^references$/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /review and export/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /studio feed/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /your images/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^inspiration$/i })).toBeVisible();
  });

  test('images page exposes the studio feed tabs for signed-in users', async ({ page }) => {
    await seedImageStudioSession(page);
    await mockImageStudioApis(page);

    await page.goto('/images', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /^inspiration$/i }).click();
    await expect(page.getByRole('button', { name: /your images/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^inspiration$/i })).toBeVisible();
  });
});
