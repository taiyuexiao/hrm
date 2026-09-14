import { execSync } from 'child_process';
import path from 'path';
import {
  test, expect, request, loginToken, injectAuth, API, SUPER_ACCOUNT,
} from '../fixtures';

/**
 * 15 新人日报第三期：新人周报 + mentor 带教报告 + 浏览/看板联动
 * 建/删账号需超管（USER_MANAGE），与 13/14 一致依赖 E2E_SUPER_PASSWORD
 */
const DB_PATH = path.resolve(__dirname, '../../backend/data/hr.db');
const GROUP = 'E2E带教测试组';
const MENTOR = { username: 'mt_e2e02', password: 'Mt@test456', name: 'E2E带教B' };
const NB1 = { username: 'nb_e2e03', password: 'Nb@test789', name: 'E2E学员甲' };
const NB2 = { username: 'nb_e2e04', password: 'Nb@test789', name: 'E2E学员乙' };

function dbCleanup() {
  try {
    execSync(
      `sqlite3 "${DB_PATH}" ".timeout 3000" ` +
      `"DELETE FROM newbie_comments WHERE report_id IN (SELECT id FROM newbie_reports WHERE username IN ('${NB1.username}','${NB2.username}')) OR report_id IN (SELECT id FROM mentor_reports WHERE mentor='${MENTOR.username}');` +
      `DELETE FROM newbie_report_reads WHERE report_id IN (SELECT id FROM newbie_reports WHERE username IN ('${NB1.username}','${NB2.username}')) OR report_id IN (SELECT id FROM mentor_reports WHERE mentor='${MENTOR.username}');` +
      `DELETE FROM newbie_reports WHERE username IN ('${NB1.username}','${NB2.username}');` +
      `DELETE FROM mentor_reports WHERE mentor='${MENTOR.username}';` +
      `DELETE FROM newbie_groups WHERE name='${GROUP}';"`,
    );
  } catch { /* 清理失败不阻塞 */ }
}

test.describe('15 周报与带教报告', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    test.skip(!process.env.E2E_SUPER_PASSWORD, '未设置 E2E_SUPER_PASSWORD 环境变量，跳过（建账号需超管）');
    const req = await request.newContext();
    ({ token: adminToken } = await loginToken(req, SUPER_ACCOUNT.username, process.env.E2E_SUPER_PASSWORD!));
    dbCleanup();
    for (const u of [MENTOR, NB1, NB2]) {
      await req.delete(`${API}/auth/users/${u.username}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
    }
    const g = await (await req.post(`${API}/daily/groups`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: GROUP },
    })).json();
    if (!g.success) throw new Error(`创建小组失败: ${g.message}`);
    const meta = await (await req.get(`${API}/daily/meta`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })).json();
    const groupId = meta.groups.find((x: any) => x.name === GROUP).id;
    for (const [u, role, gid, mt] of [
      [MENTOR, 'mentor', undefined, undefined],
      [NB1, 'newbie', groupId, MENTOR.username],
      [NB2, 'newbie', groupId, MENTOR.username],
    ] as const) {
      const c = await (await req.post(`${API}/auth/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          username: u.username, password: u.password, name: u.name,
          role: 'daily', dailyRole: role, groupId: gid, mentor: mt,
        },
      })).json();
      if (!c.success) throw new Error(`创建账号失败 ${u.username}: ${c.message}`);
    }
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    const req = await request.newContext();
    for (const u of [MENTOR, NB1, NB2]) {
      await req.delete(`${API}/auth/users/${u.username}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
    }
    dbCleanup();
  });

  test('新人周报：切周报 Tab → 解析填入 → 提交', async ({ page }) => {
    const req = await request.newContext();
    const { token, user } = await loginToken(req, NB1.username, NB1.password);
    await injectAuth(page, token, user);
    await page.goto('/daily');
    await expect(page.locator('text=🌱 新人培养报告')).toBeVisible({ timeout: 15000 });

    await page.locator('.ant-segmented-item', { hasText: '周报' }).first().click();
    await expect(page.locator('text=本周学习 / 工作内容')).toBeVisible();

    await page.locator('button', { hasText: '智能解析填入' }).click();
    await page.locator('.ant-modal textarea').fill(
      '本周学习：完成 E2E 周报测试内容\n下周计划：继续深入\n遇到问题：无\n手头任务：周报练习题',
    );
    await page.locator('.ant-modal button', { hasText: '➜' }).click();
    await expect(page.locator('.ant-modal', { hasText: '完成 E2E 周报测试内容' })).toBeVisible();
    await page.locator('.ant-modal button', { hasText: '覆盖填入' }).click();

    await page.waitForTimeout(2500); // 等自动保存
    await page.locator('button', { hasText: '提交周报' }).click();
    await page.locator('.ant-popconfirm button', { hasText: /^提\s*交$/ }).click();
    await expect(page.locator('.ant-message')).toContainText('周报已提交', { timeout: 10000 });
    await expect(page.locator('.ant-tag', { hasText: '已提交' })).toBeVisible();
  });

  test('mentor：小组报告 + 个人报告填报提交，进度统计正确', async ({ page }) => {
    const req = await request.newContext();
    const { token, user } = await loginToken(req, MENTOR.username, MENTOR.password);
    await injectAuth(page, token, user);
    await page.goto('/daily');
    await expect(page.locator('text=🌱 新人培养报告')).toBeVisible({ timeout: 15000 });

    // mentor 默认落在带教填报，小组自动识别
    await expect(page.locator('.ant-tag', { hasText: `小组：${GROUP}` })).toBeVisible();
    await expect(page.locator('text=本周小组任务')).toBeVisible();

    // 小组周报：解析填入 → 提交
    await page.locator('button', { hasText: '智能解析填入' }).click();
    await page.locator('.ant-modal textarea').fill(
      '本周小组任务：E2E小组任务内容\n培养内容：完成阅读指标\n本周新人整体情况：整体良好\n下周小组任务：继续推进\n问题：无',
    );
    await page.locator('.ant-modal button', { hasText: '➜' }).click();
    await page.locator('.ant-modal button', { hasText: '覆盖填入' }).click();
    await page.waitForTimeout(2500);
    await page.locator('button', { hasText: '提交报告' }).click();
    await page.locator('.ant-popconfirm button', { hasText: /^提\s*交$/ }).click();
    await expect(page.locator('.ant-message')).toContainText('带教报告已提交', { timeout: 10000 });

    // 个人报告：选学员甲 → 填 → 提交 → 进度 1/2
    await page.locator('.ant-segmented-item', { hasText: '个人报告' }).click();
    await page.locator('.ant-select').first().click();
    await page.locator('.ant-select-item-option', { hasText: NB1.name }).click();
    await expect(page.locator('text=带教学员特质')).toBeVisible();
    await page.locator('textarea').first().fill('态度积极，能力中上，意愿强');
    await page.waitForTimeout(2500);
    await page.locator('button', { hasText: '提交报告' }).click();
    await page.locator('.ant-popconfirm button', { hasText: /^提\s*交$/ }).click();
    await expect(page.locator('.ant-message')).toContainText('带教报告已提交', { timeout: 10000 });
    await expect(page.locator('.ant-tag', { hasText: '已填 1/2 人' })).toBeVisible();
  });

  test('老员工浏览带教报告并批注；超管看板带教区块跳浏览', async ({ page }) => {
    // 老员工浏览：切到带教周报
    const req = await request.newContext();
    const { token, user } = await loginToken(req);
    await injectAuth(page, token, user);
    await page.goto('/daily');
    await expect(page.locator('text=🌱 新人培养报告')).toBeVisible({ timeout: 15000 });

    await page.locator('.ant-select').first().click();
    await page.locator('.ant-select-item-option', { hasText: '带教周报' }).click();
    await expect(page.locator(`text=🧑‍🏫 ${MENTOR.name}`)).toBeVisible({ timeout: 10000 });
    await page.locator('div', { hasText: '👥 小组报告' }).last().click();
    await expect(page.locator('text=E2E小组任务内容')).toBeVisible({ timeout: 10000 });

    // 批注
    await page.locator('textarea[placeholder*="写下批注"]').fill('小组任务安排合理');
    await page.locator('button:has(.anticon-send)').click();
    await expect(page.locator('.ant-message')).toContainText('批注成功', { timeout: 10000 });

    // AI 总结按钮（网关可用则出总结，不可用则出友好错误）
    await page.locator('button', { hasText: 'AI 总结' }).click();
    await expect(page.locator('.ant-modal:visible', { hasText: 'AI 总结与完成度评估' })).toBeVisible({ timeout: 15000 });
    await page.locator('.ant-modal:visible button', { hasText: /关\s*闭/ }).click();

    // 超管看板：带教区块
    const req2 = await request.newContext();
    const { token: saToken, user: saUser } = await loginToken(req2, SUPER_ACCOUNT.username, process.env.E2E_SUPER_PASSWORD!);
    await injectAuth(page, saToken, saUser);
    await page.goto('/daily');
    await page.locator('.ant-segmented-item', { hasText: '看板' }).click();
    await expect(page.locator('text=带教报告提交情况')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('cell', { name: `🧑‍🏫 ${MENTOR.name}` })).toBeVisible();
    await expect(page.locator('td', { hasText: '1/2' })).toBeVisible();

    // 点击小组周报已提交圆点 → 跳浏览定位到该报告（已交/补交均可；缺交灰点无跳转）
    await page.locator('span[title*="小组周报：已"], span[title*="小组周报：补"]').first().click();
    await expect(page.locator('text=E2E小组任务内容')).toBeVisible({ timeout: 10000 });
  });
});
