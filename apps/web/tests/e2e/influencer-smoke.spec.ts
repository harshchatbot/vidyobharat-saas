import { expect, test, type Page } from '@playwright/test';

const mockUserId = 'playwright-user';

async function seedInfluencerSession(page: Page) {
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

async function mockInfluencerApis(page: Page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/credits/wallet') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currentCredits: 72,
          monthlyCredits: 40,
          usedCredits: 9,
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
          estimatedCredits: 6,
          breakdown: [{ component: 'base', value: 6, label: 'Base generation' }],
          currentCredits: 72,
          remainingCredits: 66,
          sufficient: true,
          premium: false,
        }),
      });
      return;
    }

    if (url.pathname === '/api/influencer/personas') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'persona-1',
            user_id: mockUserId,
            name: 'Aarohi Blaze',
            gender_identity: 'Female',
            niche: 'Fashion creator',
            tone: 'Bold',
            catchphrase: 'Show up iconic.',
            personality_traits: ['Confident', 'Luxury'],
            backstory: 'A fashion-first digital creator with a polished luxury aesthetic.',
            visual_description: 'Sharp editorial features, long dark hair, luxury creator styling.',
            reference_image_url: 'https://images.example.com/influencer-reference.jpg',
            character_locked: true,
            style_embedding: 'style-1',
            reference_embedding: 'ref-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
      return;
    }

    if (url.pathname === '/api/influencer/poses') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { key: 'standing_confident', label: 'Standing confident', description: 'A poised hero pose.' },
          { key: 'walking_editorial', label: 'Walking editorial', description: 'Editorial runway motion.' },
        ]),
      });
      return;
    }

    if (url.pathname === '/api/influencer/scenes') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key: 'luxury_office',
            label: 'Luxury office',
            description: 'Glossy office setup with premium textures.',
            environment: 'High-rise office',
            lighting: 'Soft daylight',
            mood: 'Confident and premium',
            props: ['desk', 'glass wall'],
            is_system: true,
          },
          {
            key: 'studio_editorial',
            label: 'Studio editorial',
            description: 'Clean editorial studio with strong fashion cues.',
            environment: 'Editorial studio',
            lighting: 'Controlled studio lighting',
            mood: 'Polished',
            props: ['seamless backdrop'],
            is_system: true,
          },
        ]),
      });
      return;
    }

    if (url.pathname === '/ai/image/models') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key: 'gemini_flash_image',
            label: 'Gemini 3.1 Flash Image',
            description: 'Fast creator image generation.',
            frontend_hint: 'Best for frequent iterations.',
            provider: 'Google',
            badge: 'Affordable',
            logo_label: 'G',
            mode_ids: ['creator'],
            billing_unit: 'per_image',
          },
          {
            key: 'recraft_studio',
            label: 'Recraft Studio',
            description: 'Design-forward image generation.',
            frontend_hint: 'Great for brand-led visuals.',
            provider: 'Recraft',
            badge: 'Design',
            logo_label: 'R',
            mode_ids: ['creator'],
            billing_unit: 'per_image',
          },
        ]),
      });
      return;
    }

    await route.continue();
  });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

test.describe('Influencer studio smoke', () => {
  test('influencer page redirects signed-out users to login', async ({ page }) => {
    await page.goto('/influencer');
    await expect(page).toHaveURL(/\/login/);
  });

  test('influencer page renders the guided studio shell for a signed-in user', async ({ page }) => {
    await seedInfluencerSession(page);
    await mockInfluencerApis(page);

    await page.goto('/influencer', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/create the character, upload one reference, shape the content, then render/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /1 create character/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /2 reference/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /3 content/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /4 generate visual/i })).toBeVisible();
    await expect(page.getByText(/^1\. Create Character$/i)).toBeVisible();
    await expect(page.getByText(/aarohi blaze/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /show advanced/i })).toBeVisible();
  });

  test('influencer page shows the summary rail content for the selected persona', async ({ page }) => {
    await seedInfluencerSession(page);
    await mockInfluencerApis(page);

    await page.goto('/influencer', { waitUntil: 'domcontentloaded' });

    const summaryToggle = page.getByRole('button', { name: /summary/i });
    if (await summaryToggle.isVisible().catch(() => false)) {
      await summaryToggle.click();
    }

    await expect(page.getByText(/aarohi blaze/i).first()).toBeVisible();
    await expect(page.getByText(/character, scene, and output overview/i)).toBeVisible();
    await expect(page.getByText(/scene:\s*luxury office/i)).toBeVisible();
    await expect(page.getByText(/current scene preset/i)).toBeVisible();
    await expect(page.getByText(/glossy office setup with premium textures/i).first()).toBeVisible();
  });
});
