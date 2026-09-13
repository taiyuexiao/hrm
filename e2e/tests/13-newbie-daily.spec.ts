import { execSync } from 'child_process';
import path from 'path';
import {
  test, expect, request, loginToken, injectAuth, API, SUPER_ACCOUNT,
} from '../fixtures';

/**
 * 13 新人日报核心闭环：
 * 建小组 → 建新人/mentor 账号 → 新人填报提交 → 老员工浏览批注 → 新人看到批注并回复
 * 建/删账号需要 USER_MANAGE 权限（仅超管），故依赖 E2E_SUPER_PASSWORD（与 12 一致）
 * 清理：删除测试账号、小组、报告与评论
 */
const DB_PATH = path.resolve(__dirname, '../../backend/data/hr.db');
const GROUP = 'E2E日报测试组';
const NEWBIE = { username: 'nb_e2e01', password: 'Nb@test123', name: 'E2E新人' };
const MENTOR = { username: 'mt_e2e01', password: 'Mt@test123', name: 'E2E带教' };
const ADMIN = { username: 'e2e_test', password: 'E2e@test123' };

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

async function createDailyUser(req: any, token: string, u: any, dailyRole: string, groupId?: string, mentor?: string) {
  const resp = await req.post(`${API}/auth/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      username: u.username, password: u.password, name: u.name,
      role: 'daily', dailyRole, groupId, mentor,
    },
  });
  const body = await resp.json();
  if (!body.success) throw new Error(`创建账号失败 ${u.username}: ${body.message}`);
}

test.describe('13 新人日报', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    test.skip(!process.env.E2E_SUPER_PASSWORD, '未设置 E2E_SUPER_PASSWORD 环境变量，跳过（建账号需超管）');
    const req = await request.newContext();
    ({ token: adminToken } = await loginToken(req, SUPER_ACCOUNT.username, process.env.E2E_SUPER_PASSWORD!));
    // 幂等准备：先清理可能的残留，再建小组与账号
    dbCleanup();
    for (const u of [NEWBIE, MENTOR]) {
      await req.delete(`${API}/auth/users/${u.username}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
    }
    const g = await req.post(`${API}/daily/groups`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: GROUP, leader: 'E2E组长' },
    });
    const gBody = await g.json();
    if (!gBody.success) throw new Error(`创建小组失败: ${gBody.message}`);
    const meta = await (await req.get(`${API}/daily/meta`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })).json();
    const groupId = meta.groups.find((x: any) => x.name === GROUP).id;
    await createDailyUser(req, adminToken, MENTOR, 'mentor');
    await createDailyUser(req, adminToken, NEWBIE, 'newbie', groupId, MENTOR.username);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    const req = await request.newContext();
    for (const u of [NEWBIE, MENTOR]) {
      await req.delete(`${API}/auth/users/${u.username}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
    }
    dbCleanup();
  });

  test('新人填报：登录直达日报页 → 解析填入 → 提交', async ({ page }) => {
    const req = await request.newContext();
    const { token, user } = await loginToken(req, NEWBIE.username, NEWBIE.password);
    await injectAuth(page, token, user);
    await page.goto('/');

    // role=daily 登录后直达 /daily 填报页
    await expect(page).toHaveURL(/\/daily/);
    await expect(page.locator('text=🌱 新人培养报告')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=E2E日报测试组')).toBeVisible();
    await expect(page.locator('text=带教老师：E2E带教')).toBeVisible();

    // 智能解析填入
    await page.locator('button', { hasText: '智能解析填入' }).click();
    await page.locator('.ant-modal textarea').fill(
      '今日学习：学习 E2E 测试基础\n明日计划：继续学习\n遇到问题：网络不稳定\n手头任务：完成练习题',
    );
    await page.locator('.ant-modal button', { hasText: '➜' }).click();
    await expect(page.locator('.ant-modal', { hasText: '学习 E2E 测试基础' })).toBeVisible();
    await page.locator('.ant-modal button', { hasText: '覆盖填入' }).click();

    // 自动保存后提交
    await page.waitForTimeout(2500);
    await page.locator('button', { hasText: '提交日报' }).click();
    await page.locator('.ant-popconfirm button', { hasText: /^提\s*交$/ }).click();
    await expect(page.locator('.ant-message')).toContainText('已提交', { timeout: 10000 });
    await expect(page.locator('.ant-tag', { hasText: '已提交' })).toBeVisible();
  });

  test('老员工浏览批注 → 新人可见并回复', async ({ page }) => {
    // 老员工（无日报身份）侧边栏可见「新人报告」入口
    const req = await request.newContext();
    const { token, user } = await loginToken(req, ADMIN.username, ADMIN.password);
    await injectAuth(page, token, user);
    await page.goto('/');
    // 展开折叠的侧边栏（默认收起只显示图标）
    await page.locator('.ant-layout-sider-trigger').click();
    await page.locator('.ant-menu-item', { hasText: '新人报告' }).click();
    await expect(page).toHaveURL(/\/daily/);

    // 浏览页选中新人，看到今日日报
    await expect(page.locator('text=🌱 新人培养报告')).toBeVisible({ timeout: 15000 });
    await page.locator('div', { hasText: 'E2E新人' }).last().click();
    await expect(page.locator('text=学习 E2E 测试基础')).toBeVisible({ timeout: 10000 });

    // 发批注
    await page.locator('textarea[placeholder*="写下批注"]').fill('写得不错，继续加油 @E2E新人');
    await page.locator('button:has(.anticon-send)').click();
    await expect(page.locator('.ant-message')).toContainText('批注成功', { timeout: 10000 });
    await expect(page.locator('text=写得不错，继续加油')).toBeVisible();
    // 已读名单出现老员工
    await expect(page.locator('text=已读：')).toBeVisible();

    // 新人登录看到批注并回复
    const req2 = await request.newContext();
    const { token: nToken, user: nUser } = await loginToken(req2, NEWBIE.username, NEWBIE.password);
    await injectAuth(page, nToken, nUser);
    await page.goto('/daily');
    await page.locator('.ant-segmented-item', { hasText: '浏览' }).click();
    await page.locator('div', { hasText: 'E2E新人' }).last().click();
    await expect(page.locator('text=写得不错，继续加油')).toBeVisible({ timeout: 10000 });

    await page.locator('button', { hasText: '回复' }).first().click();
    await page.locator('textarea[placeholder*="回复"]').fill('谢谢老师！');
    await page.locator('button:has(.anticon-send)').click();
    await expect(page.locator('.ant-message')).toContainText('回复成功', { timeout: 10000 });
    await expect(page.locator('text=谢谢老师！')).toBeVisible();
  });
});
