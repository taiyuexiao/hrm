import {
  test, expect, request, loginToken, injectAuth, selectWeek,
  createTestWeek, cleanupTestWeek, setReactInput, expectMessage,
  TEST_WEEK, API,
} from '../fixtures';

test.describe('06 周期管理与回收站', () => {
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

  test('删除周期：进入回收站，下拉框消失', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await selectWeek(page, '2026-09-04');

    // 下拉框中点 ✕
    const sel = page.locator('.ant-select .ant-select-selector').first();
    await sel.dispatchEvent('mousedown');
    const opt = page.locator('.custom-week-option', { hasText: '2026-09-04' }).first();
    await opt.locator('.anticon-close').evaluate((el: HTMLElement) => el.click());

    // 确认弹窗（文案：进回收站，可恢复）
    const confirm = page.locator('.ant-modal:visible', { hasText: '确认删除周报周期' });
    await expect(confirm).toContainText('回收站');
    await confirm.locator('button', { hasText: /^删\s*除$/ }).click();
    await expectMessage(page, '已移入回收站');

    // 下拉框中该周期消失
    await sel.dispatchEvent('mousedown');
    await page.waitForTimeout(500);
    const texts = await page.locator('.custom-week-option').allTextContents();
    expect(texts.join('')).not.toContain('2026-09-04');
    await page.keyboard.press('Escape');
  });

  test('重建被删周期：提示去回收站恢复', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });

    await page.locator('button', { hasText: '新建下周报' }).click();
    const modal = page.locator('.ant-modal:visible', { hasText: '新建周报' });
    await expect(modal).toBeVisible();

    // 设置日期 2026-09-04 / 20:00
    await modal.locator('input[placeholder="选择截止日期"]').fill('2026-09-04');
    await modal.locator('input[placeholder="选择截止日期"]').press('Enter');
    await modal.locator('input[placeholder="选择截止时间"]').fill('20:00');
    await modal.locator('input[placeholder="选择截止时间"]').press('Enter');
    await modal.locator('button', { hasText: /创\s*建/ }).click();

    await expectMessage(page, '在回收站中');
  });

  test('回收站恢复（需超管密码，未配置则跳过）', async ({ page }) => {
    const superPwd = process.env.E2E_SUPER_PASSWORD;
    test.skip(!superPwd, '未设置 E2E_SUPER_PASSWORD 环境变量，跳过超管用例');

    const req = await request.newContext();
    const { token: saToken, user: saUser } = await loginToken(req, '33528', superPwd!);
    await injectAuth(page, saToken, saUser);
    await page.goto('/');

    // 左侧菜单进入回收站
    await page.locator('.ant-menu a', { hasText: '回收站' }).click();
    await expect(page.locator('.ant-card', { hasText: '回收站' })).toBeVisible();

    // 找到测试周期并一键恢复
    const item = page.locator('.ant-list-item', { hasText: '2026-09-04' });
    await expect(item).toBeVisible({ timeout: 8000 });
    await item.locator('button', { hasText: '一键恢复' }).click();
    await page.locator('.ant-popconfirm button', { hasText: /^恢\s*复$/ }).click();
    await expectMessage(page, '已恢复');

    // 周期回到下拉框
    const sel = page.locator('.ant-select .ant-select-selector').first();
    await sel.dispatchEvent('mousedown');
    await expect(page.locator('.custom-week-option', { hasText: '2026-09-04' }).first()).toBeVisible();
  });
});
