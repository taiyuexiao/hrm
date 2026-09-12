import {
  test, expect, request, loginToken, injectAuth, selectWeek,
  createTestWeek, cleanupTestWeek, setReactInput, readTaskTree, TEST_WEEK, TEST_DEPT,
} from '../fixtures';

test.describe('03 任务树操作', () => {
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

  test('添加根任务 / 编辑文本 / 添加子任务 / 删除', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await selectWeek(page, '2026-09-04');

    // 添加常规工作根任务
    await page.locator('button', { hasText: '+ 添加常规工作' }).first().click();
    const rootRow = page.locator('.task-row').last();
    await expect(rootRow).toBeVisible();

    // 编辑根任务文本（最后一个根任务的 textarea）
    const rootTextarea = rootRow.locator('textarea').first();
    const rootSelector = '.task-row:last-child textarea';
    await setReactInput(page, rootSelector, 'E2E根任务A');
    await expect(rootTextarea).toHaveValue('E2E根任务A');

    // 添加子任务
    await rootRow.locator('button[title="添加子任务"]').click();
    await expect(page.locator('.task-row').last().locator('textarea').first()).toBeVisible();
    let tree = await readTaskTree(page);
    expect(tree.some(t => t.includes('（1）'))).toBeTruthy();

    // 删除子任务（弹确认框）
    await page.locator('.task-row').last().locator('button[title="删除"]').click();
    const confirm = page.locator('.ant-modal:visible', { hasText: '确认删除' });
    await confirm.locator('button', { hasText: /^删\s*除$/ }).click();
    tree = await readTaskTree(page);
    expect(tree.filter(t => t.includes('（1）')).length).toBe(0);
  });
});
