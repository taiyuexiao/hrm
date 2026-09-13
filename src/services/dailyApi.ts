/**
 * 新人培养报告（日报/周报/月报）API 客户端
 * 后端 /api/daily/** —— 与科室周报完全并行的独立应用
 * 模块文档：docs/modules/new-employee-daily.md
 */
import { getApiBaseUrl } from '../config/app';

export type ReportType = 'daily' | 'weekly' | 'monthly';

export interface DailyReport {
  id: string;
  username: string;
  authorName?: string;
  reportType: ReportType;
  period: string;
  sections: Record<string, string>;
  status: 'draft' | 'submitted';
  submittedAt?: string;
  version?: number;
  commentCount?: number;
  groupId?: string;
  groupName?: string;
  mentor?: string;
  mentorName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DailyComment {
  id: string;
  reportId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  authorRole: 'newbie' | 'mentor' | 'leader' | 'staff';
  content: string;
  quote?: string;
  mentions: string[];
  createdAt: string;
}

export interface DailyGroup {
  id: string;
  name: string;
  leader?: string;
  sortOrder: number;
  createdAt?: string;
}

export interface NewbieItem {
  username: string;
  name: string;
  groupId?: string;
  mentor?: string;
}

export interface MentorItem {
  username: string;
  name: string;
}

export interface DailyMeta {
  groups: DailyGroup[];
  newbies: NewbieItem[];
  mentors: MentorItem[];
}

export interface FeedEntry {
  username: string;
  name: string;
  groupId?: string;
  groupName?: string;
  mentor?: string;
  mentorName?: string;
  report: DailyReport | null;
}

export interface DailyReader {
  username: string;
  name: string;
  dailyRole?: string;
}

export interface DashboardReportItem {
  id: string;
  period: string;
  status: 'draft' | 'submitted';
  submittedAt?: string;
}

export interface DashboardEntry {
  username: string;
  name: string;
  groupId?: string;
  groupName?: string;
  mentorName?: string;
  reports: DashboardReportItem[];
}

interface Resp {
  success: boolean;
  message?: string;
  [key: string]: any;
}

async function request<T extends Resp>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth-token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${getApiBaseUrl()}${url}`, { ...options, headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

/** 日报栏目 schema（前端拥有，后端 sections 为自由 JSON 透传存储） */
export const DAILY_SECTIONS = [
  { key: 'today', label: '今日学习 / 工作内容' },
  { key: 'tomorrow', label: '明日学习 / 工作计划' },
  { key: 'problems', label: '遇到问题' },
  { key: 'ongoing', label: '手头学习及工作任务' },
] as const;

export interface SectionDef {
  key: string;
  label: string;
}

/** 新人报告栏目 schema：键跨周期类型稳定（后端无感），仅标签随日/周/月变化 */
export const NEWBIE_SECTIONS: Record<ReportType, SectionDef[]> = {
  daily: DAILY_SECTIONS.map(s => ({ key: s.key, label: s.label })),
  weekly: [
    { key: 'today', label: '本周学习 / 工作内容' },
    { key: 'tomorrow', label: '下周学习 / 工作计划' },
    { key: 'problems', label: '遇到问题' },
    { key: 'ongoing', label: '手头学习及工作任务' },
  ],
  monthly: [
    { key: 'today', label: '本月学习 / 工作内容' },
    { key: 'tomorrow', label: '下月学习 / 工作计划' },
    { key: 'problems', label: '遇到问题' },
    { key: 'ongoing', label: '手头学习及工作任务' },
  ],
};

/** mentor 小组带教报告栏目 schema */
export const MENTOR_GROUP_SECTIONS: Record<'weekly' | 'monthly', SectionDef[]> = {
  weekly: [
    { key: 'groupTasks', label: '本周小组任务' },
    { key: 'training', label: '本周培养内容 / 阅读指标达成评估' },
    { key: 'overall', label: '本周新人整体情况' },
    { key: 'nextTasks', label: '下周小组任务' },
    { key: 'issues', label: '本周培养遇到的问题和调整方向' },
  ],
  monthly: [
    { key: 'groupTasks', label: '本月小组任务' },
    { key: 'training', label: '本月培养内容 / 阅读指标达成评估' },
    { key: 'overall', label: '本月资产沉淀情况' },
    { key: 'nextTasks', label: '下月小组任务' },
    { key: 'issues', label: '本月培养遇到的问题和调整方向' },
  ],
};

/** mentor 个人带教报告栏目 schema */
export const MENTOR_PERSON_SECTIONS: Record<'weekly' | 'monthly', SectionDef[]> = {
  weekly: [
    { key: 'traits', label: '带教学员特质（态度 / 能力 / 意愿）' },
    { key: 'progress', label: '本周进步' },
    { key: 'improve', label: '本周需要改进' },
    { key: 'guidance', label: '如何指导其改进' },
    { key: 'unsolved', label: '还有什么问题无法解决' },
  ],
  monthly: [
    { key: 'traits', label: '带教学员特质（态度 / 能力 / 意愿）' },
    { key: 'progress', label: '本月进步' },
    { key: 'improve', label: '本月需要改进' },
    { key: 'guidance', label: '如何指导其改进' },
    { key: 'unsolved', label: '还有什么问题无法解决' },
  ],
};

export interface MentorReport {
  id: string;
  mentor: string;
  mentorName?: string;
  scope: 'group' | 'person';
  target: string;
  targetName?: string;
  reportType: 'weekly' | 'monthly';
  period: string;
  sections: Record<string, string>;
  status: 'draft' | 'submitted';
  submittedAt?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DashboardMentorItem {
  id: string;
  mentor: string;
  mentorName?: string;
  scope: 'group' | 'person';
  target: string;
  targetName?: string;
  reportType: 'weekly' | 'monthly';
  period: string;
  status: 'draft' | 'submitted';
  submittedAt?: string;
}

/** Date → period 格式 YYYYMMDD */
export function toPeriod(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 所在周的周五（周报周期标识 YYYYMMDD；周末归入前一个周五） */
export function fridayOf(d: Date): string {
  const dt = new Date(d);
  const dow = dt.getDay() || 7; // Mon=1 ... Sun=7
  dt.setDate(dt.getDate() + (5 - dow));
  return toPeriod(dt);
}

/** Date → 月报周期标识 YYYYMM */
export function monthPeriod(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}`;
}

/** YYYYMMDD → 2026-09-14（周一） */
export function formatPeriod(period: string): string {
  if (/^\d{6}$/.test(period)) return `${period.slice(0, 4)}-${period.slice(4, 6)}`;
  if (!/^\d{8}$/.test(period)) return period;
  const d = new Date(+period.slice(0, 4), +period.slice(4, 6) - 1, +period.slice(6, 8));
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${period.slice(0, 4)}-${period.slice(4, 6)}-${period.slice(6, 8)}（周${weekDays[d.getDay()]}）`;
}

export const dailyApi = {
  meta: () => request<Resp & DailyMeta>('/daily/meta'),

  createGroup: (name: string, leader?: string) =>
    request<Resp>('/daily/groups', { method: 'POST', body: JSON.stringify({ name, leader }) }),

  getMine: (type: ReportType, period: string) =>
    request<Resp & { report: DailyReport | null }>(`/daily/reports/mine?type=${type}&period=${period}`),

  saveDraft: (reportType: ReportType, period: string, sections: Record<string, string>) =>
    request<Resp & { report: DailyReport }>('/daily/reports', {
      method: 'PUT',
      body: JSON.stringify({ reportType, period, sections }),
    }),

  submit: (id: string) =>
    request<Resp & { report: DailyReport }>(`/daily/reports/${id}/submit`, { method: 'POST' }),

  feed: (type: ReportType, period: string) =>
    request<Resp & { entries: FeedEntry[] }>(`/daily/feed?type=${type}&period=${period}`),

  detail: (id: string) =>
    request<Resp & { report: DailyReport; comments: DailyComment[]; readers: DailyReader[] }>(`/daily/reports/${id}`),

  addComment: (reportId: string, data: { content: string; parentId?: string; quote?: string; mentions?: string[] }) =>
    request<Resp & { comments: DailyComment[] }>(`/daily/reports/${reportId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteComment: (id: string) =>
    request<Resp>(`/daily/comments/${id}`, { method: 'DELETE' }),

  markRead: (id: string) =>
    request<Resp>(`/daily/reports/${id}/read`, { method: 'POST' }),

  dashboard: (from: string, to: string) =>
    request<Resp & { entries: DashboardEntry[]; mentorReports?: DashboardMentorItem[] }>(`/daily/dashboard?from=${from}&to=${to}`),

  missing: (days = 30) =>
    request<Resp & { missing: string[] }>(`/daily/missing?days=${days}`),

  // ========== mentor 带教报告 ==========

  mentorMine: (scope: 'group' | 'person', target: string, type: 'weekly' | 'monthly', period: string) =>
    request<Resp & { report: MentorReport | null }>(
      `/daily/mentor-reports/mine?scope=${scope}&target=${encodeURIComponent(target)}&type=${type}&period=${period}`),

  saveMentorDraft: (data: {
    scope: 'group' | 'person'; target: string; reportType: 'weekly' | 'monthly';
    period: string; sections: Record<string, string>;
  }) =>
    request<Resp & { report: MentorReport }>('/daily/mentor-reports', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  submitMentor: (id: string) =>
    request<Resp & { report: MentorReport }>(`/daily/mentor-reports/${id}/submit`, { method: 'POST' }),

  mentorFeed: (type: 'weekly' | 'monthly', period: string) =>
    request<Resp & { reports: MentorReport[] }>(`/daily/mentor-reports/feed?type=${type}&period=${period}`),

  // ========== AI 总结 / 完成度 ==========

  aiSummary: (id: string) =>
    request<Resp & { summary: string }>(`/daily/reports/${id}/ai-summary`, { method: 'POST' }),
};
