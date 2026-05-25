import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

const CATEGORIES = [
  { id: 'ugc_testimonial', label: 'UGC Testimonial', requiresAvatar: false, requiresProductImage: true },
  { id: 'founder_talking_head', label: 'Founder Talking Head', requiresAvatar: true, requiresProductImage: true },
  { id: 'problem_solution', label: 'Problem-Solution', requiresAvatar: false, requiresProductImage: false },
  { id: 'product_demo_lifestyle', label: 'Product Demo & Lifestyle', requiresAvatar: false, requiresProductImage: true },
  { id: 'inner_monologue', label: 'Inner Monologue', requiresAvatar: true, requiresProductImage: true },
  { id: 'cinematic_narration', label: 'Cinematic Narration', requiresAvatar: false, requiresProductImage: false },
  { id: 'cinematic_broll', label: 'Cinematic B-Roll', requiresAvatar: false, requiresProductImage: false },
] as const;

test.describe('Story-Ad category matrix (mock, no-credit)', () => {
  for (const category of CATEGORIES) {
    test(`initializes correctly for ${category.id}`, async ({ page }) => {
      const userId = `playwright-category-${category.id}`;
      const now = new Date().toISOString();
      const projectId = `proj-${category.id}`;
      let initializePayload: Record<string, unknown> | null = null;

      await page.addInitScript((uid) => {
        window.localStorage.setItem('test-user-id', uid);
        window.sessionStorage.setItem('testMode', 'mock');
      }, userId);

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
                sourceLabel: 'Public',
              },
            ],
            user_avatars: [],
            avatars: [],
          }),
        });
      });

      await page.route('**/uploads/direct', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            asset_id: `asset-${category.id}`,
            upload_url: 'https://uploads.example.com/mock',
            public_url: `https://images.example.com/${category.id}-product.jpg`,
            method: 'POST',
            headers: {},
          }),
        });
      });

      await page.route('**/api/storyboard/initialize', async (route) => {
        initializePayload = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            project_id: projectId,
            workflow_state: 'initialized',
            ad_category: category.id,
            created_at: now,
          }),
        });
      });

      await page.route('**/api/storyboard/*', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            project: {
              id: projectId,
              user_id: userId,
              ad_category: category.id,
              workflow_state: 'initialized',
              target_ad_duration_seconds: 15,
              selected_duration_label: '15s',
              created_at: now,
              updated_at: now,
            },
          }),
        });
      });

      await page.goto('/story-ad?step=category');
      await expect(page.getByText(/Storyboard Ad Creator/i)).toBeVisible({ timeout: 15000 });

      await page.getByRole('button', { name: new RegExp(category.label, 'i') }).first().click();

      if (category.requiresAvatar) {
        await page.getByRole('button', { name: /create with avatar/i }).first().click();
        await expect(page.getByRole('heading', { name: /choose your spokesperson/i })).toBeVisible({ timeout: 12000 });
        await expect(page.getByText(/Chitrakala/i).first()).toBeVisible({ timeout: 12000 });

        const avatarCard = page
          .locator('div.rounded-\[20px\].border.p-3')
          .filter({ hasText: /Chitrakala/i })
          .first();

        const useInCard = avatarCard.getByRole('button', { name: /^Use$/i });
        if (await useInCard.isVisible().catch(() => false)) {
          await useInCard.click();
        } else {
          await page.getByRole('button', { name: /^Use$/i }).first().click();
        }
      } else {
        await page.getByRole('button', { name: /create as storyboard/i }).first().click();
      }

      await expect(page.getByRole('heading', { name: /Choose Your Platform/i })).toBeVisible({ timeout: 12000 });
      await page.getByRole('button', { name: /continue to brief/i }).first().click();

      await expect(page.getByRole('heading', { name: /Tell Us About Your Business/i })).toBeVisible({ timeout: 12000 });
      await page.locator('textarea').first().fill(`Mock brief for ${category.label} category with enough detail`);

      if (category.requiresProductImage) {
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.setInputFiles({
          name: `${category.id}.png`,
          mimeType: 'image/png',
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2BvlsAAAAASUVORK5CYII=', 'base64'),
        });
        await expect(page.getByAltText(/Product reference/i)).toBeVisible({ timeout: 10000 });
      }

      await page.getByRole('button', { name: /Review & Generate/i }).first().click();
      await expect(page.getByRole('heading', { name: /Review & Generate Your Ad/i })).toBeVisible({ timeout: 12000 });

      await page.getByRole('checkbox').first().check();
      await page.getByRole('button', { name: /Generate My Ad/i }).first().click();

      await expect.poll(() => initializePayload, { timeout: 12000 }).not.toBeNull();
      // eslint-disable-next-line no-console
      console.log(`CATEGORY_PAYLOAD ${category.id}: ${JSON.stringify(initializePayload)}`);
      expect(initializePayload?.ad_category).toBe(category.id);
      expect(initializePayload?.target_ad_duration_seconds).toBe(15);

      if (category.requiresAvatar) {
        expect(initializePayload?.creation_mode).toBe('avatar');
      } else {
        expect(initializePayload?.creation_mode).toBe('storyboard');
      }

      if (category.requiresProductImage) {
        expect(initializePayload?.product_image_url).toBeTruthy();
      }
    });
  }
});
