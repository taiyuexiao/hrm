import {
  test, expect, request, loginToken, injectAuth, selectWeek,
  createTestWeek, cleanupTestWeek, setReactInput, readTaskTree,
  openBlockParseModal, clickTaskParseButton, expectMessage,
} from '../fixtures';

test.describe('05 根任务级整段解析', () => {
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

  test('标题智能识别 + 追加合并 + 子任务序号连续', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await selectWeek(page, '2026-09-04');

    // 先通过栏级解析建一个根任务「对公BP工作」（含 2 个子任务）
    let modal = await openBlockParseModal(page, 0);
    await setReactInput(page, modal.locator('textarea'),
      '对公BP工作\n1. 拜访重点客户3家\n2. 跟进授信审批流程');
    await modal.locator('.ant-btn-primary').click();
    await expectMessage(page, '已填入 1 个根任务');

    // 点开该根任务的紫色「整段解析为子任务」按钮
    modal = await clickTaskParseButton(page, '对公BP工作');
    await expect(modal.locator('.ant-modal-title')).toContainText('整段解析为「对公BP工作」的子任务');

    // 粘贴带同名标题行的文本 → 应智能取子节点，不产生重复父节点
    await setReactInput(page, modal.locator('textarea'),
      '对公BP工作\n1. 完成季度客户走访报告\n2. 推进新增代发工资企业2家');
    await expect(modal).toContainText('已识别 1 个根任务');
    await modal.locator('.ant-btn-primary').click();
    await expectMessage(page, '已填入 2 个子任务');

    // 验证：原子任务保留 + 新子任务追加，序号（1）~（4）连续，无重复「对公BP工作」节点
    const tree = await readTaskTree(page);
    const text = tree.join('\n');
    expect(text).toMatch(/（1）\s*拜访重点客户3家/);
    expect(text).toMatch(/（2）\s*跟进授信审批流程/);
    expect(text).toMatch(/（3）\s*完成季度客户走访报告/);
    expect(text).toMatch(/（4）\s*推进新增代发工资企业2家/);
    expect(tree.filter(t => t.includes('对公BP工作')).length).toBe(1);
  });
});
