import {
  test, expect, request, loginToken, injectAuth, selectWeek,
  createTestWeek, cleanupTestWeek, setReactInput,
  futureFridayLabel, toDashLabel,
} from '../fixtures';

// 测试周期动态取下一周五：过去周会被冻结（不可提交），写死的周期会随时间过期
const WEEK = futureFridayLabel(1);
const WEEK_DASH = toDashLabel(WEEK);

test.describe('07 提交周报', () => {
  let token: string, user: any;

  test.beforeAll(async () => {
    const req = await request.newContext();
    ({ token, user } = await loginToken(req));
    await createTestWeek(req, token, WEEK);
  });

  test.afterAll(async () => {
    const req = await request.newContext();
    await cleanupTestWeek(req, token, WEEK);
  });

  test('编辑 → 自动保存 → 提交 → 已提交标识', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await selectWeek(page, WEEK_DASH);

    // 添加一个常规任务并填写内容（触发自动保存）
    await page.locator('button', { hasText: '+ 添加常规工作' }).first().click();
    await setReactInput(page, '.task-row:last-child textarea', 'E2E提交测试任务');
    await page.waitForTimeout(2500); // 等自动保存

    // 提交
    await page.locator('button', { hasText: '提交周报' }).click();
    await expect(page.locator('.ant-message')).toContainText(/提交成功|已提交/, { timeout: 10000 });

    // 已提交标识：出现「查看上次提交」按钮
    await expect(page.locator('button', { hasText: '查看上次提交' })).toBeVisible({ timeout: 8000 });
  });
});
