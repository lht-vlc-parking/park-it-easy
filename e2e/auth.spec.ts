import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should load the authentication page', async ({ page }) => {
    await page.goto('/');
    
    // Should see the login page
    await expect(page.locator('h1')).toContainText('Park it easy office');
    await expect(page.getByText('Login')).toBeVisible();
    await expect(page.getByText('Sign Up')).toBeVisible();
  });

  test('should show email validation error for invalid domain', async ({ page }) => {
    await page.goto('/');
    
    // Click on Sign Up tab
    await page.getByText('Sign Up').click();
    
    // Fill in the form with invalid email
    await page.fill('input[type="email"]', 'test@gmail.com');
    await page.fill('input[type="text"]', 'Test User');
    await page.fill('input[type="password"]', 'TestPassword123');
    
    // Try to submit
    await page.getByRole('button', { name: 'Create Account' }).click();
    
    // Should see validation error
    await expect(page.getByText(/must be a.*@lht.dlh.de email/i)).toBeVisible();
  });

  test('should accept valid LHT email domain', async ({ page }) => {
    await page.goto('/');
    
    // Click on Sign Up tab
    await page.getByText('Sign Up').click();
    
    // Fill in the form with valid email
    const testEmail = `test${Date.now()}@lht.dlh.de`;
    await page.fill('input[type="email"]', testEmail);
    
    // Should not show domain validation error immediately
    await expect(page.getByText(/must be a.*@lht.dlh.de email/i)).not.toBeVisible();
  });

  test('should have password reset functionality', async ({ page }) => {
    await page.goto('/');
    
    // Click on Reset Password tab
    await page.getByText('Reset Password').click();
    
    // Should see reset password form
    await expect(page.getByText('Enter your email')).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });
});
