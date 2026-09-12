import {
  test, expect, request, loginToken, injectAuth, selectWeek,
  createTestWeek, cleanupTestWeek, setReactInput, readTaskTree,
  openBlockParseModal, expectMessage,
} from '../fixtures';

const SAMPLE = `手机银行项目组
1. 完成5.0版本需求评审
（1）整理评审意见23条并逐条确认
（2）输出评审纪要和修改清单
2. 推进转账模块开发
（1）完成大额转账风控规则联调
（2）修复UAT环境缺陷8个

对公BP工作
1. 拜访重点客户3家，收集代发工资需求
2. 跟进XX公司授信审批流程`;

test.describe('04 栏级整段解析', () => {
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

  test('追加模式：预览 → 填入 → 任务树与序号正确', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await selectWeek(page, '2026-09-04');

    // 打开 本周·重点工作 栏级解析弹窗
    const modal = await openBlockParseModal(page, 0);
    await expect(modal.locator('.ant-modal-title')).toContainText('本周工作 · 重点工作');

    // 粘贴文本，预览识别
    await setReactInput(page, modal.locator('textarea'), SAMPLE);
    await expect(modal).toContainText('已识别 2 个根任务');
    await expect(modal.locator('li').first()).toContainText('手机银行项目组');

    // 填入（默认追加）
    await modal.locator('.ant-btn-primary').click();
    await expectMessage(page, '已填入 2 个根任务');

    // 验证任务树与序号（前缀与文本间有空格，用正则兼容）
    const tree = await readTaskTree(page);
    const text = tree.join('\n');
    expect(text).toMatch(/1\.\s+手机银行项目组/);
    expect(text).toMatch(/2\.\s+对公BP工作/);
    expect(text).toMatch(/（1）\s*完成5\.0版本需求评审/);
    expect(text).toMatch(/1）\s*整理评审意见23条并逐条确认/);
  });

  test('覆盖模式：二次确认后替换该栏内容', async ({ page }) => {
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });
    await selectWeek(page, '2026-09-04');

    const modal = await openBlockParseModal(page, 0);
    await modal.locator('.ant-radio-button-wrapper', { hasText: '清空该栏后填入' }).click();
    await setReactInput(page, modal.locator('textarea'), '品牌宣传活动\n1. 完成活动方案\n2. 联系宣传渠道');
    await expect(modal).toContainText('已识别 1 个根任务');
    await modal.locator('.ant-btn-primary').click();

    // 二次确认弹窗
    const confirm = page.locator('.ant-modal:visible', { hasText: '确认覆盖现有内容' });
    await expect(confirm).toBeVisible();
    await confirm.locator('button', { hasText: '确认覆盖' }).click();
    await expectMessage(page, '已填入 1 个根任务');

    // 旧内容已被替换
    const tree = await readTaskTree(page);
    const text = tree.join('\n');
    expect(text).toMatch(/1\.\s+品牌宣传活动/);
    expect(text).not.toContain('手机银行项目组');
  });
});
