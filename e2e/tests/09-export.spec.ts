import { test, expect, request, loginToken, injectAuth, selectWeek } from '../fixtures';

test.describe('09 导出', () => {
  test('导出当前周 Excel', async ({ page }) => {
    const req = await request.newContext();
    const { token, user } = await loginToken(req);
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await selectWeek(page, '2026-08-14');  // 选一个有数据的周期

    // 「导出」是下拉菜单：选择「导出当前周期所有科室周报」
    await page.locator('button', { hasText: /^导\s*出$/ }).click();
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.locator('.ant-dropdown-menu-item', { hasText: '导出当前周期所有科室周报' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
