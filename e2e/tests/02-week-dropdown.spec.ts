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
    // 虚拟滚动：DOM 中只渲染可视区选项，逐项可达性用搜索验证
    await expect(page.locator('.ant-select-item-option').first()).toBeVisible({ timeout: 8000 });
    expect(await page.locator('.ant-select-item-option').count()).toBeGreaterThan(0);
    // 历史周可搜到（2026-08-14 为本地库中已存在的周期）
    await page.keyboard.type('2026-08-14');
    await expect(page.locator('.ant-select-item-option', { hasText: '2026-08-14' })).toHaveCount(1);
    await page.keyboard.press('Escape');

    // 当前周始终存在（重开下拉清空搜索后查找）
    const current = await selectedWeek(page);
    await sel.dispatchEvent('mousedown');
    await page.keyboard.type(current || '');
    await expect(page.locator('.ant-select-item-option', { hasText: current || '' })).toHaveCount(1);
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
