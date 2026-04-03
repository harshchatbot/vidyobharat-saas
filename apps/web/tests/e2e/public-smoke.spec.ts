import { expect, test } from '@playwright/test';

test.describe('Public smoke', () => {
  test('landing page loads and links into the funnel', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: /create with rangmanch ai/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /start free/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /pricing/i }).first()).toBeVisible();
  });

  test('pricing page explains free credits and activation bonus', async ({ page }) => {
    await page.goto('/pricing');

    await expect(page.getByRole('heading', { level: 1, name: /simple credits for india-first creators and teams/i })).toBeVisible();
    await expect(page.getByText(/40 credits \/ month/i)).toBeVisible();
    await expect(page.getByText(/25-credit activation bonus/i)).toBeVisible();
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
