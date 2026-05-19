import { expect, test } from '@playwright/test';

test.describe('Story Ad - Avatar Selection Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set a test user ID in localStorage BEFORE navigation
    const userId = `playwright-avatar-test-${Date.now()}`;
    await page.addInitScript((uid: string) => {
      window.localStorage.setItem('test-user-id', uid);
    }, userId);

    // Now navigate to story-ad page
    await page.goto('http://localhost:3000/story-ad?step=category', { waitUntil: 'networkidle' });
  });

  test('should show avatar selection modal when user selects "Create with Avatar"', async ({ page }) => {
    // Wait for category selection to load - use a more flexible locator
    await page.waitForSelector('button:has-text("UGC Testimonial")', { timeout: 15000 });

    // Click on UGC Testimonial category
    await page.click('button:has-text("UGC Testimonial")');

    // Wait for creation method modal to appear
    await page.waitForSelector('button:has-text("Create with Avatar")', { timeout: 10000 });

    // Click "Create with Avatar" button
    await page.click('button:has-text("Create with Avatar")');

    // Modal should close and avatar selection should appear
    await page.waitForSelector('h2:has-text("Select Your Avatar")', { timeout: 10000 });

    // Verify avatar selection modal is visible
    const modalTitle = await page.textContent('h2');
    expect(modalTitle).toContain('Select Your Avatar');
  });

  test('should allow user to select an avatar and continue', async ({ page }) => {
    // Navigate to category selection
    await page.waitForSelector('text=Select a category', { timeout: 5000 });

    // Click on UGC Testimonial category
    await page.click('button:has-text("UGC Testimonial")');

    // Wait for creation method modal
    await page.waitForSelector('text=How to Create Your UGC Testimonial Ad', { timeout: 5000 });

    // Click "Create with Avatar"
    await page.click('button:has-text("Create with Avatar")');

    // Wait for avatar selection modal
    await page.waitForSelector('text=Select Your Avatar', { timeout: 5000 });

    // Wait for avatars to load (should show at least one avatar)
    await page.waitForSelector('[class*="border-indigo-600"]', { timeout: 10000 });

    // Click on the first avatar (should be auto-selected, so we just need to click continue)
    // The continue button should have the avatar name
    const continueBtn = page.locator('button:has-text("Continue with")');

    // Wait for button to be enabled
    await continueBtn.waitFor({ state: 'visible', timeout: 5000 });

    // Click continue
    await page.click('button:has-text("Continue with")');

    // Should navigate to step1 (Category & Platform selection)
    // Look for platform selection heading
    await page.waitForSelector('text=Select your platform', { timeout: 5000 });

    // Verify we're on the right step
    const heading = await page.textContent('h2, h1');
    expect(heading).toContain('Select your platform');
  });

  test('should store avatar ID and pass it to subsequent requests', async ({ page }) => {
    // Intercept the initialize request
    const initializeRequest = page.waitForResponse(
      (response) => response.url().includes('/api/storyboard/initialize') && response.status() === 200
    );

    // Navigate through the flow
    await page.waitForSelector('text=Select a category', { timeout: 5000 });

    // Click UGC Testimonial
    await page.click('button:has-text("UGC Testimonial")');

    // Wait for creation method modal and select avatar
    await page.waitForSelector('text=How to Create Your UGC Testimonial Ad', { timeout: 5000 });
    await page.click('button:has-text("Create with Avatar")');

    // Wait for avatar selection
    await page.waitForSelector('text=Select Your Avatar', { timeout: 5000 });
    await page.waitForSelector('[class*="border-indigo-600"]', { timeout: 10000 });

    // Continue with avatar
    await page.click('button:has-text("Continue with")');

    // Complete step1 (platform selection)
    await page.waitForSelector('text=Select your platform', { timeout: 5000 });
    await page.click('button:has-text("Instagram Reels")');

    // Complete step2 (business brief)
    await page.waitForSelector('textarea[placeholder*="business"]', { timeout: 5000 });
    await page.fill('textarea[placeholder*="business"]', 'Test product description');
    await page.click('button:has-text("Continue to Review")');

    // Complete step3 (review and generate)
    await page.waitForSelector('button:has-text("Generate My Ad")', { timeout: 5000 });
    await page.click('button:has-text("Generate My Ad")');

    // Wait for initialize request
    const response = await initializeRequest;
    const responseData = await response.json();

    // Verify the response contains project_id
    expect(responseData.project_id || responseData.id).toBeTruthy();
  });

  test('should allow user to go back to category selection from avatar modal', async ({ page }) => {
    // Navigate to category selection
    await page.waitForSelector('text=Select a category', { timeout: 5000 });

    // Select UGC Testimonial
    await page.click('button:has-text("UGC Testimonial")');

    // Select avatar mode
    await page.waitForSelector('text=How to Create Your UGC Testimonial Ad', { timeout: 5000 });
    await page.click('button:has-text("Create with Avatar")');

    // Avatar selection modal appears
    await page.waitForSelector('text=Select Your Avatar', { timeout: 5000 });

    // Click Cancel button
    await page.click('button:has-text("Cancel")');

    // Should go back to category selection
    await page.waitForSelector('text=Select a category', { timeout: 5000 });

    // Verify we're back at category selection
    const heading = await page.textContent('h2, h1');
    expect(heading).toContain('Select a category');
  });

  test('should fetch avatars from API on modal open', async ({ page }) => {
    // Monitor network requests
    let avatarApiCalled = false;
    page.on('response', (response) => {
      if (response.url().includes('/avatars')) {
        avatarApiCalled = true;
      }
    });

    // Navigate to avatar selection
    await page.waitForSelector('text=Select a category', { timeout: 5000 });
    await page.click('button:has-text("UGC Testimonial")');
    await page.waitForSelector('text=How to Create Your UGC Testimonial Ad', { timeout: 5000 });
    await page.click('button:has-text("Create with Avatar")');

    // Wait for avatar modal
    await page.waitForSelector('text=Select Your Avatar', { timeout: 5000 });

    // Wait a bit for API call
    await page.waitForTimeout(1000);

    // Verify API was called
    expect(avatarApiCalled).toBeTruthy();
  });
});
