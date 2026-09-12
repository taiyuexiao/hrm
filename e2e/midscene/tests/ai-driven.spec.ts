/**
 * AI 驱动的端到端测试示例（Midscene.js）
 *
 * 适用场景：结果不确定、难以写死断言的用例（AI 内容质量、复杂交互流）
 * 前置：.env 中配置行内 LLM 网关（必须是多模态模型）+ 本地服务运行
 */
import { test as base } from '@playwright/test';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

// Midscene fixture：向用例注入 aiAction / aiAssert / aiTap / aiInput 等 AI 方法
const test = base.extend(PlaywrightAiFixture());

const API = process.env.E2E_API_URL || 'http://localhost:8080/api';
const USERNAME = process.env.E2E_USERNAME || 'e2e_test';
const PASSWORD = process.env.E2E_PASSWORD || 'E2e@test123';

/** 普通方式注入登录态（确定性步骤不需要 AI，省 token） */
async function injectAuth(page: any) {
  const resp = await page.request.post(`${API}/auth/login`, {
    data: { username: USERNAME, password: PASSWORD },
  });
  const body = await resp.json();
  if (!body.success) throw new Error(`登录失败: ${body.message}`);
  await page.addInitScript(
    ([t, u]: [string, string]) => {
      localStorage.setItem('auth-token', t);
      localStorage.setItem('auth-user', u);
    },
    [body.token, JSON.stringify(body.user)],
  );
}

test.describe('AI 驱动功能测试', () => {
  test('整段解析：自然语言操作 + AI 断言', async ({ page, aiAction, aiAssert }) => {
    await injectAuth(page);
    await page.goto('/');

    await aiAction('等待周报工作台加载完成，在周下拉框中选择 2026-09-04 这一周');
    await aiAction('点击本周工作「重点工作」栏目标题右端的「整段解析」按钮');
    await aiAction(`在弹出的文本框中粘贴以下内容：
手机银行项目组
1. 完成5.0版本需求评审
（1）整理评审意见并确认
2. 推进转账模块开发`);
    await aiAction('点击弹窗底部的「填入」按钮');

    // AI 语义断言：不依赖精确文本匹配
    await aiAssert('重点工作栏目下出现了「手机银行项目组」根任务，它下面有两个子任务，分别是完成5.0版本需求评审和推进转账模块开发');
  });

  test('AI 总结质量检查（需要 LLM 网关可用）', async ({ page, aiAction, aiAssert }) => {
    await injectAuth(page);
    await page.goto('/');

    await aiAction('等待页面加载完成，点击「AI 总结」按钮并等待分析完成');
    await aiAssert('页面展示的 AI 总结内容与本周工作任务相关，没有编造不存在的任务');
  });
});
