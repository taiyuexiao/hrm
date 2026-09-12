import {
  test, expect, request, loginToken, injectAuth,
  createTestWeek, cleanupTestWeek, TEST_WEEK,
} from '../fixtures';

/**
 * 回归 R1b：URL 参数（通知跳转/书签）指向已删除（回收站）周期时，
 * 不得选中该周期，也不得出现自动保存报错。
 */
test.describe('11 回收站周期的 URL 跳转', () => {
  let token: string, user: any;

  test.beforeAll(async () => {
    const req = await request.newContext();
    ({ token, user } = await loginToken(req));
    await createTestWeek(req, token);
  });

  test.afterAll(async () => {
    const req = await request.newContext();
    await cleanupTestWeek(req, token);
  });

  test('URL 指向有效周期：正常跳转选中', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto(`/?weekLabel=${TEST_WEEK}&dept=${encodeURIComponent('综合管理部')}`);
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.ant-select-selection-item').first()).toHaveText('2026-09-04');
  });

  test('URL 指向回收站周期：不得选中、无报错', async ({ page }) => {
    // 删除测试周期（进回收站）
    const req = await request.newContext();
    await req.delete(`${(await import('../fixtures')).API}/reports/${TEST_WEEK}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await injectAuth(page, token, user);
    await page.goto(`/?weekLabel=${TEST_WEEK}&dept=${encodeURIComponent('综合管理部')}`);
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });

    const selected = await page.locator('.ant-select-selection-item').first().textContent();
    expect(selected).not.toBe('2026-09-04');

    await page.waitForTimeout(2500);
    const msg = await page.locator('.ant-message').textContent().catch(() => '');
    expect(msg || '').not.toContain('回收站');
  });
});
