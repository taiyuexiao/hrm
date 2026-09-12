/**
 * 企业级智能周报管理系统 V2
 * 核心页面：左中右三栏布局
 * 数据层：localStorage（替代数据库）
 */
import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Layout, Card, Button, Select, Avatar, Badge, Tag, message,
  Input, Space, Typography, Divider, Empty, Spin, Dropdown, Drawer, Modal, Alert,
  Checkbox, Statistic, DatePicker, TimePicker, Segmented
} from 'antd';
import {
  FileTextOutlined, RobotFilled,
  TeamOutlined, CalendarOutlined, MessageOutlined, BarChartOutlined,
  CheckCircleOutlined, CommentOutlined, BulbOutlined, ExclamationCircleOutlined,
  LeftOutlined, RightOutlined, DownOutlined, PlayCircleOutlined,
  FileWordOutlined, FileMarkdownOutlined,
  PlusOutlined, StarOutlined,
  SendOutlined, LockOutlined, UnlockOutlined, HistoryOutlined,
  ClockCircleOutlined, CloseOutlined, UploadOutlined, SnippetsOutlined,
} from '@ant-design/icons';
import { WeeklyReport, User, SYSTEM_USERS, DEPTS, SORTED_DEPTS, sortByDeptOrder, Comment, TaskItem } from './types';
import {
  getCurrentUser, getReport, getReports, saveReport,
  canEditDept, genId, initDemoData, getPrevWeekReport, parsePlanToTasks, DEFAULT_WEEK,
  hasPermission, isSuperAdmin,
  formatWeekLabel, getReportsByWeek, getDynamicWeekOptions, getNextWeekLabel,
  getCurrentFridayWeekLabel, getPrevWeekLabel,
  flattenTasks, deleteTaskFromTree, updateTaskInTree, findTaskInTree, parseNextPlan,
  formatTaskNodeForExport, reportHasContent,
  fetchReportDetail, submitReportApi, createNextWeekGlobally, deleteWeekReports,
  addCommentApi, addReplyApi, deleteCommentApi, deleteReplyApi, toggleResolvedApi,
  loadDraft, saveDraft, clearDraft, applyDraftToReport,
  WeeklyReportDraft, isFrozenWeek, isWeekInRecycleBin,
} from './data';
import { getApiBaseUrl, getAppBasePath } from '../../config/app';
import { requestAiSummary, requestGlobalAnalysis } from '../../services/ai';
import { suggestionApi } from '../../services/api';
import './styles.css';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import ImportReportsModal from './ImportReportsModal';
import ParseBlockModal from './ParseBlockModal';
import SubmissionDiffView from './SubmissionDiffView';
import { mergeReports, ConflictItem } from './merge';
import MergeConflictModal from './MergeConflictModal';
import TaskTree from './TaskTree';
import { buildHighlightRanges } from './comment-highlights';

/**
 * 根据批注区间渲染 textarea 上方的透明高亮覆盖层。
 * 仅返回 hasOverlay=true 当存在有效高亮区间；否则返回原文本，避免额外 DOM。
 */
function buildHighlightOverlay(
  value: string,
  blockKey: 'content' | 'nextPlan' | 'thoughts' | 'other',
  comments: Comment[],
  activeCommentId: string | null,
  hoveredCommentIds: string[],
  setHoveredCommentIds: (ids: string[]) => void,
  setActiveCommentId: (id: string | null) => void
): { hasOverlay: boolean; nodes: React.ReactNode } {
  const ranges = buildHighlightRanges(value, comments, blockKey);
  if (ranges.length === 0) {
    return { hasOverlay: false, nodes: value };
  }

  const result: React.ReactNode[] = [];
  let lastEnd = 0;
  for (const r of ranges) {
    if (r.start > lastEnd) {
      result.push(<span key={`pre-${lastEnd}`}>{value.slice(lastEnd, r.start)}</span>);
    }
    const part = value.slice(r.start, r.end);
    const isActive = activeCommentId ? r.commentIds.includes(activeCommentId) : false;
    const isHovered = r.commentIds.some(id => hoveredCommentIds.includes(id));
    result.push(
      <mark
        key={`match-${r.start}`}
        data-comment-ids={r.commentIds.join(',')}
        style={{
          backgroundColor: isActive || isHovered ? 'rgba(255, 236, 61, 0.35)' : 'transparent',
          color: 'transparent',
          borderRadius: 2,
          borderBottom: '2px solid #fa8c16',
          pointerEvents: 'auto',
          cursor: 'pointer',
          transition: 'background-color 0.15s ease',
        }}
        onMouseEnter={() => setHoveredCommentIds(r.commentIds)}
        onMouseLeave={() => setHoveredCommentIds([])}
        onClick={e => {
          e.stopPropagation();
          setActiveCommentId(r.commentIds[0] || null);
        }}
      >{part}</mark>
    );
    lastEnd = r.end;
  }
  if (lastEnd < value.length) {
    result.push(<span key={`post-${lastEnd}`}>{value.slice(lastEnd)}</span>);
  }
  return { hasOverlay: true, nodes: result };
}

// 渲染提交快照中的只读任务树
const renderSnapshotTask = (task: TaskItem, depth = 0) => (
  <div key={task.id} style={{ paddingLeft: depth * 20, marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
    <Checkbox checked={task.checked} disabled style={{ marginTop: 2, flexShrink: 0 }} />
    <div style={{ flex: 1 }}>
      <span style={{
        textDecoration: task.checked ? 'line-through' : 'none',
        color: task.checked ? '#999' : '#333',
        fontWeight: depth === 0 ? 500 : 'normal',
        fontSize: 14,
        lineHeight: 1.6,
      }}>
        {task.text}
      </span>
      {task.children && task.children.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {task.children.map(child => renderSnapshotTask(child, depth + 1))}
        </div>
      )}
    </div>
  </div>
);

const { Header, Content } = Layout;
const { TextArea } = Input;
const { Title, Text } = Typography;


// 提取 @mention 的用户 ID
function extractMentions(text: string): string[] {
  const matches = text.match(/@([^\s]+)/g);
  if (!matches) return [];
  return matches
    .map(m => SYSTEM_USERS.find(u => m === `@${u.name}` || m === `@${u.id}`))
    .filter(Boolean)
    .map(u => u!.id);
}

// 激活时在被评论文本与右侧评论块之间绘制视觉连线
function CommentConnector({ activeCommentId }: { activeCommentId: string | null }) {
  const [path, setPath] = useState<string>('');

  useLayoutEffect(() => {
    if (!activeCommentId) {
      setPath('');
      return;
    }
    const update = () => {
      const targetEl = document.querySelector(`[data-comment-ids*="${activeCommentId}"]`) as HTMLElement | null;
      const cardEl = document.querySelector(`[data-comment-card-id="${activeCommentId}"]`) as HTMLElement | null;
      if (!targetEl || !cardEl) {
        setPath('');
        return;
      }
      const t = targetEl.getBoundingClientRect();
      const c = cardEl.getBoundingClientRect();
      const x1 = t.right;
      const y1 = t.top + t.height / 2;
      const x2 = c.left;
      const y2 = c.top + c.height / 2;
      const cp1x = x1 + Math.min(60, (x2 - x1) / 2);
      const cp2x = x2 - Math.min(60, (x2 - x1) / 2);
      setPath(`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`);
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [activeCommentId]);

  if (!activeCommentId || !path) return null;
  return (
    <svg
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      <path d={path} fill="none" stroke="#fa8c16" strokeWidth={1} strokeDasharray="4 2" opacity={0.7} />
    </svg>
  );
}

// 生成报告内容摘要，用于草稿恢复弹窗对比展示，直接显示具体文本片段
function summarizeReportContent(r: WeeklyReport | null | undefined): string {
  if (!r) return '暂无内容';
  const MAX_LEN = 30;
  const truncate = (s: string) => {
    const t = s?.trim() || '';
    return t.length > MAX_LEN ? t.slice(0, MAX_LEN) + '…' : t;
  };
  const parts: string[] = [];
  const firstContent = r.content?.[0]?.text;
  if (firstContent) parts.push(`本周工作：${truncate(firstContent)}`);
  const nextTasks = parseNextPlan(r.nextPlan);
  const firstNext = nextTasks[0]?.text;
  if (firstNext) parts.push(`下周计划：${truncate(firstNext)}`);
  if (r.other?.trim()) parts.push(`问题与风险：${truncate(r.other)}`);
  if (r.thoughts?.trim()) parts.push(`本周心得：${truncate(r.thoughts)}`);
  return parts.join('；') || '暂无内容';
}

// 记录行为日志（统一带上 JWT Token）
function recordActionLog(payload: {
  action: string;
  targetType: string;
  targetId: string;
  targetDesc: string;
  details?: any;
}) {
  const token = localStorage.getItem('auth-token');
  fetch(`${getApiBaseUrl()}/admin/action-logs/record`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || ''}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

const BLOCK_CONFIG = [
  { key: 'content', title: '本周工作内容', color: '#1890ff', icon: <FileTextOutlined /> },
  { key: 'nextPlan', title: '下周工作计划', color: '#52c41a', icon: <CalendarOutlined /> },
  { key: 'other', title: '问题与风险', color: '#cf1322', icon: <ExclamationCircleOutlined /> },
  { key: 'thoughts', title: '其他', color: '#722ed1', icon: <BulbOutlined /> },
] as const;

// AI 全局分析默认提示词模板（{tableRows} 和 {deptDetails} 由后端/前端替换为实际数据）
const DEFAULT_GLOBAL_ANALYSIS_PROMPT_TEMPLATE = `你是一位数据部门的高级管理顾问，擅长周报全局分析与战略洞察。

请对以下所有科室的周报进行全局分析，输出格式必须严格遵循以下 Markdown 格式（不要添加代码块标记）：

# {baseWeekLabel} 周报全局分析

## 一、各科室完成度与偏离度

| 科室 | 偏离度 | 核心判断 |
|------|--------|----------|
{tableRows}

## 二、{focusStartWeekLabel}→{baseWeekLabel} 重点工作整体推进

[请分析从{focusStartWeekLabel}至今的重点工作推进情况，每个重点工作一段，格式如：**工作名称**：进展描述。]

## 三、{baseWeekLabel}「三句话关键结论」

**本周相对本周计划**：[分析本周实际完成情况与计划的对比]

**{focusStartWeekLabel} 以来阶段主线**：[总结从{focusStartWeekLabel}以来的主要工作主线和变化趋势]

**盯盘清单**：[列出需要重点关注的科室和事项]

---

**分析要求：**

1. **偏离度评判**：根据本周实际工作与"{compareWeekLabel}"下周计划的对比，评判为：绿、绿黄、黄、黄红、红 五档
   - 绿：完全按计划推进，无偏离
   - 绿黄：基本按计划，有轻微偏离
   - 黄：部分偏离，有未完成项
   - 黄红：明显偏离，多项未完成
   - 红：严重偏离，大部分未完成

2. **核心判断**：简要说明评判依据，指出完成的关键事项和未完成/延迟的事项

3. **重点工作推进**：识别跨科室的重点工作主线，分析整体推进情况

4. **三句话结论**：
   - 第一句：本周整体完成情况
   - 第二句：阶段性主线工作总结
   - 第三句：需要重点盯盘的科室和事项

**周报数据：**

{deptDetails}`;

function buildDefaultGaPrompt(baseWeek: string, compareWeek: string, focusStart: string): string {
  return DEFAULT_GLOBAL_ANALYSIS_PROMPT_TEMPLATE
    .replace(/\{baseWeekLabel\}/g, baseWeek)
    .replace(/\{compareWeekLabel\}/g, compareWeek)
    .replace(/\{focusStartWeekLabel\}/g, focusStart);
}

// 日期格式 weekLabel 辅助：解析 YYYYMMDD 为 Date
function parseDateLabel(label: string): Date | null {
  if (!/^\d{8}$/.test(label)) return null;
  const y = parseInt(label.slice(0, 4));
  const m = parseInt(label.slice(4, 6)) - 1;
  const d = parseInt(label.slice(6, 8));
  return new Date(y, m, d);
}

const WeeklyReportV2: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentUser] = useState<User>(getCurrentUser());
  // 从 URL query 参数初始化周次和部门（支持从通知消息跳转）
  const urlWeek = searchParams.get('weekLabel');
  const urlDept = searchParams.get('dept');
  const [selectedWeek, setSelectedWeek] = useState(
    urlWeek && /^\d{8}$/.test(urlWeek) ? urlWeek : DEFAULT_WEEK
  );
  // 允许所有用户选择任何部门查看，默认显示自己的部门
  // 如果用户部门不在 DEPTS 中（如总经理室），默认显示第一个有数据的部门
  const [selectedDept, setSelectedDept] = useState(
    urlDept && DEPTS.includes(urlDept) ? urlDept : (DEPTS.includes(currentUser.dept) ? currentUser.dept : DEPTS[0])
  );

  // 监听 URL 参数变化（支持从通知消息跳转，即使用户已在当前页面）
  useEffect(() => {
    const week = searchParams.get('weekLabel');
    const dept = searchParams.get('dept');
    // 回收站中的周期不可选中（避免跳转到已删周期导致空白页+自动保存报错）
    if (week && /^\d{8}$/.test(week) && !isWeekInRecycleBin(week)) {
      setSelectedWeek(week);
    }
    if (dept && DEPTS.includes(dept)) {
      setSelectedDept(dept);
    }
    // 清除 URL 参数避免刷新时再次跳回
    if (week || dept) {
      setSearchParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [nextPlanTasks, setNextPlanTasks] = useState<TaskItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [globalAnalysisLoading, setGlobalAnalysisLoading] = useState(false);
  const [globalAnalysisResult, setGlobalAnalysisResult] = useState<string>('');
  const [globalAnalysisWeek, setGlobalAnalysisWeek] = useState<string>(selectedWeek);
  const [newComment, setNewComment] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionTarget, setMentionTarget] = useState<'comment' | 'reply'>('comment');
  const [commentCollapsed, setCommentCollapsed] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [weekOptions, setWeekOptions] = useState<string[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);
  const isUserEditingRef = useRef(false);
  const baseReportRef = useRef<WeeklyReport | null>(null);
  const [selPopup, setSelPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
    block: 'content' | 'nextPlan' | 'thoughts' | 'other';
    taskId: string;
    start: number;
    end: number;
    drafting: boolean;
  }>({ visible: false, x: 0, y: 0, text: '', block: 'nextPlan', taskId: '', start: 0, end: 0, drafting: false });
  const [hoveredCommentIds, setHoveredCommentIds] = useState<string[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const commentListRef = useRef<HTMLDivElement>(null);
  const commentCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [commentPositions, setCommentPositions] = useState<Record<string, number>>({});
  const listMinHeight = useMemo(() => {
    const maxTop = Math.max(0, ...Object.values(commentPositions));
    return maxTop + 200;
  }, [commentPositions]);

  // 提交/截止相关状态
  const [deadlineRemaining, setDeadlineRemaining] = useState<number | null>(null);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [deadlineTime, setDeadlineTime] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [adminUnlock, setAdminUnlock] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [lastSubmissionOpen, setLastSubmissionOpen] = useState(false);
  const [submissionHistoryMode, setSubmissionHistoryMode] = useState<'history' | 'diff'>('history');
  const [nowTime, setNowTime] = useState(new Date());

  // 新建周报弹窗状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createDate, setCreateDate] = useState<dayjs.Dayjs | null>(null);
  const [createTime, setCreateTime] = useState<dayjs.Dayjs | null>(null);

  // 删除周报周期弹窗状态
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteWeekLabel, setDeleteWeekLabel] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  // 栏级整段解析：目标栏（本周 content / 下周 nextPlan × 重点/常规）
  const [parseBlockTarget, setParseBlockTarget] = useState<{ block: 'content' | 'nextPlan'; highlighted: boolean } | null>(null);
  // 根任务级整段解析：解析结果作为目标根任务的子任务
  const [parseIntoTarget, setParseIntoTarget] = useState<{ block: 'content' | 'nextPlan'; taskId: string } | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeDraft, setMergeDraft] = useState<WeeklyReport | null>(null);
  const [mergeConflicts, setMergeConflicts] = useState<ConflictItem[]>([]);
  const mergeForSubmitRef = useRef(true); // true: 合并后提交；false: 合并后仅保存

  // 本地草稿恢复弹窗
  const [draftRecoveryOpen, setDraftRecoveryOpen] = useState(false);
  const [draftRecoveryDraft, setDraftRecoveryDraft] = useState<WeeklyReportDraft | null>(null);
  // 服务端已有更新提示条
  const [staleAlert, setStaleAlert] = useState(false);
  // 自动保存冲突暂停状态
  const [autoSavePaused, setAutoSavePaused] = useState(false);
  const autoSaveConflictServerRef = useRef<WeeklyReport | null>(null);

  // AI 全局分析弹窗状态
  const [globalAnalysisModalOpen, setGlobalAnalysisModalOpen] = useState(false);
  const [gaBaseWeek, setGaBaseWeek] = useState(selectedWeek);
  const [gaCompareWeek, setGaCompareWeek] = useState(getPrevWeekLabel(selectedWeek) || selectedWeek);
  const [gaFocusStart, setGaFocusStart] = useState('20260313');
  const [gaPrompt, setGaPrompt] = useState('');
  const gaPromptDirtyRef = useRef(false);

  // 优化建议弹窗状态
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionContent, setSuggestionContent] = useState('');
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false);

  // 初始化 demo 数据
  useEffect(() => {
    initDemoData().then(() => {
      const dynamicOptions = getDynamicWeekOptions();

      setWeekOptions(dynamicOptions);
      setDataLoaded(true);
      // URL 指定的周期有效且未被删除时优先（支持通知消息跳转）；
      // 回收站中的周期一律不可选中
      if (urlWeek && /^\d{8}$/.test(urlWeek) && !isWeekInRecycleBin(urlWeek)) {
        setSelectedWeek(urlWeek);
        return;
      }
      // 默认选中当前周（今天所在周的周五）；若当前周已被删除（在回收站中），
      // 回退到最近的可选周期，避免选中已删周期导致空白页+自动保存报错
      const currentWeek = getCurrentFridayWeekLabel();
      if (dynamicOptions.includes(currentWeek)) {
        setSelectedWeek(currentWeek);
      } else {
        // 选项按日期倒序：优先选最近一个不大于当前周的周期，没有再选最新周期
        setSelectedWeek(dynamicOptions.find(w => w <= currentWeek) || dynamicOptions[0] || currentWeek);
      }
    }).catch(() => {
      message.error('无法加载周报数据，请检查后端服务是否正常运行');
    });
  // eslint-disable-next-line react-hooks-exhaustive-deps
  }, []);

  // 点击外部关闭批注弹窗（但点击批注输入框自身时不关闭）
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('.comment-draft-popup') ||
        target.closest('.ant-btn') ||
        target.closest('.ant-input-textarea')
      ) {
        return;
      }
      setSelPopup(prev => prev.visible ? { ...prev, visible: false, drafting: false } : prev);
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  // 计算是否可编辑：基于权限 + 作者归属 + 后端截止/锁定状态
  const editable = useMemo(() => {
    // 超级管理员始终可编辑
    if (isSuperAdmin(currentUser)) return true;
    // 没有编辑权限
    if (!hasPermission(currentUser, 'EDIT_REPORT')) return false;
    // 历史周报已锁定（除非有 EDIT_HISTORY 权限）
    if (report?.locked && !hasPermission(currentUser, 'EDIT_HISTORY')) return false;
    const baseEdit = canEditDept(currentUser, selectedDept);
    if (!baseEdit) return false;
    // Admin unlock overrides deadline
    if (adminUnlock) return true;
    // Deadline check（有 EDIT_AFTER_DEADLINE 权限可绕过）
    if (deadlinePassed && !hasPermission(currentUser, 'EDIT_AFTER_DEADLINE')) return false;
    return true;
  }, [currentUser, selectedDept, adminUnlock, deadlinePassed, report]);

  // 自动保存：仅当用户真实编辑后才延迟保存
  useEffect(() => {
    if (!report || !editable) return;

    // 跳过初始加载时的保存
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    // 非用户编辑导致的变化（轮询合并 comments、submissions 等）不触发保存
    if (!isUserEditingRef.current) return;

    // 冲突未处理前暂停自动保存，避免反复全量合并造成卡顿
    if (autoSavePaused) return;

    // 空数据不触发保存，避免污染后端
    if (!reportHasContent({ ...report, nextPlan: JSON.stringify(nextPlanTasks) } as WeeklyReport)) return;

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 设置新的定时器，1秒后自动保存
    autoSaveTimerRef.current = setTimeout(() => {
      isUserEditingRef.current = false;
      const reportToSave = { ...report, nextPlan: JSON.stringify(nextPlanTasks) };
      setSaving(true);
      saveReport(reportToSave)?.then(() => {
        setSaving(false);
        // 保存成功后清理本地草稿并恢复自动保存
        clearDraft(currentUser.id, reportToSave.weekLabel, reportToSave.dept);
        setAutoSavePaused(false);
        // 同步后端返回的最新时间戳到本地状态，避免后续保存因 updatedAt 不一致被拒绝
        const saved = getReport(reportToSave.weekLabel, reportToSave.dept);
        if (saved) {
          setReport(prev => prev ? { ...prev, updatedAt: saved.updatedAt } : prev);
          baseReportRef.current = JSON.parse(JSON.stringify(saved));
        }
        // 自动同步到下一周
        syncNextWeek(reportToSave);
      }).catch((e: any) => {
        setSaving(false);
        console.error('自动保存失败:', e);
        if (e.code === 'CONFLICT' || e.message?.includes('已被其他用户更新')) {
          // 暂停自动保存，避免反复全量合并；把冲突留给用户主动处理
          const serverReport = e.report;
          if (serverReport && baseReportRef.current) {
            autoSaveConflictServerRef.current = serverReport;
            setAutoSavePaused(true);
          } else {
            setStaleAlert(true);
          }
        } else {
          const detail = e.reason ? `\n诊断: ${e.reason}` : '';
          message.error('自动保存失败: ' + (e.message || '未知错误') + detail, 6);
        }
      });
    }, 1000);

    // 清理函数
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [report, editable, autoSavePaused, nextPlanTasks, currentUser.id]);

  // 切换标签页/隐藏时强制保存（仅保存真实用户编辑；冲突暂停期间不再反复保存）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && report && editable && isUserEditingRef.current && !autoSavePaused) {
        const reportToSave = { ...report, nextPlan: JSON.stringify(nextPlanTasks) };
        if (reportHasContent(reportToSave)) {
          saveReport(reportToSave)?.catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [report, editable, currentUser, autoSavePaused, nextPlanTasks]);

  // 本地草稿：用户真实编辑后持久化到 localStorage，防止刷新/退出丢失
  const draftTimerRef = useRef<number | null>(null);
  const saveCurrentDraft = useCallback(() => {
    if (!report) return;
    const reportToSave = { ...report, nextPlan: JSON.stringify(nextPlanTasks) };
    if (!reportHasContent(reportToSave)) return;
    saveDraft({
      userId: currentUser.id,
      weekLabel: report.weekLabel,
      dept: report.dept,
      baseUpdatedAt: baseReportRef.current?.updatedAt,
      savedAt: Date.now(),
      report: reportToSave,
    });
  }, [report, nextPlanTasks, currentUser.id]);

  useEffect(() => {
    if (!report || !isUserEditingRef.current) return;
    // 跳过初始加载导致的同步，避免无意义草稿
    if (isInitialLoadRef.current) return;

    // 延长 debounce 到 3 秒，减少 localStorage 同步写入频率，缓解输入卡顿
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      saveCurrentDraft();
    }, 3000);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [report, nextPlanTasks, currentUser.id, saveCurrentDraft]);

  // 关闭/刷新/切换标签页前同步写入草稿，确保关键时刻不丢内容
  useEffect(() => {
    const handleBeforeUnload = () => saveCurrentDraft();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveCurrentDraft();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveCurrentDraft]);

  // 切换部门时保留当前周次，不再自动跳转
  // 用户如需查看该部门有数据的周，可手动在顶部周次下拉框选择

  // 切换周次/部门时初始化下周工作计划任务树
  useEffect(() => {
    if (report) {
      setNextPlanTasks(parseNextPlan(report.nextPlan));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.weekLabel, report?.dept]);

  // 下周工作计划任务树变化时同步回 report.nextPlan
  useEffect(() => {
    if (!report) return;
    const json = JSON.stringify(nextPlanTasks);
    if (report.nextPlan !== json) {
      handleChange('nextPlan', json);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPlanTasks]);

  // 从后端加载截止时间和提交状态
  useEffect(() => {
    let timer: number;
    const loadMeta = async () => {
      const detail = await fetchReportDetail(selectedWeek, selectedDept);
      if (detail) {
        setDeadlineRemaining(detail.deadlineRemaining ?? null);
        setDeadlinePassed(detail.deadlinePassed ?? false);
        setDeadlineTime(detail.deadlineTime ?? null);
        setSubmissions(detail.submissions || []);
        setReport(prev => prev ? { ...prev, submissions: detail.submissions || [] } : prev);
        setAdminUnlock(detail.adminUnlock ?? false);
        // 合并后端新评论到本地（按 id 去重，不覆盖本地已存在的评论）
        // 注意：这里不设置 isUserEditingRef，所以不会触发自动保存
        if (detail.comments && detail.comments.length > 0) {
          setReport(prev => {
            if (!prev || prev.weekLabel !== selectedWeek || prev.dept !== selectedDept) return prev;
            const localIds = new Set(prev.comments.map(c => c.id));
            const newComments = detail.comments!.filter(c => !localIds.has(c.id));
            if (newComments.length === 0) return prev;
            return { ...prev, comments: [...prev.comments, ...newComments] };
          });
        }
      } else {
        // No report on backend yet: compute deadline locally
        const now = new Date();
        const date = parseDateLabel(selectedWeek);
        if (date) {
          const deadline = new Date(date);
          deadline.setHours(20, 0, 0, 0); // 与后端默认逻辑一致：周五（weekLabel）当天 20:00
          const diff = Math.floor((deadline.getTime() - now.getTime()) / 1000);
          setDeadlineRemaining(diff > 0 ? diff : -1);
          setDeadlinePassed(diff <= 0);
          setDeadlineTime(toLocalIso(deadline));
        }
        setSubmissions([]);
        setAdminUnlock(false);
      }
    };
    loadMeta();
    // Update countdown every hour
    timer = window.setInterval(loadMeta, 3600000);
    return () => clearInterval(timer);
  }, [selectedWeek, selectedDept]);

  // 计算右侧评论块应处的垂直位置：跟随被评论文本，并在文本滚出视口时吸附到顶部/底部
  const computeCommentPositions = useCallback(() => {
    if (!commentListRef.current) return;
    const container = commentListRef.current;
    const containerRect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    const viewportH = window.innerHeight;
    const clientH = container.clientHeight;
    const allComments = report?.comments || [];

    const cards = allComments.map(c => {
      const cardEl = commentCardRefs.current[c.id];
      const height = cardEl?.offsetHeight || 80;
      if (!c.targetText) {
        return { id: c.id, desiredTop: -1, group: 'in' as const, height };
      }
      const targetEl = document.querySelector(`[data-comment-ids*="${c.id}"]`) as HTMLElement | null;
      if (!targetEl) {
        return { id: c.id, desiredTop: -1, group: 'in' as const, height };
      }
      const rect = targetEl.getBoundingClientRect();
      const desiredTop = rect.top - containerRect.top + scrollTop;
      let group: 'above' | 'in' | 'below';
      if (rect.bottom < 0) group = 'above';
      else if (rect.top > viewportH) group = 'below';
      else group = 'in';
      return { id: c.id, desiredTop, group, height };
    });

    const positions: Record<string, number> = {};
    const above = cards.filter(c => c.group === 'above').sort((a, b) => a.desiredTop - b.desiredTop);
    const below = cards.filter(c => c.group === 'below').sort((a, b) => a.desiredTop - b.desiredTop);
    const inside = cards.filter(c => c.group === 'in').sort((a, b) => a.desiredTop - b.desiredTop);

    above.forEach((c, i) => { positions[c.id] = scrollTop + i * 12; });
    below.reverse().forEach((c, i) => { positions[c.id] = scrollTop + clientH - c.height - i * 12; });

    for (let i = 0; i < inside.length; i++) {
      const c = inside[i];
      let top = c.desiredTop;
      if (i > 0) {
        const prev = inside[i - 1];
        const prevTop = positions[prev.id];
        if (top < prevTop + prev.height + 8) {
          top = prevTop + prev.height + 8;
        }
      }
      positions[c.id] = top;
    }

    setCommentPositions(positions);
  }, [report?.comments]);

  useLayoutEffect(() => {
    computeCommentPositions();
  }, [computeCommentPositions]);

  useEffect(() => {
    const onScroll = () => computeCommentPositions();
    const onResize = () => computeCommentPositions();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [computeCommentPositions]);

  // ESC 或点击非评论区域取消激活高亮
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveCommentId(null);
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-comment-ids]') && !target.closest('[data-comment-card-id]')) {
        setActiveCommentId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  // 后台定期同步正文：发现服务端更新且本地有未保存编辑时提示用户
  useEffect(() => {
    if (!editable) return;
    const syncContent = async () => {
      try {
        const server = await fetchReportDetail(selectedWeek, selectedDept);
        if (!server || !baseReportRef.current) return;
        if (server.updatedAt !== baseReportRef.current.updatedAt) {
          setStaleAlert(true);
        }
      } catch {
        // ignore
      }
    };
    const timer = window.setInterval(syncContent, 30000);
    // 页面重新可见时立即检查一次
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncContent();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [selectedWeek, selectedDept, editable]);

  // 实时时钟：每秒更新显示，但后端数据每小时拉一次
  useEffect(() => {
    const clockTimer = window.setInterval(() => setNowTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // 加载周报
  useEffect(() => {
    // 切换周报时重置初始加载标记和编辑标记
    isInitialLoadRef.current = true;
    isUserEditingRef.current = false;
    setStaleAlert(false);
    setAutoSavePaused(false);
    autoSaveConflictServerRef.current = null;

    const found = getReport(selectedWeek, selectedDept);
    let initialReport: WeeklyReport;
    if (found) {
      initialReport = found;
    } else {
      // 获取上周计划，自动填充为本周任务列表
      const prevReport = getPrevWeekReport(selectedWeek, selectedDept);
      const defaultTasks = prevReport ? parsePlanToTasks(prevReport.nextPlan) : [];
      // 创建新周报
      initialReport = {
        id: genId(),
        weekLabel: selectedWeek,
        dept: selectedDept,
        authorId: currentUser.id,
        authorName: currentUser.name,
        plan: prevReport ? prevReport.nextPlan : '',
        content: defaultTasks,
        currentWork: prevReport ? prevReport.nextPlan : '',
        nextPlan: '',
        thoughts: '',
        other: '',
        comments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // 检查本地草稿
    const draft = loadDraft(currentUser.id, selectedWeek, selectedDept);
    const hasDraftContent = draft && reportHasContent({ ...draft.report, nextPlan: JSON.stringify(parseNextPlan(draft.report.nextPlan)) } as WeeklyReport);
    const serverUpdatedAt = initialReport.updatedAt;
    const draftIsNewer = hasDraftContent && (
      !serverUpdatedAt ||
      draft.savedAt > new Date(serverUpdatedAt).getTime() ||
      draft.baseUpdatedAt !== serverUpdatedAt
    );

    if (draftIsNewer) {
      // 先展示服务端版本，弹出恢复提示
      setReport(initialReport);
      setNextPlanTasks(parseNextPlan(initialReport.nextPlan));
      baseReportRef.current = JSON.parse(JSON.stringify(initialReport));
      setDraftRecoveryDraft(draft);
      setDraftRecoveryOpen(true);
    } else {
      // 草稿不存在或已过期，直接采用服务端版本并清理
      if (draft) {
        clearDraft(currentUser.id, selectedWeek, selectedDept);
      }
      setReport(initialReport);
      setNextPlanTasks(parseNextPlan(initialReport.nextPlan));
      baseReportRef.current = JSON.parse(JSON.stringify(initialReport));
    }
  }, [selectedWeek, selectedDept, currentUser, dataLoaded]);

  const handleChange = useCallback((field: keyof WeeklyReport, value: any) => {
    isUserEditingRef.current = true;
    setReport(prev => prev ? { ...prev, [field]: value } : prev);
  }, []);

  const refreshCurrentReport = useCallback(() => {
    const found = getReport(selectedWeek, selectedDept);
    if (found) {
      setReport(found);
      setNextPlanTasks(parseNextPlan(found.nextPlan));
    }
  }, [selectedWeek, selectedDept]);

  // 同步当前周的下周工作计划到下一周的本周工作内容
  const syncNextWeek = useCallback((currentReport: WeeklyReport) => {
    const nextWeekLabel = getNextWeekLabel(currentReport.weekLabel);
    const nextWeekReport = getReport(nextWeekLabel, currentReport.dept);
    if (nextWeekReport) {
      const nextPlanTasks = parseNextPlan(currentReport.nextPlan);
      const updatedNextWeek: WeeklyReport = {
        ...nextWeekReport,
        content: JSON.parse(JSON.stringify(nextPlanTasks)),
        currentWork: currentReport.nextPlan,
        plan: currentReport.nextPlan,
        updatedAt: new Date().toISOString(),
      };
      saveReport(updatedNextWeek);
    }
  }, []);

  // 提交周报（带三向合并/冲突检测）
  const handleSubmit = useCallback(async () => {
    if (!report) return;
    setSubmitLoading(true);

    const userReport: WeeklyReport = { ...report, nextPlan: JSON.stringify(nextPlanTasks) };

    try {
      const serverReport = await fetchReportDetail(report.weekLabel, report.dept);
      const base = baseReportRef.current || userReport;

      if (!serverReport || serverReport.updatedAt === base.updatedAt) {
        // 服务端未被他人更新，直接保存
        await saveReport(userReport);
      } else {
        const { report: merged, conflicts } = mergeReports(base, userReport, serverReport);
        if (conflicts.length > 0) {
          setMergeDraft(merged);
          setMergeConflicts(conflicts);
          mergeForSubmitRef.current = true;
          setMergeModalOpen(true);
          setSubmitLoading(false);
          return;
        }
        await saveReport(merged);
      }

      // 更新 base 快照为保存后的版本
      const saved = getReport(report.weekLabel, report.dept);
      if (saved) {
        baseReportRef.current = JSON.parse(JSON.stringify(saved));
        setReport(prev => prev ? { ...prev, updatedAt: saved.updatedAt, submissions: saved.submissions } : prev);
      }

      const result = await submitReportApi(report.weekLabel, report.dept);
      if (result.success) {
        message.success('提交成功');
        const detail = await fetchReportDetail(report.weekLabel, report.dept);
        if (detail) {
          setSubmissions(detail.submissions || []);
          setReport(prev => prev ? { ...prev, submissions: detail.submissions || [] } : prev);
          setDeadlineRemaining(detail.deadlineRemaining ?? null);
          setDeadlinePassed(detail.deadlinePassed ?? false);
          setDeadlineTime(detail.deadlineTime ?? null);
        }
      } else {
        const detail = result.reason ? `\n诊断: ${result.reason}` : '';
        message.error((result.message || '提交失败') + detail, 6);
      }
    } catch (e: any) {
      const detail = e.reason ? `\n诊断: ${e.reason}` : '';
      message.error('提交失败: ' + (e.message || '未知错误') + detail, 6);
    } finally {
      setSubmitLoading(false);
    }
  }, [report, nextPlanTasks]);

  const handleResolveMerge = useCallback(async (resolved: WeeklyReport) => {
    setMergeModalOpen(false);
    setSubmitLoading(true);
    try {
      await saveReport(resolved);
      const saved = getReport(resolved.weekLabel, resolved.dept);
      if (saved) {
        baseReportRef.current = JSON.parse(JSON.stringify(saved));
        setReport(prev => prev ? { ...prev, updatedAt: saved.updatedAt, submissions: saved.submissions } : prev);
      }
      clearDraft(currentUser.id, resolved.weekLabel, resolved.dept);
      setAutoSavePaused(false);
      autoSaveConflictServerRef.current = null;

      if (mergeForSubmitRef.current) {
        const result = await submitReportApi(resolved.weekLabel, resolved.dept);
        if (result.success) {
          message.success('提交成功');
          const detail = await fetchReportDetail(resolved.weekLabel, resolved.dept);
          if (detail) {
            setSubmissions(detail.submissions || []);
            setReport(prev => prev ? { ...prev, submissions: detail.submissions || [] } : prev);
            setDeadlineRemaining(detail.deadlineRemaining ?? null);
            setDeadlinePassed(detail.deadlinePassed ?? false);
            setDeadlineTime(detail.deadlineTime ?? null);
          }
        } else {
          const detail = result.reason ? `\n诊断: ${result.reason}` : '';
          message.error((result.message || '提交失败') + detail, 6);
        }
      } else {
        message.success('合并保存成功');
      }
    } catch (e: any) {
      const detail = e.reason ? `\n诊断: ${e.reason}` : '';
      message.error((mergeForSubmitRef.current ? '提交' : '保存') + '失败: ' + (e.message || '未知错误') + detail, 6);
    } finally {
      setSubmitLoading(false);
    }
  }, [currentUser.id]);

  // 草稿恢复：将草稿中的用户编辑字段合并到当前报告，保留服务端元数据
  const handleRecoverDraft = useCallback(() => {
    if (!draftRecoveryDraft || !report) return;
    const recovered = applyDraftToReport(report, draftRecoveryDraft.report);
    setReport(recovered);
    setNextPlanTasks(parseNextPlan(recovered.nextPlan));
    isUserEditingRef.current = true;
    setDraftRecoveryOpen(false);
    setDraftRecoveryDraft(null);
    message.success('已恢复本地编辑');
  }, [draftRecoveryDraft, report]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft(currentUser.id, selectedWeek, selectedDept);
    setDraftRecoveryOpen(false);
    setDraftRecoveryDraft(null);
  }, [currentUser.id, selectedWeek, selectedDept]);

  // 服务端有更新时：拉取最新版并做三向合并
  const handleStaleMerge = useCallback(async () => {
    if (!report || !baseReportRef.current) return;
    setStaleAlert(false);
    setSubmitLoading(true);
    try {
      const serverReport = await fetchReportDetail(report.weekLabel, report.dept);
      if (!serverReport) return;
      const userReport: WeeklyReport = { ...report, nextPlan: JSON.stringify(nextPlanTasks) };
      const { report: merged, conflicts } = mergeReports(baseReportRef.current, userReport, serverReport);
      if (conflicts.length > 0) {
        setMergeDraft(merged);
        setMergeConflicts(conflicts);
        mergeForSubmitRef.current = false;
        setMergeModalOpen(true);
      } else {
        await saveReport(merged);
        const saved = getReport(merged.weekLabel, merged.dept);
        if (saved) {
          baseReportRef.current = JSON.parse(JSON.stringify(saved));
          setReport(prev => prev ? { ...prev, updatedAt: saved.updatedAt, submissions: saved.submissions } : prev);
          setNextPlanTasks(parseNextPlan(saved.nextPlan));
        }
        clearDraft(currentUser.id, merged.weekLabel, merged.dept);
        message.success('已同步最新内容');
      }
    } catch (e: any) {
      message.error('同步失败: ' + (e.message || '未知错误'));
    } finally {
      setSubmitLoading(false);
    }
  }, [report, nextPlanTasks, currentUser.id]);

  // 处理自动保存冲突：弹出合并弹窗或自动合并保存
  const handleResolveAutoSaveConflict = useCallback(async () => {
    const serverReport = autoSaveConflictServerRef.current;
    if (!serverReport || !baseReportRef.current || !report) return;
    setSubmitLoading(true);
    try {
      const userReport: WeeklyReport = { ...report, nextPlan: JSON.stringify(nextPlanTasks) };
      const { report: merged, conflicts } = mergeReports(baseReportRef.current, userReport, serverReport);
      if (conflicts.length > 0) {
        setMergeDraft(merged);
        setMergeConflicts(conflicts);
        mergeForSubmitRef.current = false;
        setMergeModalOpen(true);
      } else {
        await saveReport(merged);
        const saved = getReport(merged.weekLabel, merged.dept);
        if (saved) {
          baseReportRef.current = JSON.parse(JSON.stringify(saved));
          setReport(prev => prev ? { ...prev, updatedAt: saved.updatedAt, submissions: saved.submissions } : prev);
          setNextPlanTasks(parseNextPlan(saved.nextPlan));
        }
        clearDraft(currentUser.id, merged.weekLabel, merged.dept);
        setAutoSavePaused(false);
        autoSaveConflictServerRef.current = null;
        message.success('已同步并保存');
      }
    } catch (e: any) {
      message.error('同步失败: ' + (e.message || '未知错误'));
    } finally {
      setSubmitLoading(false);
    }
  }, [report, nextPlanTasks, currentUser.id]);

  // 本地 Date 转后端同款 ISO 本地时间字符串（如 2026-08-14T20:00:00）
  const toLocalIso = (d: Date): string => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
  };

  // 格式化截止时间用于展示：8月14日 周五 20:00
  const formatDeadlineText = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // 格式化倒计时
  const formatCountdown = (seconds: number): string => {
    if (seconds < 0) return '已截止';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}天${h}小时`;
    if (h > 0) return `${h}小时${m}分钟`;
    return `${m}分钟`;
  };



  // 级联勾选：toggle 父 → 所有子同步；所有子全选 → 父自动选
  const handleTaskToggle = useCallback((taskId: string) => {
    isUserEditingRef.current = true;
    setReport(prev => {
      if (!prev) return prev;

      // 判断节点及其所有后代是否全部选中
      const isFullyChecked = (task: TaskItem): boolean => {
        if (!task.children || task.children.length === 0) return task.checked;
        return task.checked && task.children.every(c => isFullyChecked(c));
      };

      // 递归设置节点及其所有后代的 checked 状态
      const setAllChecked = (task: TaskItem, checked: boolean): TaskItem => ({
        ...task,
        checked,
        children: task.children?.map(c => setAllChecked(c, checked)),
      });

      // 第一遍：找到目标节点并向下级联 toggle
      const cascadeDown = (tasks: TaskItem[]): TaskItem[] => {
        return tasks.map(t => {
          if (t.id === taskId) {
            return setAllChecked(t, !t.checked);
          }
          if (t.children) {
            return { ...t, children: cascadeDown(t.children) };
          }
          return t;
        });
      };

      const afterDown = cascadeDown(prev.content);

      // 第二遍：向上冒泡，重新计算所有父节点的 checked 状态
      const bubbleUp = (tasks: TaskItem[]): TaskItem[] => {
        return tasks.map(t => {
          if (!t.children || t.children.length === 0) return t;
          const updatedChildren = bubbleUp(t.children);
          const allChecked = updatedChildren.every(c => isFullyChecked(c));
          return { ...t, children: updatedChildren, checked: allChecked };
        });
      };

      return { ...prev, content: bubbleUp(afterDown) };
    });
  }, []);

  const handleTaskTextChange = useCallback((taskId: string, text: string) => {
    isUserEditingRef.current = true;
    setReport(prev => {
      if (!prev) return prev;
      return { ...prev, content: updateTaskInTree(prev.content, taskId, t => ({ ...t, text })) };
    });
  }, []);

  // 根任务框批量解析子任务：更新根任务文本并替换其 children
  const handleParseChildren = useCallback((taskId: string, rootText: string, children: TaskItem[]) => {
    isUserEditingRef.current = true;
    setReport(prev => {
      if (!prev) return prev;
      return { ...prev, content: updateTaskInTree(prev.content, taskId, t => ({ ...t, text: rootText, children })) };
    });
  }, []);

  const handleTaskHighlight = useCallback((taskId: string) => {
    isUserEditingRef.current = true;
    setReport(prev => {
      if (!prev) return prev;
      return { ...prev, content: updateTaskInTree(prev.content, taskId, t => ({ ...t, highlighted: !t.highlighted })) };
    });
  }, []);

  // ---------- 下周工作计划（nextPlan）任务树操作 ----------
  const handleNextPlanTaskToggle = useCallback((taskId: string) => {
    isUserEditingRef.current = true;
    setNextPlanTasks(prev => {
      const isFullyChecked = (task: TaskItem): boolean => {
        if (!task.children || task.children.length === 0) return task.checked;
        return task.checked && task.children.every(c => isFullyChecked(c));
      };
      const setAllChecked = (task: TaskItem, checked: boolean): TaskItem => ({
        ...task, checked, children: task.children?.map(c => setAllChecked(c, checked)),
      });
      const cascadeDown = (tasks: TaskItem[]): TaskItem[] => tasks.map(t => {
        if (t.id === taskId) return setAllChecked(t, !t.checked);
        if (t.children) return { ...t, children: cascadeDown(t.children) };
        return t;
      });
      const bubbleUp = (tasks: TaskItem[]): TaskItem[] => tasks.map(t => {
        if (!t.children || t.children.length === 0) return t;
        const updatedChildren = bubbleUp(t.children);
        const allChecked = updatedChildren.every(c => isFullyChecked(c));
        return { ...t, children: updatedChildren, checked: allChecked };
      });
      return bubbleUp(cascadeDown(prev));
    });
  }, []);

  const handleNextPlanTaskTextChange = useCallback((taskId: string, text: string) => {
    isUserEditingRef.current = true;
    setNextPlanTasks(prev => updateTaskInTree(prev, taskId, t => ({ ...t, text })));
  }, []);

  const handleNextPlanParseChildren = useCallback((taskId: string, rootText: string, children: TaskItem[]) => {
    isUserEditingRef.current = true;
    setNextPlanTasks(prev => updateTaskInTree(prev, taskId, t => ({ ...t, text: rootText, children })));
  }, []);

  const createTaskItem = useCallback((highlighted?: boolean): TaskItem => ({
    id: genId(),
    text: '',
    checked: false,
    highlighted,
    authorId: currentUser.id,
    authorName: currentUser.name,
  }), [currentUser]);

  const handleNextPlanAddTask = useCallback((parentId?: string, defaultHighlighted?: boolean) => {
    isUserEditingRef.current = true;
    setNextPlanTasks(prev => {
      let highlighted = defaultHighlighted;
      if (parentId) {
        const parent = findTaskInTree(prev, parentId);
        highlighted = parent?.highlighted ?? defaultHighlighted;
      }
      const newTask = createTaskItem(highlighted);
      if (!parentId) return [...prev, newTask];
      return updateTaskInTree(prev, parentId, t => ({
        ...t, children: [...(t.children || []), newTask],
      }));
    });
  }, [createTaskItem]);

  const handleNextPlanDeleteTask = useCallback((taskId: string) => {
    const task = findTaskInTree(nextPlanTasks, taskId);
    const isOtherTask = task?.authorId && task.authorId !== currentUser.id;
    Modal.confirm({
      title: isOtherTask ? '删除他人创建的任务' : '确认删除',
      content: isOtherTask
        ? `该任务由 ${task?.authorName || '他人'} 创建，确定要删除吗？`
        : '确定要删除这条任务吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        isUserEditingRef.current = true;
        setNextPlanTasks(prev => deleteTaskFromTree(prev, taskId));
      },
    });
  }, [nextPlanTasks, currentUser.id]);

  const handleNextPlanTaskHighlight = useCallback((taskId: string) => {
    isUserEditingRef.current = true;
    setNextPlanTasks(prev => updateTaskInTree(prev, taskId, t => ({ ...t, highlighted: !t.highlighted })));
  }, []);

  const handleAddTask = useCallback((parentId?: string, defaultHighlighted?: boolean) => {
    isUserEditingRef.current = true;
    setReport(prev => {
      if (!prev) return prev;
      let highlighted = defaultHighlighted;
      if (parentId) {
        const parent = findTaskInTree(prev.content, parentId);
        highlighted = parent?.highlighted ?? defaultHighlighted;
      }
      const newTask = createTaskItem(highlighted);
      if (!parentId) {
        return { ...prev, content: [...prev.content, newTask] };
      }
      return { ...prev, content: updateTaskInTree(prev.content, parentId, t => ({
        ...t,
        children: [...(t.children || []), newTask],
      })) };
    });
  }, [createTaskItem]);

  // 栏级整段解析：把解析出的任务树追加/覆盖到目标栏（按 highlighted 区分重点/常规）
  const handleParseBlockApply = useCallback((tasks: TaskItem[], mode: 'append' | 'replace') => {
    if (!parseBlockTarget) return;
    isUserEditingRef.current = true;
    const { block, highlighted } = parseBlockTarget;
    // 整棵子树统一打上目标栏的重点标记和作者信息
    const stamp = (list: TaskItem[]): TaskItem[] => list.map(t => ({
      ...t,
      highlighted,
      authorId: currentUser.id,
      authorName: currentUser.name,
      children: t.children ? stamp(t.children) : [],
    }));
    const stamped = stamp(tasks);
    if (block === 'content') {
      setReport(prev => prev ? {
        ...prev,
        content: mode === 'replace'
          ? [...prev.content.filter(t => !!t.highlighted !== highlighted), ...stamped]
          : [...prev.content, ...stamped],
      } : prev);
    } else {
      setNextPlanTasks(prev => mode === 'replace'
        ? [...prev.filter(t => !!t.highlighted !== highlighted), ...stamped]
        : [...prev, ...stamped]);
    }
    setParseBlockTarget(null);
    message.success(`已填入 ${stamped.length} 个根任务`);
  }, [parseBlockTarget, currentUser]);

  // 根任务级整段解析：解析结果作为目标根任务的子任务（默认追加，保护协作填报的内容）
  const handleParseIntoApply = useCallback((tasks: TaskItem[], mode: 'append' | 'replace') => {
    if (!parseIntoTarget) return;
    const { block, taskId } = parseIntoTarget;
    const sourceTasks = block === 'content' ? (report?.content || []) : nextPlanTasks;
    const target = findTaskInTree(sourceTasks, taskId);
    if (!target) {
      setParseIntoTarget(null);
      return;
    }
    isUserEditingRef.current = true;
    // 智能识别标题行：粘贴内容只有一个根节点且与目标任务同名时，取其子节点填入，
    // 避免“平台”下再挂一个“平台”（带不带标题行粘贴都正确）
    let toInsert = tasks;
    if (tasks.length === 1 && tasks[0].text.trim() === target.text.trim()) {
      toInsert = tasks[0].children || [];
    }
    // 子树统一继承父任务的重点标记，打上当前操作人作者信息
    const stamp = (list: TaskItem[]): TaskItem[] => list.map(t => ({
      ...t,
      highlighted: target.highlighted,
      authorId: currentUser.id,
      authorName: currentUser.name,
      children: t.children ? stamp(t.children) : [],
    }));
    const stamped = stamp(toInsert);
    const merge = (list: TaskItem[]) => updateTaskInTree(list, taskId, t => ({
      ...t,
      children: mode === 'replace' ? stamped : [...(t.children || []), ...stamped],
    }));
    if (block === 'content') {
      setReport(prev => prev ? { ...prev, content: merge(prev.content) } : prev);
    } else {
      setNextPlanTasks(prev => merge(prev));
    }
    setParseIntoTarget(null);
    message.success(`已填入 ${stamped.length} 个子任务`);
  }, [parseIntoTarget, report, nextPlanTasks, currentUser]);

  const handleDeleteTask = useCallback((taskId: string) => {
    if (!report) return;
    // 查找任务文本用于日志
    const flat = flattenTasks(report.content);
    const task = flat.find(t => t.id === taskId);
    const isOtherTask = task?.authorId && task.authorId !== currentUser.id;

    Modal.confirm({
      title: isOtherTask ? '删除他人创建的任务' : '确认删除',
      content: isOtherTask
        ? `该任务由 ${task?.authorName || '他人'} 创建，确定要删除吗？`
        : '确定要删除这条任务吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        isUserEditingRef.current = true;
        setReport(prev => {
          if (!prev) return prev;
          return { ...prev, content: deleteTaskFromTree(prev.content, taskId) };
        });
        // 记录行为日志
        recordActionLog({
          action: 'delete_task',
          targetType: 'weekly_report_task',
          targetId: `${report.weekLabel}-${report.dept}-${taskId}`,
          targetDesc: `${report.weekLabel} ${report.dept} 删除任务`,
          details: { taskText: task?.text || '' },
        });
      },
    });
  }, [report, currentUser.id]);

  function formatImportantTasksForExport(tasks: TaskItem[]): string {
    const importantTasks = tasks.filter(t => t.highlighted);
    if (importantTasks.length === 0) return '';
    return importantTasks.map((t, i) => formatTaskNodeForExport(t, 0, i)).join('\n');
  }

  function formatNormalTasksForExport(tasks: TaskItem[]): string {
    const normalTasks = tasks.filter(t => !t.highlighted);
    if (normalTasks.length === 0) return '';
    return normalTasks.map((t, i) => formatTaskNodeForExport(t, 0, i)).join('\n');
  }

  const handleExportCurrent = useCallback(() => {
    const reports = sortByDeptOrder(getReportsByWeek(selectedWeek), r => r.dept);
    if (reports.length === 0) {
      message.warning('当前周次暂无数据可导出');
      return;
    }
    const data = reports.map((r: WeeklyReport) => {
      const currentTasks = r.content || [];
      const nextTasks = parseNextPlan(r.nextPlan);
      return {
        部门: r.dept,
        时间: r.weekLabel,
        '本周工作内容-重点工作': formatImportantTasksForExport(currentTasks),
        '本周工作内容-常规工作': formatNormalTasksForExport(currentTasks),
        '下周工作计划-重点工作': formatImportantTasksForExport(nextTasks),
        '下周工作计划-常规工作': formatNormalTasksForExport(nextTasks),
        问题与风险: r.other,
        其他: r.thoughts,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '周报');
    XLSX.writeFile(wb, `${selectedWeek}_全部科室_周报.xlsx`);
    message.success('当前周报已导出');
  }, [selectedWeek]);

  const handleExportAll = useCallback(() => {
    // 先按部门固定次序排，再按周期稳定排序（同周期内保持部门次序）
    const reports = sortByDeptOrder(getReports(), r => r.dept)
      .sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
    if (reports.length === 0) {
      message.warning('暂无数据可导出');
      return;
    }
    const data = reports.map((r: WeeklyReport) => {
      const currentTasks = r.content || [];
      const nextTasks = parseNextPlan(r.nextPlan);
      return {
        部门: r.dept,
        时间: r.weekLabel,
        '本周工作内容-重点工作': formatImportantTasksForExport(currentTasks),
        '本周工作内容-常规工作': formatNormalTasksForExport(currentTasks),
        '下周工作计划-重点工作': formatImportantTasksForExport(nextTasks),
        '下周工作计划-常规工作': formatNormalTasksForExport(nextTasks),
        问题与风险: (r as any).other || '',
        其他: (r as any).thoughts || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '全部周报');
    XLSX.writeFile(wb, `全部周报_${new Date().toISOString().slice(0, 10)}.xlsx`);
    message.success('全部周报已导出');
  }, []);

  const handleCreateNextWeek = useCallback(() => {
    // 默认打开弹窗时选中下周五 20:00
    const nextWeek = getNextWeekLabel(getCurrentFridayWeekLabel());
    const parsed = parseDateLabel(nextWeek);
    const defaultDayjs = parsed ? dayjs(parsed) : dayjs().add(7, 'day').hour(20).minute(0).second(0);
    setCreateDate(defaultDayjs);
    setCreateTime(defaultDayjs);
    setCreateModalVisible(true);
  }, []);

  const handleCreateConfirm = useCallback(() => {
    if (!createDate || !createTime) {
      message.warning('请选择截止日期和截止时间');
      return;
    }

    const deadline = createDate
      .hour(createTime.hour())
      .minute(createTime.minute())
      .second(0)
      .millisecond(0);

    if (!deadline.isValid()) {
      message.warning('日期或时间无效');
      return;
    }

    const weekLabel = deadline.format('YYYYMMDD');
    const deadlineISO = deadline.format('YYYY-MM-DDTHH:mm:ss');

    const { createdDepts, inRecycleBin } = createNextWeekGlobally(currentUser, weekLabel, deadlineISO);

    if (inRecycleBin) {
      // 同标签周期在回收站：引导恢复而不是重建（重建会被后端拒绝，且恢复能拿回原内容）
      message.warning(`周报周期 ${formatWeekLabel(weekLabel)} 在回收站中，请到左侧菜单「回收站」一键恢复，无需重建`);
      setCreateModalVisible(false);
      return;
    }

    if (createdDepts.length === 0) {
      message.info(`周报周期 ${formatWeekLabel(weekLabel)} 已存在`);
    } else {
      message.success(`已为 ${createdDepts.length} 个科室创建 ${formatWeekLabel(weekLabel)} 周报`);
      recordActionLog({
        action: 'create_week',
        targetType: 'report',
        targetId: weekLabel,
        targetDesc: `${formatWeekLabel(weekLabel)} 新建周报周期`,
        details: { createdDepts, deadline: deadlineISO },
      });
    }

    setWeekOptions(getDynamicWeekOptions());
    setSelectedWeek(weekLabel);
    setCreateModalVisible(false);
  }, [currentUser, createDate, createTime]);

  // 判断某周报周期是否可以被当前用户删除（移入回收站，可恢复）
  // 超级管理员：任意周期（固化历史周除外）；其他管理员：仅当前周之后的周期
  const canDeleteWeek = useCallback((weekLabel: string): boolean => {
    if (isFrozenWeek(weekLabel)) return false;
    if (isSuperAdmin(currentUser)) return true;
    if (!hasPermission(currentUser, 'DELETE_WEEK')) return false;
    const currentWeek = getCurrentFridayWeekLabel();
    return weekLabel > currentWeek;
  }, [currentUser]);

  const handleDeleteWeekClick = useCallback((weekLabel: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteWeekLabel(weekLabel);
    setDeleteModalVisible(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteWeekLabel) return;
    try {
      const result = await deleteWeekReports(deleteWeekLabel);
      if (result.success) {
        message.success(`周报周期 ${formatWeekLabel(deleteWeekLabel)} 已移入回收站，可在回收站中一键恢复`);
        recordActionLog({
          action: 'delete_week',
          targetType: 'report',
          targetId: deleteWeekLabel,
          targetDesc: `${formatWeekLabel(deleteWeekLabel)} 周报周期移入回收站`,
          details: {},
        });
        const newOptions = getDynamicWeekOptions();
        setWeekOptions(newOptions);
        if (selectedWeek === deleteWeekLabel) {
          // 被删的是当前选中周：切到第一个可选周期（当前周也可能在回收站中）
          setSelectedWeek(newOptions[0] || getCurrentFridayWeekLabel());
        }
      } else {
        message.error(result.message || '删除失败');
      }
    } catch (e: any) {
      message.error(`删除失败: ${e.message}`);
    } finally {
      setDeleteModalVisible(false);
      setDeleteWeekLabel(null);
    }
  }, [deleteWeekLabel, selectedWeek]);

  const handleAiSummary = useCallback(async () => {
    if (!report) return;
    const text = `${report.plan}\n${flattenTasks(report.content).map(t => t.text).join('\n')}\n${report.nextPlan}`;
    if (!text.trim()) {
      message.warning('内容为空，无法分析');
      return;
    }
    setAiLoading(true);
    try {
      const prevReport = getPrevWeekReport(report.weekLabel, report.dept);
      const prevNextPlan = prevReport?.nextPlan || '无上周数据';

      const result = await requestAiSummary(report, prevNextPlan);
      if (!result.success) {
        throw new Error(result.message || 'AI 分析失败');
      }

      const updated = {
        ...report,
        aiSummary: result.summary || report.aiSummary,
        aiAnalysis: result.aiAnalysis || report.aiAnalysis,
      };
      setReport(updated);
      saveReport(updated);
      message.success('AI 分析完成');
    } catch (e: any) {
      message.error(`AI 分析失败: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  }, [report]);

  const handleGlobalAnalysis = useCallback(() => {
    const compare = getPrevWeekLabel(selectedWeek) || selectedWeek;
    setGaBaseWeek(selectedWeek);
    setGaCompareWeek(compare);
    setGaFocusStart('20260313');
    setGaPrompt(buildDefaultGaPrompt(selectedWeek, compare, '20260313'));
    gaPromptDirtyRef.current = false;
    setGlobalAnalysisModalOpen(true);
  }, [selectedWeek]);

  const handleSubmitSuggestion = useCallback(async () => {
    if (!suggestionContent.trim()) {
      message.warning('请输入建议内容');
      return;
    }
    setSuggestionSubmitting(true);
    try {
      const res = await suggestionApi.submit(suggestionContent.trim());
      if (res.success) {
        message.success(res.message || '建议已提交，感谢反馈');
        setSuggestionContent('');
        setSuggestionOpen(false);
      } else {
        message.error(res.message || '提交失败');
      }
    } catch (e: any) {
      message.error('提交失败: ' + (e.message || '未知错误'));
    } finally {
      setSuggestionSubmitting(false);
    }
  }, [suggestionContent]);

  const handleRunGlobalAnalysis = useCallback(async () => {
    setGlobalAnalysisLoading(true);
    setGlobalAnalysisModalOpen(false);
    try {
      const baseReports = getReportsByWeek(gaBaseWeek);
      const compareReports = getReportsByWeek(gaCompareWeek);

      if (baseReports.length === 0) {
        message.warning('基准周没有周报数据');
        return;
      }

      const compareMap = new Map(compareReports.map(r => [r.dept, r]));
      const analysisData = baseReports.map(r => {
        const compareReport = compareMap.get(r.dept);
        return {
          dept: r.dept,
          currentContent: flattenTasks(r.content).map(t => t.text).join('\n'),
          currentWork: r.currentWork || '',
          nextPlan: r.nextPlan,
          prevNextPlan: compareReport?.nextPlan || '无对比周期数据',
        };
      });

      const result = await requestGlobalAnalysis({
        weekLabel: gaBaseWeek,
        compareWeekLabel: gaCompareWeek,
        focusStartWeekLabel: gaFocusStart,
        prompt: gaPrompt,
        reports: analysisData,
      });
      if (!result.success) {
        throw new Error(result.message || 'AI 全局分析失败');
      }

      setGlobalAnalysisResult(result.result || '');
      setGlobalAnalysisWeek(gaBaseWeek);
      message.success('AI 全局分析完成');
    } catch (e: any) {
      message.error(`AI 全局分析失败: ${e.message}`);
    } finally {
      setGlobalAnalysisLoading(false);
    }
  }, [gaBaseWeek, gaCompareWeek, gaFocusStart, gaPrompt]);

  // AI 全局分析：未手动修改提示词时，随周次/起点自动更新默认提示词
  useEffect(() => {
    if (globalAnalysisModalOpen && !gaPromptDirtyRef.current) {
      setGaPrompt(buildDefaultGaPrompt(gaBaseWeek, gaCompareWeek, gaFocusStart));
    }
  }, [globalAnalysisModalOpen, gaBaseWeek, gaCompareWeek, gaFocusStart]);

  const handleExportMarkdown = useCallback(() => {
    if (!globalAnalysisResult) return;
    const blob = new Blob([globalAnalysisResult], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI全局分析_${globalAnalysisWeek}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('Markdown 文件已导出');
  }, [globalAnalysisResult, globalAnalysisWeek]);

  const handleExportWord = useCallback(() => {
    if (!globalAnalysisResult) return;

    // 将 Markdown 转换为简单的 HTML
    let html = globalAnalysisResult
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$3</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');

    // 处理表格
    const lines = globalAnalysisResult.split('\n');
    let tableHtml = '';
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('|') && !line.includes('---')) {
        if (!inTable) {
          tableHtml += '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 20px 0;">';
          inTable = true;
        }
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        const isHeader = line.includes('科室') || line.includes('偏离度');
        tableHtml += '<tr>';
        cells.forEach(cell => {
          const tag = isHeader ? 'th' : 'td';
          let style = 'padding: 8px; border: 1px solid #ddd;';
          if (cell.includes('红')) style += ' color: #ff4d4f; font-weight: bold;';
          else if (cell.includes('黄红')) style += ' color: #ff7a45; font-weight: bold;';
          else if (cell.includes('黄')) style += ' color: #faad14; font-weight: bold;';
          else if (cell.includes('绿黄')) style += ' color: #a0d911;';
          else if (cell.includes('绿')) style += ' color: #52c41a;';
          tableHtml += `<${tag} style="${style}">${cell}</${tag}>`;
        });
        tableHtml += '</tr>';
      } else if (inTable && !line.includes('|')) {
        tableHtml += '</table>';
        inTable = false;
      }
    }
    if (inTable) tableHtml += '</table>';

    html = html.replace(/\|[^|]+\|/g, ''); // 移除原始表格标记

    const fullHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>AI全局分析</title></head>
      <body style="font-family: 'Microsoft YaHei', Arial, sans-serif; line-height: 1.8; padding: 20px;">
        ${tableHtml}
        <p>${html}</p>
      </body>
      </html>
    `;

    const blob = new Blob(['﻿', fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI全局分析_${globalAnalysisWeek}_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('Word 文件已导出');
  }, [globalAnalysisResult, globalAnalysisWeek]);

  const handleAddComment = useCallback(async (targetText?: string, targetBlock?: 'content' | 'nextPlan' | 'thoughts' | 'other', targetTaskId?: string, targetStart?: number, targetEnd?: number) => {
    if (!report || !newComment.trim()) return;
    const oldReport = report;
    const mentionIds = extractMentions(newComment);
    const comment: Comment = {
      id: genId(),
      reportId: report.id,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      authorColor: currentUser.color,
      content: newComment.trim(),
      targetText,
      targetBlock,
      targetTaskId,
      targetStart,
      targetEnd,
      mentionIds,
      replies: [],
      readBy: [currentUser.id],
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    const updated = { ...report, comments: [comment, ...report.comments] };
    setReport(updated);
    try {
      await addCommentApi(report.weekLabel, report.dept, comment);
      setNewComment('');
      setMentionOpen(false);
      setSelPopup(prev => ({ ...prev, visible: false, drafting: false, taskId: '', start: 0, end: 0 }));
      message.success('批注已添加');
      // 记录行为日志
      recordActionLog({
        action: 'comment_add',
        targetType: 'weekly_report',
        targetId: report.id,
        targetDesc: `${report.weekLabel} ${report.dept} 添加批注`,
        details: { commentText: comment.content.slice(0, 100), targetBlock: targetBlock || 'general' },
      });
    } catch (e: any) {
      setReport(oldReport);
      message.error(`批注保存失败: ${e.message}`);
    }
  }, [report, newComment, currentUser]);

  const handleAddReply = useCallback(async (parentId: string) => {
    if (!report || !replyContent.trim()) return;
    const oldReport = report;
    const mentionIds = extractMentions(replyContent);
    const reply: Comment = {
      id: genId(),
      reportId: report.id,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      authorColor: currentUser.color,
      content: replyContent.trim(),
      mentionIds,
      replies: [],
      readBy: [currentUser.id],
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    const updatedComments = report.comments.map(c => {
      if (c.id === parentId) {
        return { ...c, replies: [...c.replies, reply] };
      }
      return c;
    });
    const updated = { ...report, comments: updatedComments };
    setReport(updated);
    try {
      await addReplyApi(report.weekLabel, report.dept, parentId, reply);
      setReplyContent('');
      setReplyToId(null);
      setMentionOpen(false);
      message.success('回复已添加');
      // 记录行为日志
      recordActionLog({
        action: 'comment_add',
        targetType: 'weekly_report',
        targetId: report.id,
        targetDesc: `${report.weekLabel} ${report.dept} 回复批注`,
        details: { replyText: reply.content.slice(0, 100), parentCommentId: parentId },
      });
    } catch (e: any) {
      setReport(oldReport);
      message.error(`回复保存失败: ${e.message}`);
    }
  }, [report, replyContent, currentUser]);

  const handleToggleResolved = useCallback(async (commentId: string) => {
    if (!report || !hasPermission(currentUser, 'RESOLVE_COMMENT')) return;
    const oldReport = report;
    const newResolved = !oldReport.comments.find(c => c.id === commentId)?.resolved;
    const updatedComments = report.comments.map(c => {
      if (c.id === commentId) {
        return { ...c, resolved: newResolved };
      }
      return c;
    });
    const updated = { ...report, comments: updatedComments };
    setReport(updated);
    try {
      await toggleResolvedApi(report.weekLabel, report.dept, commentId, newResolved);
      message.success('状态已更新');
    } catch (e: any) {
      setReport(oldReport);
      message.error(`状态更新失败: ${e.message}`);
    }
  }, [report, currentUser]);

  const handleTextSelect = useCallback((e: React.MouseEvent, blockKey: string, taskId?: string) => {
    // Ant Design Input.TextArea 的 onMouseUp 事件 currentTarget 可能是底层 textarea 本身，
    // 也可能是包装元素；兼容两种情况
    const target = e.currentTarget as HTMLElement;
    const ta = (target.tagName === 'TEXTAREA'
      ? target
      : target.querySelector?.('textarea')) as HTMLTextAreaElement | null;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const rawText = ta.value.slice(start, end);
    const trimmed = rawText.trim();
    if (trimmed.length > 0) {
      const leading = rawText.length - rawText.trimStart().length;
      const trailing = rawText.length - rawText.trimEnd().length;
      setSelPopup({
        visible: true,
        x: e.clientX,
        y: e.clientY - 45,
        text: trimmed,
        block: blockKey as any,
        taskId: taskId || '',
        start: start + leading,
        end: end - trailing,
        drafting: false,
      });
    } else {
      setSelPopup(prev => ({ ...prev, visible: false, drafting: false, taskId: '', start: 0, end: 0 }));
    }
  }, []);


  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!report) return;
    const oldReport = report;
    const updated = { ...report, comments: report.comments.filter(c => c.id !== commentId) };
    setReport(updated);
    try {
      await deleteCommentApi(report.weekLabel, report.dept, commentId);
      message.success('评论已删除');
    } catch (e: any) {
      setReport(oldReport);
      message.error(`删除失败: ${e.message}`);
    }
  }, [report]);

  const handleDeleteReply = useCallback(async (commentId: string, replyId: string) => {
    if (!report) return;
    const oldReport = report;
    const updatedComments = report.comments.map(c => {
      if (c.id === commentId) {
        return { ...c, replies: c.replies.filter(r => r.id !== replyId) };
      }
      return c;
    });
    const updated = { ...report, comments: updatedComments };
    setReport(updated);
    try {
      await deleteReplyApi(report.weekLabel, report.dept, commentId, replyId);
      message.success('回复已删除');
    } catch (e: any) {
      setReport(oldReport);
      message.error(`删除失败: ${e.message}`);
    }
  }, [report]);



  return (
    <>
      <CommentConnector activeCommentId={activeCommentId} />
      <Layout className="weekly-report-v2-root" style={{ minHeight: 'calc(100vh - 64px)', margin: '0 -24px' }}>
      {/* 顶部栏 */}
      <Header className="mhy-header" style={{
        padding: '0 20px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Space size="large">
          <Space>
            <CalendarOutlined style={{ color: '#999' }} />
            <Text type="secondary">周报周期：</Text>
            <Select
              value={selectedWeek}
              onChange={setSelectedWeek}
              style={{ width: 180 }}
              options={weekOptions.map(w => ({ label: formatWeekLabel(w), value: w }))}
              dropdownRender={() => (
                <div className="custom-week-dropdown">
                  {weekOptions.map(w => {
                    const deletable = canDeleteWeek(w);
                    const selected = w === selectedWeek;
                    return (
                      <div
                        key={w}
                        className={`custom-week-option ${selected ? 'selected' : ''}`}
                        onClick={() => setSelectedWeek(w)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          background: selected ? '#e6f7ff' : 'transparent',
                        }}
                      >
                        <span>{formatWeekLabel(w)}</span>
                        {deletable && (
                          <CloseOutlined
                            style={{ color: '#ff4d4f', padding: 4 }}
                            onClick={(e) => handleDeleteWeekClick(w, e)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            />
          </Space>
          <Space>
            <TeamOutlined style={{ color: '#999' }} />
            <Text type="secondary">当前科室：</Text>
            <Select value={selectedDept} onChange={setSelectedDept} style={{ width: 150 }}
              options={DEPTS.map(d => ({ label: d, value: d }))} />
            <Button
              icon={<BulbOutlined />}
              onClick={() => setSuggestionOpen(true)}
            >
              优化建议
            </Button>
          </Space>
          {saving && (
            <Tag color="processing" style={{ fontSize: 12 }}>💾 保存中...</Tag>
          )}
        </Space>

        <Space>
          {submissions && submissions.length > 0 && (
            <Tag color="success" icon={<CheckCircleOutlined />}>已提交 v{submissions.length}</Tag>
          )}
          <Tag color="default" style={{ fontFamily: 'monospace', fontSize: 13 }}>
            <ClockCircleOutlined /> {nowTime.toLocaleTimeString('zh-CN', { hour12: false })}
          </Tag>
          {deadlineRemaining !== null && deadlineRemaining >= 0 && (
            <Tag color={deadlineRemaining < 14400 ? 'error' : deadlineRemaining < 86400 ? 'warning' : 'blue'}>
              截止还剩 {formatCountdown(deadlineRemaining)}
            </Tag>
          )}
          {deadlinePassed && !adminUnlock && (
            <Tag color="default" icon={<LockOutlined />}>已截止</Tag>
          )}
          {adminUnlock && (
            <Tag color="processing" icon={<UnlockOutlined />}>管理员已授权</Tag>
          )}
          <Button type="primary" icon={<SendOutlined />} loading={submitLoading} onClick={handleSubmit} disabled={!editable || !report}>
            提交周报
          </Button>
          {hasPermission(currentUser, 'CREATE_NEXT_WEEK') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateNextWeek}>
              新建下周报
            </Button>
          )}
          {hasPermission(currentUser, 'AI_GLOBAL_ANALYSIS') && (
            <Button type="primary" icon={<RobotFilled />} loading={globalAnalysisLoading} onClick={handleGlobalAnalysis}>
              AI 全局分析
            </Button>
          )}
        </Space>
      </Header>

      <Content style={{ padding: '16px 24px', overflowY: 'auto', marginLeft: 0 }}>
        {staleAlert && !autoSavePaused && (
          <Alert
            type="warning"
            showIcon
            message="该周报已被其他人更新"
            description="当前页面可能不是最新版本，建议立即合并最新内容后再继续编辑。"
            action={(
              <Button size="small" type="primary" onClick={handleStaleMerge} loading={submitLoading}>
                查看并合并
              </Button>
            )}
            style={{ marginBottom: 16 }}
          />
        )}
        {autoSavePaused && (
          <Alert
            type="error"
            showIcon
            message="自动保存已暂停：与服务端版本冲突"
            description="他人已更新该周报，继续自动保存可能造成覆盖。请点击合并后再继续编辑。"
            action={(
              <Button size="small" type="primary" danger onClick={handleResolveAutoSaveConflict} loading={submitLoading}>
                查看并合并
              </Button>
            )}
            style={{ marginBottom: 16 }}
          />
        )}
        <div style={{ display: 'flex', gap: 20 }}>
          {/* 左侧编辑器 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div ref={editorRef} style={{ position: 'relative' }}>
            {/* 科室标题 */}
            {/* 科室标题栏 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Button icon={<LeftOutlined />} size="small" shape="circle" onClick={() => {
                  const depts = DEPTS;
                  const idx = depts.indexOf(selectedDept);
                  setSelectedDept(depts[idx <= 0 ? depts.length - 1 : idx - 1]);
                }} />
                <div>
                  <Title level={4} style={{ margin: 0 }}>{selectedDept}</Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatWeekLabel(selectedWeek)} · {editable ? '✏️ 可编辑' : '👁️ 只读'}
                    {submissions && submissions.length > 0 ? ` · 已提交 v${submissions.length}` : ' · 未提交'}
                    {deadlinePassed && !adminUnlock ? ' · 🔒 已截止' : ''}
                    {adminUnlock ? ' · 🔓 已解锁' : ''}
                  </Text>
                </div>
                <Button icon={<RightOutlined />} size="small" shape="circle" onClick={() => {
                  const depts = DEPTS;
                  const idx = depts.indexOf(selectedDept);
                  setSelectedDept(depts[idx >= depts.length - 1 ? 0 : idx + 1]);
                }} />
              </div>
              <Space>
                {report?.aiSummary && (
                  <Tag className="mhy-float-tag" color="blue" icon={<RobotFilled />}>AI 已分析</Tag>
                )}
                <Button
                  type="primary"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => {
                    const base = getAppBasePath().replace(/\/$/, '');
                    window.open(`${base}/presentation?weekLabel=${selectedWeek}&dept=${encodeURIComponent(selectedDept)}`, '_blank');
                  }}
                >
                  演示
                </Button>
                <Button
                  size="small"
                  icon={<UploadOutlined />}
                  onClick={() => setImportModalOpen(true)}
                >
                  导入
                </Button>
                <Dropdown
                  menu={{
                    items: [
                      { key: 'current', label: '导出当前周期所有科室周报', onClick: handleExportCurrent },
                      { key: 'all', label: '导出所有周期所有科室周报', onClick: handleExportAll },
                    ],
                  }}
                  placement="bottomRight"
                >
                  <Button size="small" icon={<DownOutlined />}>
                    导出
                  </Button>
                </Dropdown>
              </Space>
            </div>

            {/* 历史记录锁定提示 */}
            {report?.locked && (
              <div style={{
                marginBottom: 12,
                padding: '8px 16px',
                borderRadius: 8,
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                display: 'flex',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: 13, color: '#389e0d', fontWeight: 500 }}>
                  📜 历史记录已归档锁定（只读），如需修改请联系管理员
                </span>
              </div>
            )}

            {/* 截止时间提醒横幅 */}
            {deadlineRemaining !== null && (
              <div style={{
                marginBottom: 12,
                padding: '8px 16px',
                borderRadius: 8,
                background: deadlinePassed
                  ? '#f5f5f5'
                  : deadlineRemaining < 14400
                    ? '#fff2f0'
                    : deadlineRemaining < 86400
                      ? '#fffbe6'
                      : '#e6f7ff',
                border: `1px solid ${deadlinePassed
                  ? '#d9d9d9'
                  : deadlineRemaining < 14400
                    ? '#ffccc7'
                    : deadlineRemaining < 86400
                      ? '#ffe58f'
                      : '#91d5ff'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{
                  fontSize: 13,
                  color: deadlinePassed
                    ? '#999'
                    : deadlineRemaining < 14400
                      ? '#cf1322'
                      : deadlineRemaining < 86400
                        ? '#d48806'
                        : '#096dd9',
                  fontWeight: deadlineRemaining < 14400 ? 600 : 400,
                }}>
                  {deadlinePassed
                    ? (adminUnlock ? `🔓 管理员已授权继续编辑，截止时间为${formatDeadlineText(deadlineTime)}` : `🔒 已截止（${formatDeadlineText(deadlineTime)}），如需编辑请联系管理员`)
                    : `⏰ 本周提交截止时间：${formatDeadlineText(deadlineTime)}，还剩 ${formatCountdown(deadlineRemaining)}`}
                </span>
                {!deadlinePassed && submissions && submissions.length > 0 && (
                  <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => setLastSubmissionOpen(true)}>
                    查看上次提交
                  </Button>
                )}
              </div>
            )}

            {/* 科室 Tab 切换栏 */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, padding: '6px 10px', background: 'rgba(0,0,0,0.02)', borderRadius: 10 }}>
              {SORTED_DEPTS.map(dept => {
                const active = dept === selectedDept;
                return (
                  <div
                    key={dept}
                    onClick={() => setSelectedDept(dept)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 14,
                      fontSize: 12,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      background: active ? '#1890ff' : 'transparent',
                      color: active ? '#fff' : '#666',
                      fontWeight: active ? 600 : 400,
                      transition: 'all 0.2s',
                    }}
                  >
                    {dept}
                  </div>
                );
              })}
            </div>

            {/* 上排：本周工作内容 + 下周工作计划 */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 16, minHeight: 'calc(75vh - 60px)' }}>
              {/* 本周工作内容：checkbox 任务列表（从上周 nextPlan 自动填充） */}
              <Card
                className="mhy-card"
                title={<span style={{ color: '#1890ff', fontWeight: 600 }}><FileTextOutlined /> 本周工作内容</span>}
                style={{ flex: 1, marginBottom: 0, minHeight: 'calc(75vh - 80px)' }}
                bodyStyle={{ padding: '16px 20px', display: 'flex', flexDirection: 'column' }}
              >
                {(() => {
                  const importantTasks = report?.content.filter(t => t.highlighted) || [];
                  const normalTasks = report?.content.filter(t => !t.highlighted) || [];
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, overflowY: 'auto', minHeight: 'calc(75vh - 160px)' }}>
                      {/* 重点工作区 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '2px solid #ffd8bf' }}>
                          <StarOutlined style={{ color: '#faad14' }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#d46b08' }}>重点工作</span>
                          {editable && (
                            <Button
                              type="text"
                              size="small"
                              icon={<SnippetsOutlined />}
                              title="粘贴整段文本，一次解析填入该栏"
                              style={{ marginLeft: 'auto', color: '#d46b08', fontSize: 12 }}
                              onClick={() => setParseBlockTarget({ block: 'content', highlighted: true })}
                            >
                              整段解析
                            </Button>
                          )}
                        </div>
                        <TaskTree
                          tasks={importantTasks}
                          allRootTasks={report?.content || []}
                          editable={editable}
                          blockKey="content"
                          comments={report?.comments}
                          onToggle={handleTaskToggle}
                          onTextChange={handleTaskTextChange}
                          onDelete={handleDeleteTask}
                          onAddChild={handleAddTask}
                          onHighlight={handleTaskHighlight}
                          onTextSelect={handleTextSelect}
                          hoveredCommentIds={hoveredCommentIds}
                          activeCommentId={activeCommentId}
                          onHoverComments={setHoveredCommentIds}
                          onActivateComments={ids => setActiveCommentId(ids[0] || null)}
                          onParseChildren={handleParseChildren}
                          onParseInto={taskId => setParseIntoTarget({ block: 'content', taskId })}
                        />
                        {editable && (
                          <Button type="dashed" size="small" onClick={() => handleAddTask(undefined, true)} style={{ marginTop: 4 }}>
                            + 添加重点任务
                          </Button>
                        )}
                      </div>

                      <Divider style={{ margin: '4px 0' }} />

                      {/* 常规工作区 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '2px solid #b7eb8f' }}>
                          <FileTextOutlined style={{ color: '#52c41a' }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#389e0d' }}>常规工作</span>
                          {editable && (
                            <Button
                              type="text"
                              size="small"
                              icon={<SnippetsOutlined />}
                              title="粘贴整段文本，一次解析填入该栏"
                              style={{ marginLeft: 'auto', color: '#389e0d', fontSize: 12 }}
                              onClick={() => setParseBlockTarget({ block: 'content', highlighted: false })}
                            >
                              整段解析
                            </Button>
                          )}
                        </div>
                        <TaskTree
                          tasks={normalTasks}
                          allRootTasks={report?.content || []}
                          editable={editable}
                          blockKey="content"
                          comments={report?.comments}
                          onToggle={handleTaskToggle}
                          onTextChange={handleTaskTextChange}
                          onDelete={handleDeleteTask}
                          onAddChild={handleAddTask}
                          onHighlight={handleTaskHighlight}
                          onTextSelect={handleTextSelect}
                          hoveredCommentIds={hoveredCommentIds}
                          activeCommentId={activeCommentId}
                          onHoverComments={setHoveredCommentIds}
                          onActivateComments={ids => setActiveCommentId(ids[0] || null)}
                          onParseChildren={handleParseChildren}
                          onParseInto={taskId => setParseIntoTarget({ block: 'content', taskId })}
                        />
                        {editable && (
                          <Button type="dashed" size="small" onClick={() => handleAddTask()} style={{ marginTop: 4 }}>
                            + 添加常规工作
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </Card>

              {/* 下周工作计划 */}
              <Card
                className="mhy-card"
                title={<span style={{ color: '#52c41a', fontWeight: 600 }}><CalendarOutlined /> 下周工作计划</span>}
                style={{ flex: 1, marginBottom: 0, minHeight: 'calc(75vh - 80px)' }}
                bodyStyle={{ padding: '16px 20px', display: 'flex', flexDirection: 'column' }}
              >
                {(() => {
                  const importantPlanTasks = nextPlanTasks.filter(t => t.highlighted);
                  const normalPlanTasks = nextPlanTasks.filter(t => !t.highlighted);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, overflowY: 'auto', minHeight: 'calc(75vh - 160px)' }}>
                      {/* 重点工作区 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '2px solid #ffd8bf' }}>
                          <StarOutlined style={{ color: '#faad14' }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#d46b08' }}>重点工作</span>
                          {editable && (
                            <Button
                              type="text"
                              size="small"
                              icon={<SnippetsOutlined />}
                              title="粘贴整段文本，一次解析填入该栏"
                              style={{ marginLeft: 'auto', color: '#d46b08', fontSize: 12 }}
                              onClick={() => setParseBlockTarget({ block: 'nextPlan', highlighted: true })}
                            >
                              整段解析
                            </Button>
                          )}
                        </div>
                        <TaskTree
                          tasks={importantPlanTasks}
                          allRootTasks={nextPlanTasks}
                          editable={editable}
                          blockKey="nextPlan"
                          comments={report?.comments}
                          onToggle={handleNextPlanTaskToggle}
                          onTextChange={handleNextPlanTaskTextChange}
                          onDelete={handleNextPlanDeleteTask}
                          onAddChild={handleNextPlanAddTask}
                          onHighlight={handleNextPlanTaskHighlight}
                          onTextSelect={handleTextSelect}
                          hoveredCommentIds={hoveredCommentIds}
                          activeCommentId={activeCommentId}
                          onHoverComments={setHoveredCommentIds}
                          onActivateComments={ids => setActiveCommentId(ids[0] || null)}
                          onParseChildren={handleNextPlanParseChildren}
                          onParseInto={taskId => setParseIntoTarget({ block: 'nextPlan', taskId })}
                        />
                        {editable && (
                          <Button type="dashed" size="small" onClick={() => handleNextPlanAddTask(undefined, true)} style={{ marginTop: 4 }}>
                            + 添加重点任务
                          </Button>
                        )}
                      </div>

                      <Divider style={{ margin: '4px 0' }} />

                      {/* 常规工作区 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '2px solid #b7eb8f' }}>
                          <FileTextOutlined style={{ color: '#52c41a' }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#389e0d' }}>常规工作</span>
                          {editable && (
                            <Button
                              type="text"
                              size="small"
                              icon={<SnippetsOutlined />}
                              title="粘贴整段文本，一次解析填入该栏"
                              style={{ marginLeft: 'auto', color: '#389e0d', fontSize: 12 }}
                              onClick={() => setParseBlockTarget({ block: 'nextPlan', highlighted: false })}
                            >
                              整段解析
                            </Button>
                          )}
                        </div>
                        <TaskTree
                          tasks={normalPlanTasks}
                          allRootTasks={nextPlanTasks}
                          editable={editable}
                          blockKey="nextPlan"
                          comments={report?.comments}
                          onToggle={handleNextPlanTaskToggle}
                          onTextChange={handleNextPlanTaskTextChange}
                          onDelete={handleNextPlanDeleteTask}
                          onAddChild={handleNextPlanAddTask}
                          onHighlight={handleNextPlanTaskHighlight}
                          onTextSelect={handleTextSelect}
                          hoveredCommentIds={hoveredCommentIds}
                          activeCommentId={activeCommentId}
                          onHoverComments={setHoveredCommentIds}
                          onActivateComments={ids => setActiveCommentId(ids[0] || null)}
                          onParseChildren={handleNextPlanParseChildren}
                          onParseInto={taskId => setParseIntoTarget({ block: 'nextPlan', taskId })}
                        />
                        {editable && (
                          <Button type="dashed" size="small" onClick={() => handleNextPlanAddTask()} style={{ marginTop: 4 }}>
                            + 添加常规工作
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </Card>
            </div>

            {/* 下排：问题与风险 */}
            <Card className="mhy-card" title={<span style={{ color: '#cf1322', fontWeight: 600 }}><ExclamationCircleOutlined /> 问题与风险</span>} style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}>
              {(() => {
                const blockKey = 'other' as const;
                const value = report?.other || '';
                const { hasOverlay, nodes } = buildHighlightOverlay(
                  value,
                  blockKey,
                  report?.comments || [],
                  activeCommentId,
                  hoveredCommentIds,
                  setHoveredCommentIds,
                  setActiveCommentId
                );
                return (
                  <div data-textarea-wrapper style={{ position: 'relative' }}>
                    {hasOverlay && (
                      <div data-overlay style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', padding: '4px 11px', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'transparent', zIndex: 1 }}>
                        {nodes}
                      </div>
                    )}
                    <TextArea rows={3} placeholder="请输入问题与风险..." value={value} onChange={e => handleChange(blockKey, e.target.value)} readOnly={!editable}
                      onMouseUp={e => handleTextSelect(e, blockKey)}
                      onScroll={(e) => { const wrapper = (e.currentTarget as HTMLElement).closest?.('[data-textarea-wrapper]') as HTMLElement | null; const overlay = wrapper?.querySelector('[data-overlay]') as HTMLElement | null; if (overlay) overlay.scrollTop = e.currentTarget.scrollTop; }}
                      style={{ fontSize: 14, lineHeight: 1.8, resize: 'vertical', background: editable ? '#fff' : '#fafafa', borderRadius: 8, position: 'relative', zIndex: 0 }}
                    />
                  </div>
                );
              })()}
            </Card>

            {/* 下排：其他 */}
            <Card className="mhy-card" title={<span style={{ color: '#722ed1', fontWeight: 600 }}><BulbOutlined /> 其他</span>} style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}>
              {(() => {
                const blockKey = 'thoughts' as const;
                const value = report?.thoughts || '';
                const { hasOverlay, nodes } = buildHighlightOverlay(
                  value,
                  blockKey,
                  report?.comments || [],
                  activeCommentId,
                  hoveredCommentIds,
                  setHoveredCommentIds,
                  setActiveCommentId
                );
                return (
                  <div data-textarea-wrapper style={{ position: 'relative' }}>
                    {hasOverlay && (
                      <div data-overlay style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', padding: '4px 11px', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'transparent', zIndex: 1 }}>
                        {nodes}
                      </div>
                    )}
                    <TextArea rows={3} placeholder="请输入本周管理心得、AI推广案例/心得..." value={value} onChange={e => handleChange(blockKey, e.target.value)} readOnly={!editable}
                      onMouseUp={e => handleTextSelect(e, blockKey)}
                      onScroll={(e) => { const wrapper = (e.currentTarget as HTMLElement).closest?.('[data-textarea-wrapper]') as HTMLElement | null; const overlay = wrapper?.querySelector('[data-overlay]') as HTMLElement | null; if (overlay) overlay.scrollTop = e.currentTarget.scrollTop; }}
                      style={{ fontSize: 14, lineHeight: 1.8, resize: 'vertical', background: editable ? '#fff' : '#fafafa', borderRadius: 8, position: 'relative', zIndex: 0 }}
                    />
                  </div>
                );
              })()}
            </Card>

            </div>
          </div>
          {/* 评论 */}
          <div style={{ width: commentCollapsed ? 56 : 260, flexShrink: 0, display: 'flex', flexDirection: 'column', transition: 'width 0.3s' }}>
            <Card
              className="mhy-card"
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: commentCollapsed ? 'center' : 'space-between', flexDirection: commentCollapsed ? 'column' : 'row', gap: commentCollapsed ? 4 : 0 }}>
                  {!commentCollapsed && (
                    <span>
                      <MessageOutlined /> 批注{' '}
                      {report && report.comments && report.comments.length > 0 && (
                        <Badge count={report.comments.length} size="small" />
                      )}
                    </span>
                  )}
                  {commentCollapsed && <MessageOutlined style={{ fontSize: 16 }} />}
                  <Button
                    type="text"
                    size="small"
                    style={{ padding: '0 2px', minWidth: 28, height: 28 }}
                    onClick={() => setCommentCollapsed(!commentCollapsed)}
                  >
                    {commentCollapsed ? <RightOutlined /> : <LeftOutlined />}
                  </Button>
                </div>
              }
              bodyStyle={{ padding: commentCollapsed ? 0 : '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {!commentCollapsed && (
              <>
              {/* 评论输入 */}
              <div style={{ marginBottom: 16, position: 'relative' }}>
                <TextArea
                  rows={2}
                  placeholder="添加批注... 输入 @ 可提及用户"
                  value={newComment}
                  onChange={e => {
                    const val = e.target.value;
                    setNewComment(val);
                    setMentionTarget('comment');
                    setMentionOpen(val.endsWith('@') || val.includes('@'));
                  }}
                  style={{ fontSize: 13, borderRadius: 8 }}
                />
                {mentionOpen && mentionTarget === 'comment' && (
                  <div style={{
                    position: 'absolute',
                    zIndex: 100,
                    background: '#fff',
                    border: '1px solid #e8e8e8',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    maxHeight: 160,
                    overflowY: 'auto',
                    width: '100%',
                    marginTop: 4,
                  }}>
                    {SYSTEM_USERS.map(u => (
                      <div
                        key={u.id}
                        onClick={() => {
                          setNewComment(prev => prev + u.name + ' ');
                          setMentionOpen(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                      >
                        <Avatar size="small" src={u.avatar} style={{ border: `2px solid ${u.color}` }} />
                        <span>{u.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  size="small"
                  type="primary"
                  icon={<CommentOutlined />}
                  onClick={() => handleAddComment()}
                  disabled={!newComment.trim()}
                  style={{ marginTop: 8, float: 'right' }}
                >
                  发送
                </Button>
                <div style={{ clear: 'both' }} />
              </div>

              <Divider style={{ margin: '12px 0' }} />

              {/* 评论列表 */}
              <div ref={commentListRef} style={{ flex: 1, overflowY: 'auto', marginTop: 8, position: 'relative' }}>
              {report && report.comments && report.comments.length > 0 ? (
                <>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}>
                  {report.comments.map(c => (
                    <div
                      key={c.id}
                      ref={el => commentCardRefs.current[c.id] = el}
                      data-comment-card-id={c.id}
                      className={hoveredCommentIds.includes(c.id) ? 'comment-card-bounce' : ''}
                      onMouseEnter={() => setHoveredCommentIds([c.id])}
                      onMouseLeave={() => setHoveredCommentIds([])}
                      onClick={() => {
                        setActiveCommentId(c.id);
                        const el = document.querySelector(`[data-comment-ids*="${c.id}"]`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      style={{
                        position: 'absolute',
                        top: commentPositions[c.id] ?? 0,
                        left: 0,
                        right: 0,
                        padding: '10px 12px',
                        background: activeCommentId === c.id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
                        borderRadius: 12,
                        border: activeCommentId === c.id ? '1px solid #fa8c16' : '1px solid rgba(255,255,255,0.5)',
                        borderTop: activeCommentId === c.id ? '3px solid #fa8c16' : '1px solid rgba(255,255,255,0.5)',
                        backdropFilter: 'blur(6px)',
                        transform: activeCommentId === c.id ? 'scale(1.02)' : 'scale(1)',
                        transformOrigin: 'left center',
                        transition: 'top 0.2s ease, transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
                        cursor: 'pointer',
                        zIndex: activeCommentId === c.id ? 2 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Avatar size="small" src={c.authorAvatar} style={{ border: `2px solid ${c.authorColor}` }} />
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{c.authorName}</span>
                        <span style={{ fontSize: 11, color: '#bbb', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {new Date(c.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {(c.authorId === currentUser.id || hasPermission(currentUser, 'DELETE_COMMENT')) && (
                          <Button type="link" size="small" danger style={{ fontSize: 11, padding: 0, height: 16 }} onClick={() => handleDeleteComment(c.id)}>
                            删除
                          </Button>
                        )}
                      </div>
                      {c.targetText && (
                        <div style={{
                          fontSize: 11,
                          color: '#888',
                          background: 'rgba(0,0,0,0.03)',
                          borderRadius: 6,
                          padding: '4px 8px',
                          marginBottom: 6,
                          borderLeft: `3px solid ${BLOCK_CONFIG.find(b => b.key === c.targetBlock)?.color || '#999'}`,
                        }}>
                          <span style={{ opacity: 0.6 }}>引自 </span>
                          {BLOCK_CONFIG.find(b => b.key === c.targetBlock)?.title}
                          <span style={{ opacity: 0.6 }}>：</span>
                          「{c.targetText.slice(0, 40)}{c.targetText.length > 40 ? '...' : ''}」
                        </div>
                      )}
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: '#333' }}>
                        {c.content.split(/(@[^\s]+)/g).map((part, i) => {
                          const isMention = part.startsWith('@');
                          return isMention
                            ? <Tag key={i} color="blue" style={{ fontSize: 12, margin: 0, padding: '0 4px' }}>{part}</Tag>
                            : <span key={i}>{part}</span>;
                        })}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                        {hasPermission(currentUser, 'RESOLVE_COMMENT') ? (
                          <Button
                            size="small"
                            type={c.resolved ? 'primary' : 'default'}
                            ghost={!c.resolved}
                            style={{
                              fontSize: 11,
                              height: 20,
                              padding: '0 6px',
                              ...(c.resolved ? { background: '#52c41a', borderColor: '#52c41a', color: '#fff' } : {}),
                            }}
                            icon={c.resolved ? <CheckCircleOutlined /> : undefined}
                            onClick={() => handleToggleResolved(c.id)}
                          >
                            {c.resolved ? '已解决' : '未解决'}
                          </Button>
                        ) : (
                          <Tag color={c.resolved ? 'success' : 'default'} style={{ fontSize: 11 }}>
                            {c.resolved ? <CheckCircleOutlined /> : null}
                            {c.resolved ? '已解决' : '未解决'}
                          </Tag>
                        )}
                        <span style={{ fontSize: 11, color: '#999' }}>
                          {c.readBy.length > 0 ? `${c.readBy.length}人已读` : '未读'}
                        </span>
                        <Button
                          type="link"
                          size="small"
                          style={{ fontSize: 11, padding: 0, marginLeft: 'auto' }}
                          onClick={() => {
                            setReplyToId(replyToId === c.id ? null : c.id);
                            setReplyContent('');
                          }}
                        >
                          {replyToId === c.id ? '取消回复' : `回复 ${c.replies.length > 0 ? `(${c.replies.length})` : ''}`}
                        </Button>
                      </div>

                      {/* 回复输入框 */}
                      {replyToId === c.id && (
                        <div style={{ marginTop: 10, paddingLeft: 24, position: 'relative' }}>
                          <TextArea
                            rows={2}
                            placeholder={`回复 ${c.authorName}...`}
                            value={replyContent}
                            onChange={e => {
                              const val = e.target.value;
                              setReplyContent(val);
                              setMentionTarget('reply');
                              setMentionOpen(val.endsWith('@') || val.includes('@'));
                            }}
                            style={{ fontSize: 12, borderRadius: 6 }}
                          />
                          {mentionOpen && mentionTarget === 'reply' && (
                            <div style={{
                              position: 'absolute',
                              zIndex: 100,
                              background: '#fff',
                              border: '1px solid #e8e8e8',
                              borderRadius: 8,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              maxHeight: 140,
                              overflowY: 'auto',
                              width: '90%',
                              marginTop: 4,
                            }}>
                              {SYSTEM_USERS.map(u => (
                                <div
                                  key={u.id}
                                  onClick={() => {
                                    setReplyContent(prev => prev + u.name + ' ');
                                    setMentionOpen(false);
                                  }}
                                  style={{
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: 12,
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                >
                                  <Avatar size="small" src={u.avatar} style={{ border: `2px solid ${u.color}` }} />
                                  <span>{u.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => handleAddReply(c.id)}
                            disabled={!replyContent.trim()}
                            style={{ marginTop: 6, float: 'right' }}
                          >
                            发送回复
                          </Button>
                          <div style={{ clear: 'both' }} />
                        </div>
                      )}

                      {/* 嵌套回复列表 */}
                      {c.replies.length > 0 && (
                        <div style={{ marginTop: 10, paddingLeft: 24, borderLeft: '2px solid #e8e8e8' }}>
                          {c.replies.map(r => (
                            <div key={r.id} style={{ marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Avatar size="small" src={r.authorAvatar} style={{ width: 20, height: 20, border: `2px solid ${r.authorColor}` }} />
                                <span style={{ fontSize: 11, fontWeight: 500 }}>{r.authorName}</span>
                                <span style={{ fontSize: 10, color: '#bbb' }}>
                                  {new Date(r.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, lineHeight: 1.5, color: '#555', paddingLeft: 26 }}>
                                {r.content.split(/(@[^\s]+)/g).map((part, i) => {
                                  const isMention = part.startsWith('@');
                                  return isMention
                                    ? <Tag key={i} color="blue" style={{ fontSize: 11, margin: 0, padding: '0 3px' }}>{part}</Tag>
                                    : <span key={i}>{part}</span>;
                                })}
                              </div>
                              {(r.authorId === currentUser.id || hasPermission(currentUser, 'DELETE_REPLY')) && (
                                <Button type="link" size="small" danger style={{ fontSize: 10, padding: 0, height: 14, marginLeft: 26 }} onClick={() => handleDeleteReply(c.id, r.id)}>
                                  删除
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  </div>
                  <div style={{ height: listMinHeight }} />
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评论" />
                </div>
              )}
              </div>
              </>
              )}
            </Card>
          </div>

          {hasPermission(currentUser, 'AI_SUMMARY') && (
          <div style={{ width: aiCollapsed ? 56 : 260, flexShrink: 0, display: 'flex', flexDirection: 'column', transition: 'width 0.3s' }}>
            <Card
              className="mhy-card"
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: aiCollapsed ? 'center' : 'space-between', flexDirection: aiCollapsed ? 'column' : 'row', gap: aiCollapsed ? 4 : 0 }}>
                  {!aiCollapsed && <span><BarChartOutlined /> AI 总结</span>}
                  {aiCollapsed && <BarChartOutlined style={{ fontSize: 16 }} />}
                  <Button
                    type="text"
                    size="small"
                    style={{ padding: '0 2px', minWidth: 28, height: 28 }}
                    onClick={() => setAiCollapsed(!aiCollapsed)}
                  >
                    {aiCollapsed ? <RightOutlined /> : <LeftOutlined />}
                  </Button>
                </div>
              }
              bodyStyle={{ padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              style={{ flex: 1, minHeight: 0 }}
            >
              {!aiCollapsed && (
              <>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                <Button
                  type="primary"
                  size="small"
                  icon={<RobotFilled />}
                  loading={aiLoading}
                  onClick={handleAiSummary}
                  style={{ width: '100%' }}
                >
                  AI 总结
                </Button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
              {aiLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 12, color: '#999', fontSize: 13 }}>AI 正在分析中...</div>
                </div>
              ) : report?.aiSummary ? (
                <div>
                  <div className="mhy-ai-panel" style={{
                    padding: '14px 16px',
                    marginBottom: 16,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <RobotFilled style={{ color: '#1890ff' }} />
                      <Text strong style={{ color: '#1890ff' }}>AI 智能总结</Text>
                    </div>
                    <Text style={{ fontSize: 13, lineHeight: 1.7 }}>{report.aiSummary}</Text>
                  </div>

                  {report.aiAnalysis && (
                    <>
                      <Divider style={{ margin: '12px 0' }} />
                      <div style={{ marginBottom: 12 }}>
                        <Text strong style={{ fontSize: 13 }}><BulbOutlined /> 完成度评估</Text>
                        <div className="mhy-progress-bar" style={{ marginTop: 8 }}>
                          <div
                            className="mhy-progress-fill"
                            style={{
                              width: `${report.aiAnalysis.completionRate}%`,
                              background: report.aiAnalysis.completionRate >= 80 ? '#52c41a' : report.aiAnalysis.completionRate >= 50 ? '#faad14' : '#ff4d4f',
                              color: report.aiAnalysis.completionRate >= 80 ? '#52c41a' : report.aiAnalysis.completionRate >= 50 ? '#faad14' : '#ff4d4f',
                            }}
                          />
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 12, color: '#999', marginTop: 4 }}>
                          {report.aiAnalysis.completionRate}%
                        </div>
                      </div>

                      {report.aiAnalysis.completed.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <Tag color="success" style={{ fontSize: 11, marginBottom: 6 }}>✓ 已完成</Tag>
                          {report.aiAnalysis.completed.map((item, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#333', padding: '2px 0' }}>• {item}</div>
                          ))}
                        </div>
                      )}

                      {report.aiAnalysis.delayed.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <Tag color="warning" style={{ fontSize: 11, marginBottom: 6 }}>⚠ 存在延迟</Tag>
                          {report.aiAnalysis.delayed.map((item, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#333', padding: '2px 0' }}>• {item}</div>
                          ))}
                        </div>
                      )}

                      {report.aiAnalysis.risks.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <Tag color="error" style={{ fontSize: 11, marginBottom: 6 }}>🚨 风险预警</Tag>
                          {report.aiAnalysis.risks.map((item, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#ff4d4f', padding: '2px 0' }}>• {item}</div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点击「AI 分析」生成洞察" />
                </div>
              )}
              </div>
              </>
              )}
            </Card>
          </div>
          )}
        </div>
    </Content>

    {/* 选中文本后的浮动批注按钮 */}
      {selPopup.visible && !selPopup.drafting && (
        <div
          style={{
            position: 'fixed',
            left: selPopup.x,
            top: selPopup.y,
            zIndex: 9999,
          }}
        >
          <Button
            type="primary"
            size="small"
            icon={<CommentOutlined />}
            onClick={() => {
              setSelPopup(prev => ({ ...prev, drafting: true }));
            }}
            style={{ boxShadow: '0 4px 12px rgba(24,144,255,0.3)' }}
          >
            添加批注
          </Button>
        </div>
      )}

      {/* 浮动批注输入框 */}
      {selPopup.visible && selPopup.drafting && (
        <div
          className="comment-draft-popup"
          style={{
            position: 'fixed',
            left: Math.min(selPopup.x, window.innerWidth - 300),
            top: selPopup.y,
            zIndex: 9999,
            width: 280,
            background: '#fff',
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            border: '1px solid #e8e8e8',
          }}
        >
          <div style={{ fontSize: 11, color: '#999', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block',
              width: 3,
              height: 12,
              background: BLOCK_CONFIG.find(b => b.key === selPopup.block)?.color || '#1890ff',
              borderRadius: 2,
            }} />
            批注「{selPopup.text.slice(0, 20)}{selPopup.text.length > 20 ? '...' : ''}」
          </div>
          <TextArea
            rows={2}
            autoFocus
            placeholder="请输入批注内容..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            style={{ fontSize: 13, borderRadius: 8, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              onClick={() => setSelPopup({ visible: false, x: 0, y: 0, text: '', block: 'nextPlan', taskId: '', start: 0, end: 0, drafting: false })}
            >
              取消
            </Button>
            <Button
              size="small"
              type="primary"
              disabled={!newComment.trim()}
              onClick={() => handleAddComment(selPopup.text, selPopup.block, selPopup.taskId, selPopup.start, selPopup.end)}
            >
              发送
            </Button>
          </div>
        </div>
      )}

      {/* AI 全局分析结果抽屉 */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 40 }}>
            <span>🤖 AI 全局分析 - {globalAnalysisWeek}</span>
            <Space>
              <Button
                size="small"
                icon={<FileMarkdownOutlined />}
                onClick={handleExportMarkdown}
              >
                导出 Markdown
              </Button>
              <Button
                size="small"
                icon={<FileWordOutlined />}
                onClick={handleExportWord}
              >
                导出 Word
              </Button>
            </Space>
          </div>
        }
        placement="right"
        onClose={() => setGlobalAnalysisResult('')}
        open={!!globalAnalysisResult}
        width={800}
        bodyStyle={{ padding: 24 }}
        headerStyle={{ borderBottom: '1px solid #e8e8e8' }}
      >
        <div style={{
          whiteSpace: 'pre-wrap',
          lineHeight: 1.8,
          fontSize: 14,
        }}>
          {globalAnalysisResult.split('\n').map((line, idx) => {
            // 标题处理
            if (line.startsWith('# ')) {
              return <h1 key={idx} style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, marginTop: 24 }}>{line.slice(2)}</h1>;
            }
            if (line.startsWith('## ')) {
              return <h2 key={idx} style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 20, color: '#1890ff' }}>{line.slice(3)}</h2>;
            }
            if (line.startsWith('### ')) {
              return <h3 key={idx} style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, marginTop: 16 }}>{line.slice(4)}</h3>;
            }
            // 表格行处理
            if (line.includes('|')) {
              const cells = line.split('|').map(c => c.trim()).filter(Boolean);
              if (cells.length > 0) {
                const isHeader = line.includes('科室') || line.includes('偏离度');
                const isSeparator = line.includes('---');
                if (isSeparator) return null;
                return (
                  <div key={idx} style={{
                    display: 'flex',
                    borderBottom: '1px solid #f0f0f0',
                    background: isHeader ? '#fafafa' : 'transparent',
                    fontWeight: isHeader ? 600 : 400,
                  }}>
                    {cells.map((cell, i) => (
                      <div key={i} style={{
                        flex: i === 2 ? 2 : 1,
                        padding: '8px 12px',
                        borderRight: i < cells.length - 1 ? '1px solid #f0f0f0' : 'none',
                        color: cell.includes('红') ? '#ff4d4f' :
                               cell.includes('黄红') ? '#ff7a45' :
                               cell.includes('黄') ? '#faad14' :
                               cell.includes('绿黄') ? '#a0d911' :
                               cell.includes('绿') ? '#52c41a' : 'inherit',
                        fontWeight: (cell.includes('红') || cell.includes('黄')) ? 600 : 'inherit',
                      }}>
                        {cell}
                      </div>
                    ))}
                  </div>
                );
              }
            }
            // 粗体处理
            if (line.includes('**')) {
              const parts = line.split('**');
              return (
                <p key={idx} style={{ marginBottom: 12 }}>
                  {parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}
                </p>
              );
            }
            // 分隔线
            if (line.trim() === '---') {
              return <hr key={idx} style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e8e8e8' }} />;
            }
            // 普通段落
            if (line.trim()) {
              return <p key={idx} style={{ marginBottom: 12 }}>{line}</p>;
            }
            return <br key={idx} />;
          })}
        </div>
      </Drawer>

      {/* 提交历史抽屉 */}
      <Drawer
        title={(
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 28 }}>
            <span>📋 提交历史（共 {submissions.length} 次）</span>
            <Segmented
              options={[
                { label: '历史', value: 'history' },
                { label: '对比', value: 'diff' },
              ]}
              value={submissionHistoryMode}
              onChange={value => setSubmissionHistoryMode(value as 'history' | 'diff')}
            />
          </div>
        )}
        placement="right"
        onClose={() => setLastSubmissionOpen(false)}
        open={lastSubmissionOpen}
        width={720}
        bodyStyle={{ padding: 24 }}
      >
        {submissions.length === 0 ? (
          <Empty description="暂无提交记录" />
        ) : submissionHistoryMode === 'history' ? (
          <div>
            {[...submissions].reverse().map((submission, idx) => {
              // 计算本次提交的统计
              const tasks: TaskItem[] = Array.isArray(submission.content?.content) ? submission.content.content : [];
              let total = 0, completed = 0, important = 0, normal = 0;
              const walk = (arr: TaskItem[]) => {
                for (const t of arr) {
                  total++;
                  if (t.checked) completed++;
                  if (t.highlighted) important++; else normal++;
                  if (t.children) walk(t.children);
                }
              };
              walk(tasks);
              const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

              return (
                <div key={submission.version} style={{ marginBottom: idx < submissions.length - 1 ? 24 : 0 }}>
                  {/* 顶部汇总 */}
                  <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                      <Space>
                        <Tag color="blue" style={{ fontSize: 14, padding: '2px 8px' }}>版本 v{submission.version}</Tag>
                        <Tag color="cyan" icon={<TeamOutlined />}>
                          提交人：{submission.submittedBy || report?.authorName || '未知'}
                        </Tag>
                      </Space>
                      <span style={{ color: '#666', fontSize: 13 }}>
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        {new Date(submission.submittedAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <Statistic title="重点任务" value={important} valueStyle={{ color: '#fa8c16' }} />
                      <Statistic title="常规工作" value={normal} valueStyle={{ color: '#52c41a' }} />
                      <Statistic title="已完成" value={completed} suffix={`/ ${total}`} />
                      <Statistic title="完成率" value={rate} suffix="%" />
                    </div>
                  </Card>

                  {/* 本周工作内容 */}
                  <Card title="📝 本周工作内容" size="small" style={{ marginBottom: 16 }}>
                    {(() => {
                      if (tasks.length > 0) {
                        const imp = tasks.filter(t => t.highlighted);
                        const norm = tasks.filter(t => !t.highlighted);
                        return (
                          <div>
                            {imp.length > 0 && (
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontWeight: 'bold', color: '#fa8c16', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>🔥</span> 重点工作
                                </div>
                                {imp.map(t => renderSnapshotTask(t))}
                              </div>
                            )}
                            {norm.length > 0 && (
                              <div>
                                <div style={{ fontWeight: 'bold', color: '#52c41a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>🌿</span> 常规工作
                                </div>
                                {norm.map(t => renderSnapshotTask(t))}
                              </div>
                            )}
                          </div>
                        );
                      }
                      if (submission.content?.currentWork) {
                        return <pre style={{ whiteSpace: 'pre-wrap', margin: 0, background: '#f5f5f5', padding: 12, borderRadius: 6 }}>{submission.content.currentWork}</pre>;
                      }
                      return <Empty description="暂无内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
                    })()}
                  </Card>

                  {/* 下周工作计划 */}
                  <Card title="📅 下周工作计划" size="small" style={{ marginBottom: 16 }}>
                    {(() => {
                      const np = submission.content?.nextPlan;
                      let nextTasks: TaskItem[] = [];
                      if (Array.isArray(np)) {
                        nextTasks = np;
                      } else if (typeof np === 'string' && np.trim().startsWith('[')) {
                        try { nextTasks = JSON.parse(np); } catch { /* ignore */ }
                      }
                      if (nextTasks.length > 0) {
                        return nextTasks.map(t => renderSnapshotTask(t));
                      }
                      if (np) {
                        return <pre style={{ whiteSpace: 'pre-wrap', margin: 0, background: '#f5f5f5', padding: 12, borderRadius: 6 }}>{np}</pre>;
                      }
                      return <Empty description="暂无内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
                    })()}
                  </Card>

                  {/* 上周工作计划 */}
                  {submission.content?.plan && (
                    <Card title="📋 上周工作计划" size="small" style={{ marginBottom: 16 }}>
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, background: '#f5f5f5', padding: 12, borderRadius: 6 }}>{submission.content.plan}</pre>
                    </Card>
                  )}

                  {/* 本周心得 */}
                  {submission.content?.thoughts && (
                    <Card title="💡 本周心得" size="small" style={{ marginBottom: 16 }}>
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, background: '#f5f5f5', padding: 12, borderRadius: 6 }}>{submission.content.thoughts}</pre>
                    </Card>
                  )}

                  {/* 问题与风险 */}
                  {submission.content?.other && (
                    <Card title="⚠️ 问题与风险" size="small" style={{ marginBottom: 16 }}>
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, background: '#f5f5f5', padding: 12, borderRadius: 6 }}>{submission.content.other}</pre>
                    </Card>
                  )}

                  {idx < submissions.length - 1 && <Divider style={{ margin: '24px 0', borderColor: '#d9d9d9' }} />}
                </div>
              );
            })}
          </div>
        ) : (
          <SubmissionDiffView submissions={submissions} />
        )}
      </Drawer>

      <ImportReportsModal
        open={importModalOpen}
        weekLabel={selectedWeek}
        onClose={() => setImportModalOpen(false)}
        onImported={() => {
          setImportModalOpen(false);
          refreshCurrentReport();
          // 导入后更新 base 快照，避免后续提交时用旧 base 做三向合并
          const imported = getReport(selectedWeek, selectedDept);
          if (imported) {
            baseReportRef.current = JSON.parse(JSON.stringify(imported));
          }
        }}
      />

      <ParseBlockModal
        open={parseBlockTarget !== null}
        title={parseBlockTarget
          ? `${parseBlockTarget.block === 'content' ? '本周工作' : '下周计划'} · ${parseBlockTarget.highlighted ? '重点工作' : '常规工作'}`
          : ''}
        hasExisting={parseBlockTarget
          ? (parseBlockTarget.block === 'content' ? (report?.content || []) : nextPlanTasks)
              .some(t => !!t.highlighted === parseBlockTarget.highlighted)
          : false}
        onCancel={() => setParseBlockTarget(null)}
        onApply={handleParseBlockApply}
      />

      {(() => {
        const src = parseIntoTarget?.block === 'nextPlan' ? nextPlanTasks : (report?.content || []);
        const target = parseIntoTarget ? findTaskInTree(src, parseIntoTarget.taskId) : null;
        return (
          <ParseBlockModal
            open={parseIntoTarget !== null}
            variant="task"
            title={target?.text || ''}
            hasExisting={(target?.children?.length ?? 0) > 0}
            onCancel={() => setParseIntoTarget(null)}
            onApply={handleParseIntoApply}
          />
        );
      })()}

      <MergeConflictModal
        open={mergeModalOpen}
        conflicts={mergeConflicts}
        draft={mergeDraft}
        onCancel={() => {
          setMergeModalOpen(false);
          setMergeDraft(null);
          setMergeConflicts([]);
        }}
        onConfirm={handleResolveMerge}
      />

      <Modal
        title="发现未保存的本地编辑"
        open={draftRecoveryOpen}
        onOk={handleRecoverDraft}
        onCancel={handleDiscardDraft}
        okText="保留本地编辑草稿"
        cancelText="同步服务器版本"
        maskClosable={false}
        closable={false}
      >
        <p>
          当前周报 <Tag>{selectedWeek}</Tag> <Tag>{selectedDept}</Tag> 在您的设备上有一份未保存的编辑。
        </p>
        <p>请选择保留哪一份内容：</p>
        <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
          <Card size="small" title="本地草稿" style={{ flex: 1, borderColor: '#1677ff' }}>
            <div style={{ fontWeight: 500, color: '#1677ff', fontSize: 16 }}>
              {draftRecoveryDraft?.savedAt ? dayjs(draftRecoveryDraft.savedAt).format('MM-DD HH:mm') : '-'}
            </div>
            <div style={{ color: '#666', fontSize: 12, marginTop: 8 }}>
              {summarizeReportContent(draftRecoveryDraft?.report)}
            </div>
            <div style={{ color: '#999', fontSize: 11, marginTop: 4 }}>
              您上次在此设备编辑的内容，尚未同步到服务器
            </div>
          </Card>
          <Card size="small" title="服务器版本" style={{ flex: 1, borderColor: '#52c41a' }}>
            <div style={{ fontWeight: 500, color: '#52c41a', fontSize: 16 }}>
              {report?.updatedAt ? dayjs(report.updatedAt).format('MM-DD HH:mm') : '-'}
            </div>
            <div style={{ color: '#666', fontSize: 12, marginTop: 8 }}>
              {summarizeReportContent(report)}
            </div>
            <div style={{ color: '#999', fontSize: 11, marginTop: 4 }}>
              当前服务器保存的最新版本
            </div>
          </Card>
        </div>
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="选择后仍可修改"
          description="选择「保留本地编辑草稿」只会把草稿恢复到编辑区，不会立刻覆盖服务器；您后续提交时如果服务器已有更新，会进入合并确认流程。"
        />
      </Modal>

      {/* 新建周报弹窗 */}
      <Modal
        title="新建周报"
        open={createModalVisible}
        onOk={handleCreateConfirm}
        onCancel={() => setCreateModalVisible(false)}
        okText="创建"
        cancelText="取消"
        maskClosable={false}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>截止日期</div>
          <DatePicker
            value={createDate}
            onChange={setCreateDate}
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
            placeholder="选择截止日期"
          />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>截止时间（24小时制）</div>
          <TimePicker
            value={createTime}
            onChange={setCreateTime}
            style={{ width: '100%' }}
            format="HH:mm"
            showSecond={false}
            placeholder="选择截止时间"
          />
        </div>
        <div style={{ marginTop: 12, color: '#888', fontSize: 12 }}>
          周报周期名将以截止日期为准，如 2026-07-02 对应周期名 20260702
        </div>
      </Modal>

      {/* AI 全局分析配置弹窗 */}
      <Modal
        title="🤖 AI 全局分析配置"
        open={globalAnalysisModalOpen}
        onOk={handleRunGlobalAnalysis}
        onCancel={() => setGlobalAnalysisModalOpen(false)}
        okText="开始分析"
        cancelText="取消"
        maskClosable={false}
        width={760}
        footer={(
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button
              onClick={() => {
                gaPromptDirtyRef.current = false;
                setGaPrompt(buildDefaultGaPrompt(gaBaseWeek, gaCompareWeek, gaFocusStart));
              }}
            >
              恢复默认提示词
            </Button>
            <Space>
              <Button onClick={() => setGlobalAnalysisModalOpen(false)}>取消</Button>
              <Button type="primary" loading={globalAnalysisLoading} onClick={handleRunGlobalAnalysis}>
                开始分析
              </Button>
            </Space>
          </div>
        )}
      >
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>基准周报周期</div>
            <Select
              value={gaBaseWeek}
              onChange={setGaBaseWeek}
              style={{ width: '100%' }}
              options={weekOptions.map(w => ({ label: formatWeekLabel(w), value: w }))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>对比周报周期</div>
            <Select
              value={gaCompareWeek}
              onChange={setGaCompareWeek}
              style={{ width: '100%' }}
              options={weekOptions.map(w => ({ label: formatWeekLabel(w), value: w }))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>重点工作起点周次</div>
            <Input
              value={gaFocusStart}
              onChange={e => setGaFocusStart(e.target.value)}
              placeholder="如 20260313"
              maxLength={8}
            />
          </div>
        </div>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>提示词（支持自定义，{'{tableRows}'} 和 {'{deptDetails}'} 会被替换为实际数据）</div>
          <TextArea
            value={gaPrompt}
            onChange={e => {
              gaPromptDirtyRef.current = true;
              setGaPrompt(e.target.value);
            }}
            rows={16}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>
      </Modal>

      {/* 删除周报周期确认弹窗 */}
      <Modal
        title="确认删除周报周期"
        open={deleteModalVisible}
        onOk={handleDeleteConfirm}
        onCancel={() => { setDeleteModalVisible(false); setDeleteWeekLabel(null); }}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        maskClosable={false}
      >
        <p>
          确定要删除周报周期 <strong>{deleteWeekLabel ? formatWeekLabel(deleteWeekLabel) : ''}</strong> 吗？
        </p>
        <p style={{ color: '#888', fontSize: 12 }}>
          该周期将从周报周期下拉框中移除并进入回收站，数据不会删除，超级管理员可在左侧菜单「回收站」中一键恢复。
        </p>
      </Modal>

      {/* 优化建议弹窗 */}
      <Modal
        title="💡 优化建议"
        open={suggestionOpen}
        onOk={handleSubmitSuggestion}
        onCancel={() => setSuggestionOpen(false)}
        confirmLoading={suggestionSubmitting}
        okText="提交"
        cancelText="取消"
        maskClosable={false}
      >
        <Input.TextArea
          rows={5}
          value={suggestionContent}
          onChange={(e) => setSuggestionContent(e.target.value)}
          placeholder="请描述您遇到的问题或优化建议，我们将尽快处理..."
          maxLength={5000}
          showCount
        />
      </Modal>
    </Layout>
    </>
  );
};

export default WeeklyReportV2;
