import { expect, test } from '@playwright/test';

test('application shell responds without a server error', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});
