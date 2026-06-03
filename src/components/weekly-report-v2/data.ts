/**
 * 数据层 - 后端 JSON 文件存储
 * force-hmr: 1
 */
import { WeeklyReport, User, SYSTEM_USERS, TaskItem } from './types';

const API_BASE = '/api';
let _reports: WeeklyReport[] = [];
let _loaded = false;

async function fetchReports(): Promise<WeeklyReport[]> {
  const resp = await fetch(`${API_BASE}/reports`, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!resp.ok) throw new Error(`后端返回 ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function pushReport(report: WeeklyReport): Promise<void> {
  await fetch(`${API_BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}

export async function loadReports(): Promise<void> {
  _reports = await fetchReports();
  _loaded = true;
}

export function getReports(): WeeklyReport[] {
  return _reports;
}

export function saveReport(report: WeeklyReport) {
  const idx = _reports.findIndex(r => r.id === report.id);
  if (idx >= 0) {
    _reports[idx] = { ...report, updatedAt: new Date().toISOString() };
  } else {
    _reports.push({ ...report, updatedAt: new Date().toISOString() });
  }
  // 过滤空数据：核心字段全空时不推送到后端，避免污染数据库
  const hasContent = !!report.currentWork || !!report.nextPlan || !!report.thoughts || !!report.other || report.content.length > 0;
  if (!hasContent) {
    console.log('⏸ 跳过空数据保存');
    return;
  }
  pushReport(_reports[idx >= 0 ? idx : _reports.length - 1]).catch(console.error);
}

export function getReport(weekLabel: string, dept: string): WeeklyReport | undefined {
  return _reports.find(r => r.weekLabel === weekLabel && r.dept === dept);
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
        avatar: matched?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + loginUser.username,
        color: matched?.color || '#1890ff',
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

export function canEditDept(user: User, dept: string): boolean {
  if (user.role === 'admin') return false;
  return user.dept === dept;
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

function parseWeekLabel(label: string): { year: number; week: number } {
  const [yearStr, weekStr] = label.split('-W');
  return { year: parseInt(yearStr), week: parseInt(weekStr) };
}

function formatWeekLabelRaw(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getWeeksInYear(year: number): number {
  const d = new Date(year, 11, 31);
  const day = d.getDay() || 7;
  const thu = new Date(d.getTime() + (4 - day) * 86400000);
  const firstThu = new Date(year, 0, 4);
  const firstMon = new Date(firstThu.getTime() - ((firstThu.getDay() || 7) - 1) * 86400000);
  return Math.floor((+thu - +firstMon) / 604800000) + 1;
}

export function getPrevWeekLabel(weekLabel: string): string | undefined {
  const { year, week } = parseWeekLabel(weekLabel);
  if (week > 1) return formatWeekLabelRaw(year, week - 1);
  const prevYear = year - 1;
  return formatWeekLabelRaw(prevYear, getWeeksInYear(prevYear));
}

export function getNextWeekLabel(weekLabel: string): string {
  const { year, week } = parseWeekLabel(weekLabel);
  const weeksInYear = getWeeksInYear(year);
  if (week < weeksInYear) return formatWeekLabelRaw(year, week + 1);
  return formatWeekLabelRaw(year + 1, 1);
}

export function getPrevWeekReport(weekLabel: string, dept: string): WeeklyReport | undefined {
  const prevWeek = getPrevWeekLabel(weekLabel);
  if (!prevWeek) return undefined;
  return getReport(prevWeek, dept);
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

export const WEEK_OPTIONS = ['2026-W12', '2026-W14', '2026-W15', '2026-W19', '2026-W20'];
export const DEFAULT_WEEK = '2026-W20';

export function getDynamicWeekOptions(): string[] {
  const existing = _reports.map(r => r.weekLabel);
  const baseSet = new Set([...WEEK_OPTIONS, ...existing]);

  const allKnown = Array.from(baseSet);
  const sorted = allKnown.sort((a, b) => {
    const pa = parseWeekLabel(a);
    const pb = parseWeekLabel(b);
    if (pa.year !== pb.year) return pa.year - pb.year;
    return pa.week - pb.week;
  });

  let max = sorted[sorted.length - 1] || DEFAULT_WEEK;
  for (let i = 0; i < 8; i++) {
    max = getNextWeekLabel(max);
    baseSet.add(max);
  }

  return Array.from(baseSet).sort((a, b) => {
    const pa = parseWeekLabel(a);
    const pb = parseWeekLabel(b);
    if (pa.year !== pb.year) return pa.year - pb.year;
    return pa.week - pb.week;
  });
}

export function formatWeekLabel(weekLabel: string): string {
  const [, weekStr] = weekLabel.split('-W');
  const weekNum = parseInt(weekStr);
  const baseWeek = 20;
  const baseDate = new Date(2026, 4, 22);

  const diffWeeks = weekNum - baseWeek;
  const targetFri = new Date(baseDate);
  targetFri.setDate(baseDate.getDate() + diffWeeks * 7);

  const yyyy = String(targetFri.getFullYear());
  const mm = String(targetFri.getMonth() + 1).padStart(2, '0');
  const dd = String(targetFri.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-W${weekNum}`;
}

export async function clearAllData() {
  await fetch(`${API_BASE}/reports`, { method: 'DELETE' });
  _reports = [];
}
