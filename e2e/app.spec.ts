import { test, expect } from '@playwright/test';

test.describe('Application Visual Tests', () => {
  test('should have parking favicon', async ({ page }) => {
    await page.goto('/');

    // Check for favicon link
    const favicon = await page.locator('link[rel="icon"]').first();
    await expect(favicon).toHaveAttribute('href', /parking\.svg/);
  });

  test('should display app title', async ({ page }) => {
    await page.goto('/');

    // Unauthenticated users land on /auth — title is in a CardTitle
    await expect(page.getByText('Park It Easy')).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('/');

    // Page should still be visible and functional
    await expect(page.getByText('Park It Easy')).toBeVisible();
  });

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/');

    // Page should still be visible and functional
    await expect(page.getByText('Park It Easy')).toBeVisible();
  });

  test('should be responsive on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // Page should still be visible and functional
    await expect(page.getByText('Park It Easy')).toBeVisible();
  });
});

test.describe('Meta Tags and SEO', () => {
  test('should have correct meta description', async ({ page }) => {
    await page.goto('/');

    // Check meta description
    const metaDescription = await page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /Easy parking spot management/i);
  });

  test('should have author meta tag', async ({ page }) => {
    await page.goto('/');

    // Check author tag
    const metaAuthor = await page.locator('meta[name="author"]');
    await expect(metaAuthor).toHaveAttribute('content', 'Lufthansa Technik');
  });
});
