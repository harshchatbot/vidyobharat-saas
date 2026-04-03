import { expect, test } from '@playwright/test';

test.describe('Public smoke', () => {
  test('landing page loads and links into the funnel', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: /create with rangmanch ai/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /start free/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /pricing/i }).first()).toBeVisible();
  });

  test('pricing page explains free credits and activation bonus', async ({ page }) => {
    await page.route('**/api/pricing**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currency: 'INR',
          paymentProvider: 'razorpay',
          plans: {
            starter: 499,
            creator: 1499,
            growth: 2999,
            pro: 5999,
          },
          creditAllocation: {
            starter: 200,
            creator: 650,
            growth: 1400,
            pro: 3000,
          },
          actionCosts: [
            { feature: 'Gemini Flash image', cost: 5 },
            { feature: 'Kling 3.0 draft clip', cost: 5 },
          ],
        }),
      });
    });

    await page.goto('/pricing');

    await expect(page.getByRole('heading', { level: 1, name: /simple credits for india-first creators and teams/i })).toBeVisible();
    await expect(page.getByText(/40 credits \/ month/i)).toBeVisible();
    await expect(page.getByText(/25-credit activation bonus/i).first()).toBeVisible();
  });

  test('login page renders the auth form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { level: 1, name: /welcome back/i })).toBeVisible();
    await expect(page.getByPlaceholder(/you@domain\.com/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  });

  test('signup page renders the account creation form', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByRole('heading', { level: 1, name: /create your account/i })).toBeVisible();
    await expect(page.getByPlaceholder(/full name/i)).toBeVisible();
    await expect(page.getByPlaceholder(/work email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });
});
