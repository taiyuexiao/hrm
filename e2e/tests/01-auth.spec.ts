import { test, expect, API, ACCOUNT, request } from '../fixtures';

test.describe('01 登录与权限', () => {
  test('登录页渲染', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[placeholder="用户名"]')).toBeVisible();
    await expect(page.locator('input[placeholder="密码"]')).toBeVisible();
  });

  test('错误密码返回明确提示', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[placeholder="用户名"]', ACCOUNT.username);
    await page.fill('input[placeholder="密码"]', 'wrong-password');
    await page.locator('button', { hasText: /登\s*录/ }).click();
    await expect(page.locator('.ant-message')).toContainText(/密码错误|失败/, { timeout: 8000 });
  });

  test('正确登录进入工作台', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[placeholder="用户名"]', ACCOUNT.username);
    await page.fill('input[placeholder="密码"]', ACCOUNT.password);
    await page.locator('button', { hasText: /登\s*录/ }).click();
    // SPA 不跳转路由，等待登录态写入 + 工作台渲染
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    const token = await page.evaluate(() => localStorage.getItem('auth-token'));
    expect(token).toBeTruthy();
  });

  test('管理员菜单：无回收站/建议箱（超管专属）', async ({ page }) => {
    const req = await request.newContext();
    const { loginToken, injectAuth } = await import('../fixtures');
    const { token, user } = await loginToken(req);
    await injectAuth(page, token, user);
    await page.goto('/');
    const menu = page.locator('.ant-menu');
    await expect(menu).toContainText('周报管理');
    await expect(menu).not.toContainText('回收站');
    await expect(menu).not.toContainText('建议箱');
  });
});
