import { test, expect, request, loginToken, injectAuth } from '../fixtures';

test.describe('08 管理与展示页面', () => {
  let token: string, user: any;

  test.beforeAll(async () => {
    const req = await request.newContext();
    ({ token, user } = await loginToken(req));
  });

  test('行为日志页可访问', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/admin/action-logs');
    await expect(page.locator('body')).toContainText(/行为日志|操作记录/, { timeout: 15000 });
  });

  test('周报提交管理页可访问', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/admin/reports');
    await expect(page.locator('body')).toContainText(/提交|科室/, { timeout: 15000 });
  });

  test('演示模式渲染', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await page.locator('button', { hasText: '演示' }).click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).toContainText(/演示|周报/, { timeout: 10000 });
  });
});
