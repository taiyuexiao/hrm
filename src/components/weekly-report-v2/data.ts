/**
 * 数据层 - 后端 JSON 文件存储
 * force-hmr: 1
 */
import { WeeklyReport, User, SYSTEM_USERS, TaskItem, genAvatar } from './types';
import { getDeptsSnapshot } from '../../services/deptStore';

import { getApiBaseUrl } from '../../config/app';
import frozenReportsRaw from '../../data/frozen-weekly-reports.json';

const FROZEN_REPORTS: WeeklyReport[] = frozenReportsRaw as unknown as WeeklyReport[];
const FROZEN_UNTIL_WEEK = '20260529';

let _reports: WeeklyReport[] = [];
let _loaded = false;
// 回收站中的周期（软删除）：从周下拉框中排除，但数据仍在后端，可一键恢复
let _deletedWeeks = new Set<string>();

export function isFrozenWeek(weekLabel: string): boolean {
  return weekLabel <= FROZEN_UNTIL_WEEK;
}

async function fetchReports(): Promise<WeeklyReport[]> {
  const resp = await fetch(`${getApiBaseUrl()}/reports`, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!resp.ok) throw new Error(`后端返回 ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

interface PushReportResult {
  success: boolean;
  code?: string;
  message?: string;
  reason?: string;
  report?: WeeklyReport;
}

async function pushReport(report: WeeklyReport): Promise<PushReportResult> {
  const token = localStorage.getItem('auth-token');
  const resp = await fetch(`${getApiBaseUrl()}/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || ''}`,
    },
    body: JSON.stringify(report),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`保存失败 ${resp.status}: ${text}`);
  }
  const result = await resp.json();
  if (result.success === false) {
    return {
      success: false,
      code: result.code,
      message: result.message || '保存被拒绝',
      reason: result.reason,
      report: result.report,
    };
  }
  return { success: true, report: result.report };
}

export async function loadReports(): Promise<void> {
  const [backendReports, deletedWeeks] = await Promise.all([
    fetchReports(),
    fetchDeletedWeeks(),
  ]);
  // 0529 及之前的历史周报已固化到前端，避免被后端导入/修改覆盖。
  // 但如果后端出现了本地 frozen 中不存在的周期（如生产中新增的 20260518/20260525），
  // 仍要补充进来，否则前端周次下拉框会缺失这些真实数据。
  const frozenWeeks = new Set(FROZEN_REPORTS.map(r => r.weekLabel));
  const backendSupplement = backendReports.filter(r => !frozenWeeks.has(r.weekLabel));
  _reports = [...FROZEN_REPORTS, ...backendSupplement];
  _deletedWeeks = new Set(deletedWeeks);
  _loaded = true;
}

/** 回收站中的周期标签列表（后端软删除状态） */
async function fetchDeletedWeeks(): Promise<string[]> {
  try {
    const resp = await fetch(`${getApiBaseUrl()}/reports/deleted-weeks`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!resp.ok) return [];
    return resp.json();
  } catch {
    return [];
  }
}

export function getReports(): WeeklyReport[] {
  return _reports;
}

/** 该周期是否在回收站中（软删除状态） */
export function isWeekInRecycleBin(weekLabel: string): boolean {
  return _deletedWeeks.has(weekLabel);
}

export function hasTextContent(value: string | undefined | null): boolean {
  if (value == null) return false;
  const s = value.trim();
  return s !== '' && s !== '[]' && s !== '{}';
}

export function reportHasContent(report: WeeklyReport): boolean {
  return (
    hasTextContent(report.plan) ||
    hasTextContent(report.currentWork) ||
    hasTextContent(report.nextPlan) ||
    hasTextContent(report.thoughts) ||
    hasTextContent(report.other) ||
    report.content.length > 0 ||
    (report.comments?.length || 0) > 0
  );
}

function mergeReportUpdate(existing: WeeklyReport | undefined, update: WeeklyReport): WeeklyReport {
  return {
    ...(existing || update),
    ...update,
    // 后端 save 接口不返回这些衍生/关联字段，保留本地已有值避免渲染时报 undefined
    comments: update.comments ?? existing?.comments ?? [],
    aiAnalysis: update.aiAnalysis ?? existing?.aiAnalysis ?? null,
    aiSummary: update.aiSummary ?? existing?.aiSummary ?? null,
    deadlineRemaining: update.deadlineRemaining ?? existing?.deadlineRemaining ?? null,
    deadlinePassed: update.deadlinePassed ?? existing?.deadlinePassed ?? null,
  } as WeeklyReport;
}

export function saveReport(report: WeeklyReport): Promise<void> | void {
  // 历史周报（0529 及之前）固化到前端，禁止保存覆盖
  if (isFrozenWeek(report.weekLabel)) {
    console.log(`⏸ 历史周报 ${report.weekLabel} 已固化，跳过保存`);
    return;
  }
  // 按 weekLabel + dept 查找，避免前后端 ID 格式不一致导致重复条目
  const idx = _reports.findIndex(r => r.weekLabel === report.weekLabel && r.dept === report.dept);
  const existing = idx >= 0 ? _reports[idx] : undefined;
  const optimistic = mergeReportUpdate(existing, report);
  if (idx >= 0) {
    _reports[idx] = optimistic;
  } else {
    _reports.push(optimistic);
  }
  // 过滤空数据：核心字段全空且无批注时不推送到后端，避免污染数据库
  if (!reportHasContent(optimistic)) {
    console.log('⏸ 跳过空数据保存');
    return;
  }
  // 注意：不要在这里重置 updatedAt，否则后端乐观锁会冲突
  return pushReport(report).then(result => {
    if (!result.success) {
      const err: any = new Error(result.message || '保存被拒绝');
      err.code = result.code;
      err.reason = result.reason;
      err.report = result.report;
      throw err;
    }
    // 用后端返回的最新版本更新本地缓存，保证后续保存的 updatedAt 是最新的
    const saved = result.report || report;
    const savedIdx = _reports.findIndex(r => r.weekLabel === saved.weekLabel && r.dept === saved.dept);
    const merged = mergeReportUpdate(savedIdx >= 0 ? _reports[savedIdx] : undefined, saved as WeeklyReport);
    if (savedIdx >= 0) {
      _reports[savedIdx] = merged;
    } else {
      _reports.push(merged);
    }
  });
}

export function getReport(weekLabel: string, dept: string): WeeklyReport | undefined {
  return _reports.find(r => r.weekLabel === weekLabel && r.dept === dept);
}

export async function fetchReportDetail(weekLabel: string, dept: string): Promise<WeeklyReport | null> {
  // 历史周报直接返回前端固化数据，避免被后端覆盖
  const frozen = FROZEN_REPORTS.find(r => r.weekLabel === weekLabel && r.dept === dept);
  if (frozen) return frozen;
  try {
    const token = localStorage.getItem('auth-token');
    const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/${encodeURIComponent(dept)}`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${token || ''}`,
      },
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

export async function submitReportApi(weekLabel: string, dept: string): Promise<{ success: boolean; message?: string; reason?: string }> {
  try {
    const token = localStorage.getItem('auth-token');
    const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/${encodeURIComponent(dept)}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || ''}`,
      },
    });
    return resp.json();
  } catch (e) {
    return { success: false, message: String(e) };
  }
}

export function getReportsByWeek(weekLabel: string): WeeklyReport[] {
  return _reports.filter(r => r.weekLabel === weekLabel);
}

export function getReportsByDept(dept: string): WeeklyReport[] {
  return _reports.filter(r => r.dept === dept);
}

/** 获取指定部门有数据的最晚周次（用于切换部门时自动匹配） */
export function getLatestWeekForDept(dept: string): string | undefined {
  const weeks = _reports.filter(r => r.dept === dept).map(r => r.weekLabel);
  if (weeks.length === 0) return undefined;
  return weeks.sort()[weeks.length - 1];
}

export function getCurrentUser(): User {
  try {
    const authRaw = localStorage.getItem('auth-user');
    if (authRaw) {
      const loginUser = JSON.parse(authRaw);
      // 按 username（工号/账号）精确匹配，避免同部门多用户时取错
      const matched = SYSTEM_USERS.find(u => u.id === loginUser.username);
      return {
        id: loginUser.username,
        name: matched?.name || loginUser.name,
        dept: loginUser.dept,
        role: loginUser.role,
        avatar: matched?.avatar || genAvatar(loginUser.username, '#b6e3f4'),
        color: matched?.color || '#1890ff',
        permissions: loginUser.permissions || [],
      };
    }
    const raw = localStorage.getItem('weekly-report-current-user');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return SYSTEM_USERS[0];
}

export function setCurrentUser(user: User) {
  localStorage.setItem('weekly-report-current-user', JSON.stringify(user));
}

// ========== 本地草稿：防止刷新/退出登录导致未保存编辑丢失 ==========

export interface WeeklyReportDraft {
  userId: string;
  weekLabel: string;
  dept: string;
  baseUpdatedAt?: string;
  savedAt: number;
  report: WeeklyReport;
}

function draftKey(userId: string, weekLabel: string, dept: string): string {
  return `weekly-report-draft:${userId}:${weekLabel}:${dept}`;
}

/**
 * 草稿中只保留用户编辑的核心字段，避免 comments/submissions/AI 结果等冗余数据造成写入卡顿。
 */
function stripDraftReport(report: WeeklyReport): WeeklyReport {
  return {
    ...report,
    comments: [],
    submissions: undefined,
    aiSummary: undefined,
    aiAnalysis: undefined,
  };
}

export function loadDraft(userId: string, weekLabel: string, dept: string): WeeklyReportDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId, weekLabel, dept));
    if (!raw) return null;
    const parsed: WeeklyReportDraft = JSON.parse(raw);
    // 草稿不保存 comments/submissions，加载时重置为空，避免脏数据
    parsed.report = {
      ...parsed.report,
      comments: [],
      submissions: undefined,
      aiSummary: undefined,
      aiAnalysis: undefined,
    };
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft: WeeklyReportDraft): void {
  try {
    localStorage.setItem(
      draftKey(draft.userId, draft.weekLabel, draft.dept),
      JSON.stringify({ ...draft, savedAt: Date.now(), report: stripDraftReport(draft.report) }),
    );
  } catch {
    // localStorage 写失败（如空间不足）不阻断编辑流程
  }
}

export function clearDraft(userId: string, weekLabel: string, dept: string): void {
  try {
    localStorage.removeItem(draftKey(userId, weekLabel, dept));
  } catch {
    // ignore
  }
}

/**
 * 将草稿中的用户编辑字段合并到当前报告，保留服务端元数据（id、updatedAt、comments 等）。
 */
export function applyDraftToReport(base: WeeklyReport, draft: WeeklyReport): WeeklyReport {
  return {
    ...base,
    plan: draft.plan,
    content: draft.content,
    currentWork: draft.currentWork,
    nextPlan: draft.nextPlan,
    thoughts: draft.thoughts,
    other: draft.other,
  };
}

/**
 * 比较两份周报的用户可编辑内容是否一致（忽略 updatedAt/comments/submissions/AI 等元数据）。
 * 用于草稿语义：内容与服务器基准一致 = 没有未保存编辑，不应写草稿/弹恢复提示。
 */
export function sameEditableContent(a: WeeklyReport, b: WeeklyReport): boolean {
  const norm = (r: WeeklyReport) => ({
    plan: r.plan || '',
    currentWork: r.currentWork || '',
    nextPlan: r.nextPlan || '',
    thoughts: r.thoughts || '',
    other: r.other || '',
    content: JSON.stringify(r.content || []),
  });
  const x = norm(a);
  const y = norm(b);
  return x.plan === y.plan && x.currentWork === y.currentWork && x.nextPlan === y.nextPlan
    && x.thoughts === y.thoughts && x.other === y.other && x.content === y.content;
}

export function isSuperAdmin(user: User | undefined | null): boolean {
  if (!user) return false;
  // 超级管理员按角色判断，不再绑定具体工号
  return user.role === 'superadmin';
}

// 管理员：可编辑任意部门任意周期周报，但不能管理用户/权限（除 33528 外）
export function isAdmin(user: User | undefined | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'superadmin';
}

// 总经理室领导：只能查看/评论/AI分析，不能编辑/提交/新建周报
export function isLeader(user: User | undefined | null): boolean {
  if (!user) return false;
  return user.role === 'leader';
}

export function hasPermission(user: User | undefined | null, permission: string): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  // 所有人（登录后）都可以：查看任意周报、查看评论、添加评论、回复评论
  const commonPerms = ['VIEW_REPORT', 'VIEW_COMMENTS', 'ADD_COMMENT', 'REPLY_COMMENT'];
  if (commonPerms.includes(permission)) {
    return true;
  }

  // 管理员：除 USER_MANAGE / PERMISSION_MANAGE 外全部权限
  if (isAdmin(user)) {
    return permission !== 'USER_MANAGE' && permission !== 'PERMISSION_MANAGE';
  }

  // 总经理室领导：查看/评论/AI分析/行为日志/知识库/提交记录等
  if (isLeader(user)) {
    const leaderPerms = [
      'VIEW_REPORT', 'VIEW_COMMENTS', 'ADD_COMMENT', 'REPLY_COMMENT',
      'AI_SUMMARY', 'AI_GLOBAL_ANALYSIS', 'VIEW_ACTION_LOGS',
      'VIEW_SUBMISSIONS', 'KNOWLEDGE_BASE',
    ];
    return leaderPerms.includes(permission);
  }

  // 普通用户默认拥有 EDIT_REPORT / SUBMIT_REPORT
  const userBasePerms = ['EDIT_REPORT', 'SUBMIT_REPORT'];
  if (userBasePerms.includes(permission)) {
    return true;
  }

  // 其他权限走用户自定义权限列表，并兼容旧权限名
  const perms = user.permissions ?? [];
  if (perms.includes(permission)) return true;
  if (permission === 'EDIT_AFTER_DEADLINE' && perms.includes('SUBMIT_AFTER_DEADLINE')) return true;
  return false;
}

export function canEditDept(user: User, dept: string): boolean {
  if (isSuperAdmin(user)) return true;
  // 管理员可以编辑任意部门
  if (isAdmin(user)) return true;
  // 总经理室领导不能编辑任意周报
  if (isLeader(user)) return false;
  // 普通用户只能编辑自己部门
  if (hasPermission(user, 'EDIT_REPORT') && user.dept === dept) return true;
  return false;
}

export function canViewDept(_user: User, _dept: string): boolean {
  return true;
}

export function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function initDemoData() {
  // 如果未加载过，或者之前加载失败导致 _reports 为空，都重新加载
  if (!_loaded || _reports.length === 0) {
    try {
      await loadReports();
    } catch (e: any) {
      console.error('❌ 加载周报数据失败:', e);
      throw e;
    }
  }
  if (_reports.length === 0) {
    console.log('📊 后端暂无周报数据，等待首次保存');
  } else {
    console.log(`📊 已从后端加载 ${_reports.length} 条周报数据`);
  }
}

// ---------- 日期格式周标签工具 ----------

export function parseDateLabel(label: string): Date | null {
  if (!/^\d{8}$/.test(label)) return null;
  const y = parseInt(label.slice(0, 4));
  const m = parseInt(label.slice(4, 6)) - 1;
  const d = parseInt(label.slice(6, 8));
  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

export function formatDateLabelRaw(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export function getPrevWeekLabel(weekLabel: string): string | undefined {
  const d = parseDateLabel(weekLabel);
  if (!d) return undefined;
  d.setDate(d.getDate() - 7);
  return formatDateLabelRaw(d);
}

export function getNextWeekLabel(weekLabel: string): string {
  const d = parseDateLabel(weekLabel);
  if (!d) return weekLabel;
  d.setDate(d.getDate() + 7);
  return formatDateLabelRaw(d);
}

export function getPrevWeekReport(weekLabel: string, dept: string): WeeklyReport | undefined {
  // 向前查找最近一个有数据的周报（按日期最近，不按 7 天步长），最多回溯 90 天
  const target = parseDateLabel(weekLabel);
  if (!target) return undefined;

  let result: WeeklyReport | undefined;
  let resultDate: Date | undefined;

  for (const r of _reports) {
    if (r.dept !== dept) continue;
    const d = parseDateLabel(r.weekLabel);
    if (!d || d >= target) continue;
    if (!resultDate || d > resultDate) {
      result = r;
      resultDate = d;
    }
  }

  return result;
}

// ---------- 树形任务解析与操作工具 ----------

const HEADING_PATTERNS: [RegExp, number][] = [
  [/^[一二三四五六七八九十]+、/, 0],
  [/^[（(][一二三四五六七八九十]+[）)]/, 2],
  [/^\d+、/, 1],
  [/^\d+\./, 1],
  [/^\d+[）)]/, 2],
  [/^[（(]\d+[）)]/, 2],
  [/^[①②③④⑤⑥⑦⑧⑨⑩]/, 1],
];

const DOMAIN_LABELS = /^(?:对公BP|零售BP|办公领域|对公领域|零售领域|基础板块|风险板块|金市板块|AI手机银行(?:二期)?项目|大模型底座建设|平台与架构建设|场景赋能|反欺诈智能化建设|反洗钱报送本体应用|运管智能录入和智能审核项目|运营风险监控信创改造项目|AI专项人力采购|中试基地项目申报|智能研发部牵头项目|商务进展|人员培养|信创项目|风险BP工作|支行经营智库建设|非现场监测分析挖掘|风险预警特征挖掘|授信管理看板|对公授信全流程智能化项目)[：:]?/;

function detectHeadingLevel(line: string): number {
  const stripped = line.trim();
  if (!stripped) return -1;

  if (DOMAIN_LABELS.test(stripped)) return 0;
  if (/^[\u4e00-\u9fa5]{2,8}[:：]$/.test(stripped)) return 0;

  for (const [pat, level] of HEADING_PATTERNS) {
    if (pat.test(stripped)) return level;
  }
  return -1;
}

function splitInlineHeadings(line: string): string[] {
  if (/[：:；;]\s*\d+[）\.][、.]?/.test(line)) {
    const parts = line.split(/(?<=[：:；;])\s*(?=\d+[）\.][、.]?)/);
    return parts.map(p => p.trim()).filter(Boolean);
  }
  return [line];
}

export function parsePlanToTree(planText: string): TaskItem[] {
  if (!planText.trim()) return [];
  const lines = planText.split('\n');
  const root: TaskItem = { id: 'root', text: 'ROOT', checked: false, children: [] };
  const stack: { node: TaskItem; level: number }[] = [{ node: root, level: -1 }];

  for (const rawLine of lines) {
    const stripped = rawLine.trim();
    if (!stripped) continue;

    const splitLines = splitInlineHeadings(rawLine);
    for (const sl of splitLines) {
      const level = detectHeadingLevel(sl);
      let text = sl.trim();
      let isLeaf = false;

      if (level === -1) {
        // Non-heading: append to last sibling leaf or create leaf
        const parent = stack[stack.length - 1].node;
        if (parent.children && parent.children.length > 0) {
          const last = parent.children[parent.children.length - 1];
          if (!last.children || last.children.length === 0) {
            last.text += ' ' + text;
            continue;
          }
        }
        isLeaf = true;
      }

      const effectiveLevel = level === -1 ? 3 : level;
      const node: TaskItem = { id: genId(), text, checked: false, children: isLeaf ? undefined : [] };

      while (stack.length > 1 && stack[stack.length - 1].level >= effectiveLevel) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].node;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
      if (!isLeaf) stack.push({ node, level: effectiveLevel });
    }
  }

  return root.children || [];
}

/** 兼容旧数据：将扁平/树形 content 统一扁平化为一维数组 */
export function flattenTasks(tasks: TaskItem[]): TaskItem[] {
  const result: TaskItem[] = [];
  for (const t of tasks) {
    result.push(t);
    if (t.children) result.push(...flattenTasks(t.children));
  }
  return result;
}

/** 统计树中所有节点数量 */
export function countTasks(tasks: TaskItem[]): number {
  return flattenTasks(tasks).length;
}

/** 在树中查找节点 */
export function findTaskInTree(tasks: TaskItem[], id: string): TaskItem | null {
  for (const t of tasks) {
    if (t.id === id) return t;
    if (t.children) {
      const found = findTaskInTree(t.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 在树中更新指定节点 */
export function updateTaskInTree(tasks: TaskItem[], id: string, updater: (t: TaskItem) => TaskItem): TaskItem[] {
  return tasks.map(t => {
    if (t.id === id) return updater(t);
    if (t.children) return { ...t, children: updateTaskInTree(t.children, id, updater) };
    return t;
  });
}

/** 在树中删除指定节点 */
export function deleteTaskFromTree(tasks: TaskItem[], id: string): TaskItem[] {
  return tasks.filter(t => t.id !== id).map(t => {
    if (t.children) return { ...t, children: deleteTaskFromTree(t.children, id) };
    return t;
  });
}

/** 检查节点的所有直接子节点是否全部选中 */
export function allChildrenChecked(task: TaskItem): boolean {
  if (!task.children || task.children.length === 0) return true;
  return task.children.every(c => c.checked);
}

/** 兼容旧接口：parsePlanToTasks 内部调用 parsePlanToTree，保持返回一维数组（向后兼容） */
export function parsePlanToTasks(planText: string): TaskItem[] {
  return parsePlanToTree(planText);
}

/**
 * 从字符串中提取第一个完整的 JSON 数组。
 * 用于处理 nextPlan 被污染的情况（末尾追加了非 JSON 文本）。
 */
function extractFirstJsonArray(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[')) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return trimmed.substring(0, i + 1);
      }
    }
  }
  return null;
}

/** 解析下周工作计划：优先尝试 JSON 格式（新 UI），失败则回退到文本解析（旧格式） */
export function parseNextPlan(nextPlan: string | undefined): TaskItem[] {
  if (!nextPlan) return [];
  const trimmed = nextPlan.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 直接解析失败，可能是末尾被非 JSON 文本污染，尝试提取第一个合法 JSON 数组
      const extracted = extractFirstJsonArray(trimmed);
      if (extracted) {
        try {
          const parsed = JSON.parse(extracted);
          if (Array.isArray(parsed)) return parsed;
        } catch { /* 提取后仍失败则回退 */ }
      }
    }
  }
  return parsePlanToTree(trimmed);
}

/** 递归格式化单个任务节点为文本（带层级缩进和序号） */
export function formatTaskNodeForExport(node: TaskItem, depth: number, index: number): string {
  const indent = '  '.repeat(depth);
  let prefix: string;
  if (depth === 0) {
    prefix = `${index + 1}. `;
  } else if (depth === 1) {
    prefix = `（${index + 1}）`;
  } else {
    prefix = `${index + 1}）`;
  }

  let text = node.text || '';
  // 兼容旧数据：如果 text 里已经带了类似 "1. "、"（1）" 的前缀，先剥离
  text = text.replace(/^(\d+[、.．）])+\s*/, '').replace(/^[（(]\d+[）)]\s*/, '').replace(/^\d+[）)]\s*/, '');

  let lines = [`${indent}${prefix}${text}`];
  if (node.children && node.children.length > 0) {
    lines = lines.concat(node.children.map((child, i) => formatTaskNodeForExport(child, depth + 1, i)));
  }
  return lines.join('\n');
}

/**
 * 将任务树格式化为导出文本，按「重点工作 / 常规工作」分组
 */
export function formatTasksForExport(tasks: TaskItem[]): string {
  if (!tasks || tasks.length === 0) return '';

  const importantTasks = tasks.filter(t => t.highlighted);
  const normalTasks = tasks.filter(t => !t.highlighted);
  const sections: string[] = [];

  if (importantTasks.length > 0) {
    sections.push('重点工作：');
    sections.push(...importantTasks.map((t, i) => formatTaskNodeForExport(t, 0, i)));
  }

  if (normalTasks.length > 0) {
    if (sections.length > 0) sections.push('');
    sections.push('常规工作：');
    sections.push(...normalTasks.map((t, i) => formatTaskNodeForExport(t, 0, i)));
  }

  return sections.join('\n');
}

export const WEEK_OPTIONS = ['20260327', '20260410', '20260417', '20260424', '20260515', '20260518', '20260522', '20260525', '20260529'];

/**
 * 获取今天所在周的周五日期（当前周基准）
 * 周一~周五：返回本周五；周六~周日：返回下周五
 */
export function getCurrentFridayWeekLabel(): string {
  const now = new Date();
  const day = now.getDay() || 7; // Mon=1 ... Sun=7
  const offset = (5 - day + 7) % 7; // 距离本周五还有几天
  const friday = new Date(now);
  friday.setDate(now.getDate() + offset);
  return formatDateLabelRaw(friday);
}

export const DEFAULT_WEEK = getCurrentFridayWeekLabel();

export function getDynamicWeekOptions(): string[] {
  const existing = _reports.map(r => r.weekLabel);
  const currentWeek = getCurrentFridayWeekLabel();
  const allWeeks = new Set(existing);
  // 确保当前周始终出现在下拉框中（即使没有数据，用户也应能查看当前周）
  allWeeks.add(currentWeek);
  // 回收站（软删除）中的周期不显示——包括当前周被超管删除的情况
  for (const w of _deletedWeeks) allWeeks.delete(w);
  return [...allWeeks].sort((a, b) => b.localeCompare(a));
}

/**
 * Globally create reports for all departments for a target week.
 * Returns the target week label and list of created/updated depts.
 *
 * @param currentUser 当前操作人
 * @param targetWeekLabel 目标周报周期，如 20260702
 * @param deadline 自定义截止时间，ISO 8601 字符串（如 2026-07-02T20:00:00）
 */
export function createNextWeekGlobally(
  currentUser: User,
  targetWeekLabel?: string,
  deadline?: string
): { nextWeek: string; createdDepts: string[]; inRecycleBin?: boolean } {
  // 默认基于「今天所在周的周五」创建下一周
  const nextWeek = targetWeekLabel || getNextWeekLabel(getCurrentFridayWeekLabel());

  // 同标签周期在回收站中：不允许重建（后端会拒绝写入），应走回收站一键恢复
  if (_deletedWeeks.has(nextWeek)) {
    return { nextWeek, createdDepts: [], inRecycleBin: true };
  }

  const createdDepts: string[] = [];

  for (const dept of getDeptsSnapshot()) {
    const existing = getReport(nextWeek, dept);
    if (existing) continue;

    const prevReport = getPrevWeekReport(nextWeek, dept);
    const defaultTasks = prevReport ? parseNextPlan(prevReport.nextPlan) : [];
    // currentWork/plan 是文本字段：存格式化文本，不存原始 JSON（历史 BUG：塞 JSON 导致导出/AI/提交详情乱码）
    const defaultText = formatTasksForExport(defaultTasks);
    const newReport: WeeklyReport = {
      id: genId(),
      weekLabel: nextWeek,
      dept,
      // 继承上周作者，避免管理员创建下周时把 author 改成自己
      authorId: prevReport ? prevReport.authorId : currentUser.id,
      authorName: prevReport ? prevReport.authorName : currentUser.name,
      plan: defaultText,
      content: defaultTasks,
      currentWork: defaultText,
      nextPlan: '',
      thoughts: '',
      other: '',
      comments: [],
      deadline,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 直接更新本地缓存并强制推送到后端（绕过 saveReport 的空数据过滤）
    const idx = _reports.findIndex(r => r.weekLabel === nextWeek && r.dept === dept);
    if (idx >= 0) {
      _reports[idx] = newReport;
    } else {
      _reports.push(newReport);
    }
    pushReport(newReport).catch(console.error);
    createdDepts.push(dept);
  }

  return { nextWeek, createdDepts };
}

export function formatWeekLabel(weekLabel: string): string {
  // 格式化为 YYYY-MM-DD，如 2026-04-10
  if (!/^\d{8}$/.test(weekLabel)) return weekLabel;
  return `${weekLabel.slice(0, 4)}-${weekLabel.slice(4, 6)}-${weekLabel.slice(6, 8)}`;
}

export async function clearAllData() {
  await fetch(`${getApiBaseUrl()}/reports`, { method: 'DELETE' });
  // 历史周报始终保留在前端
  _reports = [...FROZEN_REPORTS];
  _deletedWeeks = new Set();
}

export async function deleteWeekReports(weekLabel: string): Promise<{ success: boolean; message?: string; deleted?: number }> {
  if (isFrozenWeek(weekLabel)) {
    return { success: false, message: `历史周报 ${weekLabel} 已固化，不可删除` };
  }
  const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}`, {
    method: 'DELETE',
    headers: { 'Cache-Control': 'no-cache', ...(await getAuthHeaders()) },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`删除失败 ${resp.status}: ${text}`);
  }
  const result = await resp.json();
  if (result.success) {
    _reports = _reports.filter(r => r.weekLabel !== weekLabel);
    // 软删除：周期进入回收站，从下拉框排除（含当前周）
    _deletedWeeks = new Set([..._deletedWeeks, weekLabel]);
  }
  return result;
}

// ========== 回收站（软删除周期） API ==========

export interface RecycleBinItem {
  weekLabel: string;
  reportCount: number;
  deletedAt: string;
  deletedBy: string;
}

/** 获取回收站列表（仅超级管理员） */
export async function fetchRecycleBin(): Promise<RecycleBinItem[]> {
  const resp = await fetch(`${getApiBaseUrl()}/reports/recycle-bin`, {
    headers: { 'Cache-Control': 'no-cache', ...(await getAuthHeaders()) },
  });
  if (!resp.ok) throw new Error(`获取回收站失败 ${resp.status}`);
  const result = await resp.json();
  if (Array.isArray(result)) return result;
  throw new Error(result.message || '获取回收站失败');
}

/** 一键恢复：将周期从回收站还原到周报周期下拉框（仅超级管理员） */
export async function restoreWeekReports(weekLabel: string): Promise<{ success: boolean; message?: string }> {
  const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/restore`, {
    method: 'POST',
    headers: { 'Cache-Control': 'no-cache', ...(await getAuthHeaders()) },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`恢复失败 ${resp.status}: ${text}`);
  }
  const result = await resp.json();
  if (result.success) {
    _deletedWeeks = new Set([..._deletedWeeks].filter(w => w !== weekLabel));
    // 恢复的周报行需重新拉取，才能回到内存缓存和下拉框
    await loadReports();
  }
  return result;
}

// ========== Comment API (独立批注接口) ==========

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = localStorage.getItem('auth-token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || ''}`,
  };
}

export async function fetchComments(weekLabel: string, dept: string): Promise<Comment[]> {
  const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/${encodeURIComponent(dept)}/comments`, {
    headers: { 'Cache-Control': 'no-cache', ...(await getAuthHeaders()) },
  });
  if (!resp.ok) throw new Error(`获取批注失败 ${resp.status}`);
  return resp.json();
}

export async function addCommentApi(weekLabel: string, dept: string, comment: any): Promise<void> {
  const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/${encodeURIComponent(dept)}/comments`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(comment),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`添加批注失败 ${resp.status}: ${text}`);
  }
  const result = await resp.json();
  if (result.success === false) {
    throw new Error(result.message || '添加批注被拒绝');
  }
}

export async function addReplyApi(weekLabel: string, dept: string, parentId: string, reply: any): Promise<void> {
  const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/${encodeURIComponent(dept)}/comments/${encodeURIComponent(parentId)}/replies`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(reply),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`添加回复失败 ${resp.status}: ${text}`);
  }
  const result = await resp.json();
  if (result.success === false) {
    throw new Error(result.message || '添加回复被拒绝');
  }
}

export async function deleteCommentApi(weekLabel: string, dept: string, commentId: string): Promise<void> {
  const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/${encodeURIComponent(dept)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`删除批注失败 ${resp.status}: ${text}`);
  }
  const result = await resp.json();
  if (result.success === false) {
    throw new Error(result.message || '删除批注被拒绝');
  }
}

export async function deleteReplyApi(weekLabel: string, dept: string, commentId: string, replyId: string): Promise<void> {
  const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/${encodeURIComponent(dept)}/comments/${encodeURIComponent(commentId)}/replies/${encodeURIComponent(replyId)}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`删除回复失败 ${resp.status}: ${text}`);
  }
  const result = await resp.json();
  if (result.success === false) {
    throw new Error(result.message || '删除回复被拒绝');
  }
}

export async function toggleResolvedApi(weekLabel: string, dept: string, commentId: string, resolved: boolean): Promise<void> {
  const resp = await fetch(`${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/${encodeURIComponent(dept)}/comments/${encodeURIComponent(commentId)}/resolve`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ resolved }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`更新状态失败 ${resp.status}: ${text}`);
  }
  const result = await resp.json();
  if (result.success === false) {
    throw new Error(result.message || '更新状态被拒绝');
  }
}
