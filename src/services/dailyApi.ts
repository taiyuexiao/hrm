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

/** Date → period 格式 YYYYMMDD */
export function toPeriod(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** YYYYMMDD → 2026-09-14（周一） */
export function formatPeriod(period: string): string {
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
    request<Resp & { entries: DashboardEntry[] }>(`/daily/dashboard?from=${from}&to=${to}`),

  missing: (days = 30) =>
    request<Resp & { missing: string[] }>(`/daily/missing?days=${days}`),
};
