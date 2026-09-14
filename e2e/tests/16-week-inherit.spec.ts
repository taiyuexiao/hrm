import { execSync } from 'child_process';
import path from 'path';
import {
  test, expect, request, loginToken, injectAuth, API,
  futureFridayLabel, TEST_DEPT,
} from '../fixtures';

/**
 * 16 周报继承回归（BUG-003，详见 docs/modules/weekly-report-v2.md）：
 * 上周「下周工作计划」是 JSON 序列化任务树，懒创建下周报告时必须用 JSON 感知解析——
 * 历史 bug 用纯文本解析器把 JSON 原文拆成乱码任务，且 nextPlan 同步效应无守卫导致自动落库。
 * 本测试复刻「打开无数据的未来周」场景：内容必须干净继承，且未被自动持久化。
 */
const DB_PATH = path.resolve(__dirname, '../../backend/data/hr.db');
const WEEK = futureFridayLabel(2);   // 上周（有数据）
const NEXT_WEEK = futureFridayLabel(3); // 下周（无数据，触发懒创建）

const NEXT_PLAN = JSON.stringify([
  { id: 'e2e-t1', text: '完成需求评审', checked: false, highlighted: true, children: [
    { id: 'e2e-t1-1', text: '整理评审意见23条', checked: false },
  ] },
  { id: 'e2e-t2', text: '推进数据治理专项', checked: false, children: [] },
]);

function cleanup() {
  try {
    execSync(
      `sqlite3 "${DB_PATH}" ".timeout 3000" ` +
      `"DELETE FROM weekly_reports WHERE week_label IN ('${WEEK}','${NEXT_WEEK}'); ` +
      `DELETE FROM comments WHERE report_id LIKE '${WEEK}%' OR report_id LIKE '${NEXT_WEEK}%';"`,
    );
  } catch { /* 清理失败不阻塞 */ }
}

test.describe('16 周报继承（下周计划→本周内容）', () => {
  let token: string, user: any;

  test.beforeAll(async () => {
    const req = await request.newContext();
    ({ token, user } = await loginToken(req));
    cleanup();
    // 上周报告：带 JSON 任务树形式的下周工作计划
    const resp = await req.post(`${API}/reports`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        id: `${WEEK}-${TEST_DEPT}`,
        weekLabel: WEEK,
        dept: TEST_DEPT,
        authorId: 'e2e',
        authorName: 'E2E测试',
        plan: '',
        content: [],
        currentWork: '',
        nextPlan: NEXT_PLAN,
        thoughts: '',
        other: '',
        comments: [],
      },
    });
    if (!resp.ok()) throw new Error(`创建上周报告失败: ${resp.status()}`);
  });

  test.afterAll(() => cleanup());

  test('打开无数据的下周：继承为干净任务树，且不自动落库', async ({ page }) => {
    await injectAuth(page, token, user);
    // URL 指定无数据的未来周 + 科室，触发懒创建路径
    await page.goto(`/?weekLabel=${NEXT_WEEK}&dept=${encodeURIComponent(TEST_DEPT)}`);
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });

    // 继承内容以任务树呈现（含子任务），无 JSON 乱码
    await expect(page.locator('text=完成需求评审').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=整理评审意见23条').first()).toBeVisible();
    await expect(page.locator('text=推进数据治理专项').first()).toBeVisible();
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('"checked"');
    expect(bodyText).not.toContain('[{"id"');

    // 等待超过自动保存防抖（1s），未真实编辑前不得自动落库
    await page.waitForTimeout(3000);
    const req = await request.newContext();
    const reports = await (await req.get(`${API}/reports`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const leaked = reports.filter((r: any) => r.weekLabel === NEXT_WEEK && r.dept === TEST_DEPT);
    expect(leaked).toHaveLength(0);
  });
});
