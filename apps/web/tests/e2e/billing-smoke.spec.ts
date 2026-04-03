import { expect, test } from '@playwright/test';

const mockUserId = 'playwright-user';
const pricingPayload = {
  region: 'south_asia',
  country: 'IN',
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
    { feature: 'Image generate', cost: 3 },
    { feature: 'Video generate', cost: 18 },
  ],
};

async function seedBillingSession(page: Parameters<typeof test>[0]['page']) {
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

test.describe.configure({ mode: 'serial' });

test.describe('Billing smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/pricing', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pricingPayload),
      });
    });
  });

  test('pricing can move a user into billing with a selected plan', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /choose creator/i })).toBeVisible();
    await page.getByRole('button', { name: /choose creator/i }).click();
    await expect(page).toHaveURL(/\/billing\?plan=creator/);
  });

  test('billing asks signed-out users to sign in', async ({ page }) => {
    await page.goto('/billing', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: /billing and credits/i })).toBeVisible();
    await expect(page.getByText(/please sign in to view your wallet and continue to checkout/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /view plans/i })).toBeVisible();
  });

  test('billing shows wallet and history shell for a signed-in user', async ({ page }) => {
    await seedBillingSession(page);

    await page.route(`**/api/credits/${mockUserId}`, async (route) => {
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

    await page.route(`**/api/creditHistory?limit=8`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 101,
              featureName: 'Monthly credit refill',
              creditsUsed: 40,
              remainingBalance: 65,
              transactionType: 'credit',
              source: 'reset',
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto('/billing?plan=creator', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: /billing and credits/i })).toBeVisible();
    await expect(page.getByText(/current balance/i)).toBeVisible();
    await expect(page.getByText('65').first()).toBeVisible();
    await expect(page.getByText(/monthly refill/i)).toBeVisible();
    await expect(page.getByText(/used this cycle/i)).toBeVisible();
    await expect(page.getByText(/currency: inr · secure checkout: razorpay/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /selected plan/i })).toBeVisible();
    await expect(page.getByText(/monthly credit refill/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /top up creator/i })).toBeVisible();
  });
});
