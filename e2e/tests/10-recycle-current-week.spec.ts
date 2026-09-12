import { test, expect, request, loginToken, injectAuth } from '../fixtures';
import { execSync } from 'child_process';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../../backend/data/hr.db');

/** 与前端 getCurrentFridayWeekLabel 相同规则：今天所在周的周五（周六日取下周五） */
function currentFridayWeekLabel(): string {
  const now = new Date();
  const day = now.getDay() || 7;
  const friday = new Date(now);
  friday.setDate(now.getDate() + ((5 - day + 7) % 7));
  return `${friday.getFullYear()}${String(friday.getMonth() + 1).padStart(2, '0')}${String(friday.getDate()).padStart(2, '0')}`;
}

/**
 * 回归：当前周被删除（回收站）时，重新登录不得默认选中已删周期，
 * 也不允许出现"自动保存失败：该周报周期已被管理员删除"报错。
 */
test.describe('10 回收站当前周的默认选周', () => {
  const currentWeek = currentFridayWeekLabel();
  const displayWeek = `${currentWeek.slice(0, 4)}-${currentWeek.slice(4, 6)}-${currentWeek.slice(6, 8)}`;

  test.beforeAll(() => {
    // 软删除当前周（仅翻标记，不动数据）
    execSync(`sqlite3 "${DB_PATH}" "UPDATE weekly_reports SET deleted_at=datetime('now'), deleted_by='e2e' WHERE week_label='${currentWeek}' AND deleted_at IS NULL;"`);
  });

  test.afterAll(() => {
    // 恢复当前周
    execSync(`sqlite3 "${DB_PATH}" "UPDATE weekly_reports SET deleted_at=NULL, deleted_by=NULL WHERE week_label='${currentWeek}';"`);
  });

  test('重新登录后默认选中最近可选周期且无报错', async ({ page }) => {
    const req = await request.newContext();
    const { token, user } = await loginToken(req);
    await injectAuth(page, token, user);
    await page.goto('/');
    await expect(page.locator('.ant-card-head-title', { hasText: '本周工作内容' })).toBeVisible({ timeout: 15000 });

    // 不得选中已删除的当前周
    const selected = await page.locator('.ant-select-selection-item').first().textContent();
    expect(selected).not.toBe(displayWeek);

    // 不得出现回收站相关的自动保存报错
    await page.waitForTimeout(3000);
    const msg = await page.locator('.ant-message').textContent().catch(() => '');
    expect(msg || '').not.toContain('回收站');
  });
});
