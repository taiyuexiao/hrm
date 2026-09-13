/**
 * 测试夹具与工具：登录、测试周期生命周期、antd/React 交互辅助
 */
import { test as base, expect, Page, Locator, APIRequestContext, request } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';

export const API = 'http://localhost:8080/api';
export const TEST_WEEK = '20260904';          // 专用测试周期（未来周，管理员可删）
export const TEST_DEPT = '综合管理部';
export const ACCOUNT = { username: 'e2e_test', password: 'E2e@test123' };

/** 超管测试账号：用户名/密码均可通过环境变量覆盖（33528 已被删除后本地用 308193） */
export const SUPER_ACCOUNT = {
  username: process.env.E2E_SUPER_USERNAME || '33528',
  password: process.env.E2E_SUPER_PASSWORD,
};

const DB_PATH = path.resolve(__dirname, '../backend/data/hr.db');

/** 通过后端登录接口拿 token（跳过 UI 登录，快且稳） */
export async function loginToken(
  req: APIRequestContext,
  username = ACCOUNT.username,
  password = ACCOUNT.password,
): Promise<{ token: string; user: any }> {
  const resp = await req.post(`${API}/auth/login`, { data: { username, password } });
  const body = await resp.json();
  if (!body.success) throw new Error(`登录失败: ${body.message || resp.status()}`);
  return { token: body.token, user: body.user };
}

/** 把登录态注入浏览器（在页面脚本加载前写入 localStorage） */
export async function injectAuth(page: Page, token: string, user: any) {
  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem('auth-token', t);
      localStorage.setItem('auth-user', JSON.stringify(u));
    },
    [token, user],
  );
}

/** 未来第 N 个周五的周期标签（YYYYMMDD）。用于周期管理测试：仅未来周可被普通管理员删除 */
export function futureFridayLabel(weeksAhead = 1): string {
  const now = new Date();
  const day = now.getDay() || 7; // Mon=1 ... Sun=7
  const offset = ((5 - day + 7) % 7) + weeksAhead * 7;
  const d = new Date(now);
  d.setDate(now.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 20260904 → 2026-09-04 */
export function toDashLabel(week: string): string {
  return `${week.slice(0, 4)}-${week.slice(4, 6)}-${week.slice(6, 8)}`;
}

/** 创建测试周期（一个科室一条空周报即可让周期出现在下拉框） */
export async function createTestWeek(req: APIRequestContext, token: string, week = TEST_WEEK) {
  const resp = await req.post(`${API}/reports`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      id: `${week}-${TEST_DEPT}`,
      weekLabel: week,
      dept: TEST_DEPT,
      authorId: 'e2e',
      authorName: 'E2E测试',
      plan: '',
      content: [],
      nextPlan: '',
      thoughts: '',
      other: '',
      comments: [],
    },
  });
  const body = await resp.json();
  if (body.success === false) throw new Error(`创建测试周期失败: ${body.message}`);
}

/** 清理测试周期：软删除 + 直接清库（连回收站残留一起清，仅本地 dev 环境） */
export async function cleanupTestWeek(req: APIRequestContext, token: string, week = TEST_WEEK) {
  await req.delete(`${API}/reports/${week}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
  try {
    execSync(
      `sqlite3 "${DB_PATH}" "DELETE FROM weekly_reports WHERE week_label='${week}'; DELETE FROM comments WHERE report_id LIKE '${week}%';"`,
    );
  } catch {
    // 无 sqlite3 或清理失败不阻塞测试
  }
}

/** React 受控输入框赋值（原生 setter + input/change 事件）。target 支持选择器或 Locator（多弹窗场景请传弹窗内 Locator） */
export async function setReactInput(page: Page, target: string | Locator, value: string) {
  const loc = typeof target === 'string' ? page.locator(target).first() : target.first();
  await loc.evaluate((el: any, v: string) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** 打开周下拉框并选择指定周（如 2026-09-04）。下拉为虚拟滚动，目标项未必已渲染，统一走搜索过滤定位 */
export async function selectWeek(page: Page, weekText: string) {
  const sel = page.locator('.ant-select .ant-select-selector').first();
  await sel.dispatchEvent('mousedown');
  await page.keyboard.type(weekText);
  await page.locator('.ant-select-item-option', { hasText: weekText }).first().click();
  await expect(page.locator('.ant-select-selection-item').first()).toHaveText(weekText);
}

/** 当前选中周 */
export function selectedWeek(page: Page) {
  return page.locator('.ant-select-selection-item').first().textContent();
}

/** 点开栏级「整段解析」弹窗。block: 0=本周重点 1=本周常规 2=下周重点 3=下周常规 */
export async function openBlockParseModal(page: Page, block: 0 | 1 | 2 | 3) {
  await page.locator('button', { hasText: '整段解析' }).nth(block).click();
  const modal = page.locator('.ant-modal:visible', { hasText: '整段解析填入' });
  await expect(modal).toBeVisible();
  return modal;
}

/** 点击根任务行上的紫色「整段解析为子任务」按钮（按根任务序号定位，textarea 值不参与文本匹配） */
export async function clickTaskParseButton(page: Page, rootText: string) {
  // 根任务行 = 前缀形如 "N. " 的行；找到目标文本在根任务中的序号
  const rootIndex = await page.locator('.task-row').evaluateAll((rows, target) => {
    let idx = -1, n = 0;
    for (const r of rows) {
      const prefix = r.querySelector('span')?.textContent?.trim() || '';
      if (!/^\d+\.$/.test(prefix.replace(/\s/g, ''))) continue;  // 只数根任务
      const text = (r.querySelector('textarea') as HTMLTextAreaElement | null)?.value || '';
      if (text === target) { idx = n; break; }
      n++;
    }
    return idx;
  }, rootText);
  if (rootIndex < 0) throw new Error(`未找到根任务: ${rootText}`);
  // 按钮可能在 hover 才可见的操作区，直接 DOM click 绕过可见性
  await page.locator('button[title*="解析结果作为该任务的子任务"]').nth(rootIndex).evaluate((el: HTMLElement) => el.click());
  const modal = page.locator('.ant-modal:visible', { hasText: '整段解析为' });
  await expect(modal).toBeVisible();
  return modal;
}

/** 读取任务树（前缀+文本，按 DOM 顺序） */
export async function readTaskTree(page: Page): Promise<string[]> {
  return page.locator('.task-row').evaluateAll((rows) =>
    rows.map((r) => {
      const prefix = r.querySelector('span')?.textContent?.trim() || '';
      const text = (r.querySelector('textarea') as HTMLTextAreaElement | null)?.value || '';
      return `${prefix} ${text}`.trim();
    }).filter((s) => s),
  );
}

/** 快捷断言 message 提示 */
export function expectMessage(page: Page, text: string | RegExp) {
  return expect(page.locator('.ant-message')).toContainText(text, { timeout: 8000 });
}

export { base, expect, request };
export const test = base;
