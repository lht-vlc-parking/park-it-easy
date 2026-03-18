import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should load the authentication page with app title', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Park It Easy' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should show login and sign-up tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Login')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Sign Up')).toBeVisible();
  });

  test('should show sign-up form fields', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByText('Sign Up').click();

    await expect(page.locator('#signup-name')).toBeVisible();
    await expect(page.locator('#signup-email')).toBeVisible();
    await expect(page.locator('#signup-password')).toBeVisible();
  });

  test('should show email validation error for invalid domain', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByText('Sign Up').click();

    await page.fill('#signup-name', 'Test User');
    await page.fill('#signup-email', 'test@gmail.com');
    await page.fill('#signup-password', 'TestPassword123!');

    await page.getByRole('button', { name: 'Sign Up' }).click();

    await expect(page.getByText(/@lht\.dlh\.de/).first()).toBeVisible({ timeout: 5000 });
  });

  test('should show reset tab with email field', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByText('Reset').click();

    await expect(page.locator('#reset-email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeVisible();
  });
});
