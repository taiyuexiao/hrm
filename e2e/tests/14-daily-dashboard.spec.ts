import { execSync } from 'child_process';
import path from 'path';
import {
  test, expect, request, loginToken, injectAuth, API, SUPER_ACCOUNT,
} from '../fixtures';

/**
 * 14 新人日报 · 提交看板（点阵图）与补交提醒：
 * 新人缺交出现横幅提醒，补交后消失；超管查看板点阵，点击圆点跳浏览页查看当天日报
 * 建/删账号需超管（USER_MANAGE），与 13 一致依赖 E2E_SUPER_PASSWORD
 */
const DB_PATH = path.resolve(__dirname, '../../backend/data/hr.db');
const GROUP = 'E2E看板测试组';
const NEWBIE = { username: 'nb_e2e02', password: 'Nb@test456', name: 'E2E看板新人' };

function dbCleanup() {
  try {
    execSync(
      `sqlite3 "${DB_PATH}" ".timeout 3000" ` +
      `"DELETE FROM newbie_comments WHERE report_id IN (SELECT id FROM newbie_reports WHERE username='${NEWBIE.username}');` +
      `DELETE FROM newbie_report_reads WHERE report_id IN (SELECT id FROM newbie_reports WHERE username='${NEWBIE.username}');` +
      `DELETE FROM newbie_reports WHERE username='${NEWBIE.username}';` +
      `DELETE FROM newbie_groups WHERE name='${GROUP}';"`,
    );
  } catch { /* 清理失败不阻塞 */ }
}

test.describe('14 看板与补交提醒', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    test.skip(!process.env.E2E_SUPER_PASSWORD, '未设置 E2E_SUPER_PASSWORD 环境变量，跳过（建账号需超管）');
    const req = await request.newContext();
    ({ token: adminToken } = await loginToken(req, SUPER_ACCOUNT.username, process.env.E2E_SUPER_PASSWORD!));
    dbCleanup();
    await req.delete(`${API}/auth/users/${NEWBIE.username}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => {});
    const g = await (await req.post(`${API}/daily/groups`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: GROUP },
    })).json();
    if (!g.success) throw new Error(`创建小组失败: ${g.message}`);
    const meta = await (await req.get(`${API}/daily/meta`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })).json();
    const groupId = meta.groups.find((x: any) => x.name === GROUP).id;
    const c = await (await req.post(`${API}/auth/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        username: NEWBIE.username, password: NEWBIE.password, name: NEWBIE.name,
        role: 'daily', dailyRole: 'newbie', groupId,
      },
    })).json();
    if (!c.success) throw new Error(`创建新人账号失败: ${c.message}`);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    const req = await request.newContext();
    await req.delete(`${API}/auth/users/${NEWBIE.username}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => {});
    dbCleanup();
  });

  test('新人：缺交横幅提醒 → 点击跳转补交 → 全部补交后横幅消失', async ({ page }) => {
    const req = await request.newContext();
    const { token, user } = await loginToken(req, NEWBIE.username, NEWBIE.password);
    const headers = { Authorization: `Bearer ${token}` };
    await injectAuth(page, token, user);
    await page.goto('/daily');

    // 缺交横幅（新账号最近 30 天的工作日全部未交）
    const alert = page.locator('.ant-alert-warning');
    await expect(alert).toContainText('个工作日未提交日报', { timeout: 15000 });

    // 点击最早缺交日期 → 日期选择器跳到该日
    const missing = await (await req.get(`${API}/daily/missing?days=30`, { headers })).json();
    expect(missing.missing.length).toBeGreaterThan(0);
    const earliest = missing.missing[0];
    await alert.locator('a').click();
    const dashed = `${earliest.slice(0, 4)}-${earliest.slice(4, 6)}-${earliest.slice(6, 8)}`;
    await expect(page.locator('.ant-picker input').first()).toHaveValue(dashed);

    // API 补交全部缺交工作日 → 刷新后横幅消失
    for (const p of missing.missing) {
      const put = await (await req.put(`${API}/daily/reports`, {
        headers,
        data: { reportType: 'daily', period: p, sections: { today: 'E2E补交内容' } },
      })).json();
      await req.post(`${API}/daily/reports/${put.report.id}/submit`, { headers });
    }
    await page.reload();
    await expect(page.locator('text=🌱 新人培养报告')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.ant-alert-warning')).toHaveCount(0);
  });

  test('超管：看板点阵显示提交状态，点击圆点跳浏览页查看日报', async ({ page }) => {
    const req = await request.newContext();
    const { token, user } = await loginToken(req, SUPER_ACCOUNT.username, process.env.E2E_SUPER_PASSWORD!);
    await injectAuth(page, token, user);
    await page.goto('/daily');

    // 超管（无日报身份）也可见看板
    await page.locator('.ant-segmented-item', { hasText: '看板' }).click();
    await expect(page.locator('text=新人日报提交点阵')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('td', { hasText: NEWBIE.name })).toBeVisible();
    await expect(page.locator('td', { hasText: GROUP })).toBeVisible();

    // 统计卡与点阵：补交圆点存在（上一步对历史工作日补交，提交日晚于报告日）
    await expect(page.locator('text=本月提交率')).toBeVisible();
    const lateDot = page.locator('span[title*="补交"]').first();
    await expect(lateDot).toBeVisible();

    // 点击圆点 → 跳浏览页，显示当天日报内容
    await lateDot.click();
    await expect(page.locator('text=E2E补交内容').first()).toBeVisible({ timeout: 10000 });
  });
});
