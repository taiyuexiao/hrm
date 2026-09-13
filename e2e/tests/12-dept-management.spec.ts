import { test, expect, request, loginToken, injectAuth, SUPER_ACCOUNT } from '../fixtures';
import { execSync } from 'child_process';
import path from 'path';

const NEW_DEPT = 'E2E测试科室';
const NEW_USER = { username: 'e2e_dept_user', password: 'Dept@test123', name: '科室测试员' };
const DB_PATH = path.resolve(__dirname, '../../backend/data/hr.db');

/** 清理测试残留：删测试账号（API）+ 删测试科室（直接清库，科室暂无删除端点） */
async function cleanup(req: any, token: string) {
  try {
    await req.delete(`http://localhost:8080/api/auth/users/${NEW_USER.username}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* 忽略 */ }
  try {
    execSync(`sqlite3 "${DB_PATH}" ".timeout 3000" "DELETE FROM departments WHERE name='${NEW_DEPT}';"`);
  } catch { /* 忽略 */ }
}

test.describe('12 科室管理与账号分配', () => {
  let saToken: string, saUser: any;

  test.beforeAll(async () => {
    const superPwd = process.env.E2E_SUPER_PASSWORD;
    test.skip(!superPwd, '未设置 E2E_SUPER_PASSWORD 环境变量，跳过超管用例');
    const req = await request.newContext();
    ({ token: saToken, user: saUser } = await loginToken(req, SUPER_ACCOUNT.username, superPwd!));
    // 幂等：先清掉上次失败运行可能留下的残留
    await cleanup(req, saToken);
  });

  test.afterAll(async () => {
    const req = await request.newContext();
    await cleanup(req, saToken);
  });

  test('创建科室 → 新增账号分配到该科室 → 周报页可见新科室', async ({ page }) => {
    await injectAuth(page, saToken, saUser);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });

    // 头像菜单 → 账号管理
    await page.locator('.ant-avatar').first().click();
    await page.locator('.ant-dropdown-menu-item', { hasText: '账号管理' }).click();
    const mgmt = page.getByRole('dialog', { name: '账号管理' });
    await expect(mgmt).toBeVisible();

    // 科室管理 → 新增科室
    await mgmt.locator('button', { hasText: '科室管理' }).click();
    const deptModal = page.getByRole('dialog', { name: '科室管理' });
    await expect(deptModal).toBeVisible();
    await deptModal.locator('input[placeholder*="新科室名称"]').fill(NEW_DEPT);
    await deptModal.locator('button', { hasText: '新增科室' }).click();
    await expect(page.locator('.ant-message')).toContainText('创建成功', { timeout: 8000 });
    await expect(deptModal.locator('td', { hasText: NEW_DEPT })).toBeVisible();
    await deptModal.locator('.ant-modal-close').click();

    // 新增账号，部门选新科室
    await mgmt.locator('button', { hasText: '新增账号' }).click();
    const createModal = page.getByRole('dialog', { name: '新增账号' });
    await createModal.locator('#username').fill(NEW_USER.username);
    await createModal.locator('#password').fill(NEW_USER.password);
    await createModal.locator('#name').fill(NEW_USER.name);
    // 部门下拉（科室列表为虚拟滚动，先搜索过滤定位）
    await createModal.locator('.ant-form-item:has-text("部门") .ant-select-selector').click();
    await page.keyboard.type(NEW_DEPT);
    await page.locator('.ant-select-item-option', { hasText: NEW_DEPT }).first().click();
    await createModal.locator('button', { hasText: /^创\s*建$/ }).click();
    await expect(page.locator('.ant-message')).toContainText('创建成功', { timeout: 8000 });

    // 账号列表中出现新账号且部门为新科室
    const row = mgmt.locator('tr', { hasText: NEW_USER.username });
    await expect(row).toContainText(NEW_DEPT);

    // 周报页：URL 白名单接受新科室（不在清单会回落默认科室）
    await page.goto(`/?dept=${encodeURIComponent(NEW_DEPT)}`);
    await expect(page.locator('h4', { hasText: NEW_DEPT })).toBeVisible({ timeout: 10000 });
  });
});
