import { getApiBaseUrl } from '../config/app';
import { WeeklyReport, AiAnalysisResult } from '../components/weekly-report-v2/types';

const token = () => localStorage.getItem('auth-token') || '';

export interface AiSummaryResult {
  success: boolean;
  message?: string;
  summary?: string;
  aiAnalysis?: AiAnalysisResult;
}

export interface AiGlobalAnalysisResult {
  success: boolean;
  message?: string;
  result?: string;
}

/**
 * AI 单科室周报总结（由后端转发调用大模型）
 */
export async function requestAiSummary(
  report: WeeklyReport,
  prevNextPlan: string
): Promise<AiSummaryResult> {
  const resp = await fetch(`${getApiBaseUrl()}/ai/summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token()}`,
    },
    body: JSON.stringify({
      weekLabel: report.weekLabel,
      dept: report.dept,
      plan: report.plan,
      currentWork: report.currentWork,
      nextPlan: report.nextPlan,
      thoughts: report.thoughts,
      other: report.other,
      content: report.content,
      prevNextPlan,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return { success: false, message: `后端返回 ${resp.status}: ${text}` };
  }

  return resp.json();
}

interface DeptAnalysisData {
  dept: string;
  currentContent: string;
  currentWork: string;
  nextPlan: string;
  prevNextPlan: string;
}

export interface AiParseTextResult {
  success: boolean;
  message?: string;
  thisWeekRoutine?: string;
  thisWeekKey?: string;
  nextWeekRoutine?: string;
  nextWeekKey?: string;
}

/**
 * 将 Excel 中杂乱的周报四段文本交给后端大模型解析为规范层级列表
 */
export async function requestParseWeeklyText(
  thisWeekRoutine: string,
  thisWeekKey: string,
  nextWeekRoutine: string,
  nextWeekKey: string
): Promise<AiParseTextResult> {
  const resp = await fetch(`${getApiBaseUrl()}/ai/parse-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token()}`,
    },
    body: JSON.stringify({
      thisWeekRoutine,
      thisWeekKey,
      nextWeekRoutine,
      nextWeekKey,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    return { success: false, message: `后端返回 ${resp.status}: ${text}` };
  }
  return resp.json();
}

interface GlobalAnalysisParams {
  weekLabel: string;
  compareWeekLabel: string;
  focusStartWeekLabel: string;
  prompt: string;
  reports: DeptAnalysisData[];
}

/**
 * AI 全局分析（由后端转发调用大模型）
 */
export async function requestGlobalAnalysis(
  params: GlobalAnalysisParams
): Promise<AiGlobalAnalysisResult> {
  const resp = await fetch(`${getApiBaseUrl()}/ai/global-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token()}`,
    },
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return { success: false, message: `后端返回 ${resp.status}: ${text}` };
  }

  return resp.json();
}
