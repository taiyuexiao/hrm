import { test, expect, loginToken, injectAuth, selectWeek, selectedWeek, request, API } from '../fixtures';

test.describe('02 周下拉框', () => {
  test('周期选项完整加载（含历史固化周与当前周）', async ({ page }) => {
    const req = await request.newContext();
    const { token, user } = await loginToken(req);
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });

    const sel = page.locator('.ant-select .ant-select-selector').first();
    await sel.dispatchEvent('mousedown');
    const options = page.locator('.custom-week-option');
    await expect(options.first()).toBeVisible({ timeout: 8000 });
    const count = await options.count();
    expect(count).toBeGreaterThan(10); // 19+ 个周期
    // 当前周始终存在
    const texts = await options.allTextContents();
    const current = await selectedWeek(page);
    expect(texts.join('')).toContain(current || '');
    await page.keyboard.press('Escape');
  });

  test('切换周', async ({ page }) => {
    const req = await request.newContext();
    const { token, user } = await loginToken(req);
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await selectWeek(page, '2026-08-14');
    expect(await selectedWeek(page)).toBe('2026-08-14');
  });
});
