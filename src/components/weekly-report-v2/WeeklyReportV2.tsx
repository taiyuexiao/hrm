/**
 * 企业级智能周报管理系统 V2
 * 核心页面：左中右三栏布局
 * 数据层：localStorage（替代数据库）
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Layout, Card, Button, Select, Avatar, Badge, Tag, message,
  Input, Space, Typography, Divider, Empty, Spin, Dropdown, Drawer
} from 'antd';
import {
  FileTextOutlined, RobotFilled,
  TeamOutlined, CalendarOutlined, MessageOutlined, BarChartOutlined,
  CheckCircleOutlined, CommentOutlined, BulbOutlined,
  LeftOutlined, RightOutlined, CheckOutlined, DownOutlined, BookOutlined,
  FileWordOutlined, FileMarkdownOutlined,
  PlusOutlined, StarOutlined,
} from '@ant-design/icons';
import { WeeklyReport, User, SYSTEM_USERS, DEPTS, Comment, TaskItem } from './types';
import {
  getCurrentUser, setCurrentUser, getReport, getReports, saveReport,
  canEditDept, genId, initDemoData, getPrevWeekReport, parsePlanToTasks, DEFAULT_WEEK,
  formatWeekLabel, getReportsByWeek, getDynamicWeekOptions, getNextWeekLabel,
  flattenTasks, deleteTaskFromTree, updateTaskInTree, getLatestWeekForDept,
} from './data';
import { LLM_CONFIG } from '../../config/llm';
import './styles.css';
import * as XLSX from 'xlsx';
import KnowledgeBase from '../knowledge-base/KnowledgeBase';

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

const BLOCK_CONFIG = [
  { key: 'content', title: '本周工作内容', color: '#1890ff', icon: <FileTextOutlined /> },
  { key: 'nextPlan', title: '下周工作计划', color: '#52c41a', icon: <CalendarOutlined /> },
  { key: 'thoughts', title: '本周心得', color: '#722ed1', icon: <BulbOutlined /> },
  { key: 'other', title: '其他', color: '#fa8c16', icon: <MessageOutlined /> },
] as const;

// 递归渲染树形 checkbox
const TaskTree: React.FC<{
  tasks: TaskItem[];
  editable: boolean;
  depth?: number;
  onToggle: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onHighlight: (id: string) => void;
}> = ({ tasks, editable, depth = 0, onToggle, onTextChange, onDelete, onAddChild, onHighlight }) => {
  return (
    <>
      {tasks.map(task => (
        <div key={task.id} style={{ marginLeft: depth * 16, marginBottom: 2 }}>
          <div
            className="task-row"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: task.highlighted ? '#fff7e6' : 'transparent',
              borderRadius: 6,
              padding: '4px 6px',
              border: task.highlighted ? '1px solid #ffd591' : '1px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            <div
              onClick={() => editable && onToggle(task.id)}
              style={{
                width: 16, height: 16, minWidth: 16,
                border: `2px solid ${task.checked ? '#52c41a' : '#d9d9d9'}`,
                borderRadius: 3, marginTop: 3,
                cursor: editable ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: task.checked ? '#52c41a' : '#fff',
                transition: 'all 0.2s',
              }}
            >
              {task.checked && <CheckOutlined style={{ color: '#fff', fontSize: 10 }} />}
            </div>
            <TextArea
              value={task.text}
              onChange={e => onTextChange(task.id, e.target.value)}
              readOnly={!editable}
              autoSize={{ minRows: 1, maxRows: 6 }}
              variant="borderless"
              style={{
                flex: 1, padding: '2px 0', fontSize: 14, lineHeight: 1.6,
                textDecoration: task.checked ? 'line-through' : 'none',
                color: task.checked ? '#999' : '#333',
                background: 'transparent',
                resize: 'none',
              }}
            />
            {editable && (
              <Space size={0} className="task-actions">
                <Button
                  type="text"
                  size="small"
                  title={task.highlighted ? '取消重点' : '标记为重点'}
                  style={{ padding: '0 4px', minWidth: 24, color: task.highlighted ? '#faad14' : '#d9d9d9' }}
                  onClick={() => onHighlight(task.id)}
                >
                  <StarOutlined />
                </Button>
                <Button
                  type="text"
                  size="small"
                  title="添加子任务"
                  style={{ padding: '0 4px', minWidth: 24, color: '#8c8c8c' }}
                  onClick={() => onAddChild(task.id)}
                >
                  <PlusOutlined style={{ fontSize: 12 }} />
                </Button>
                <Button
                  type="text"
                  size="small"
                  danger
                  title="删除"
                  style={{ padding: '0 4px', minWidth: 24 }}
                  onClick={() => onDelete(task.id)}
                >
                  ×
                </Button>
              </Space>
            )}
          </div>
          {task.children && task.children.length > 0 && (
            <TaskTree
              tasks={task.children}
              editable={editable}
              depth={depth + 1}
              onToggle={onToggle}
              onTextChange={onTextChange}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onHighlight={onHighlight}
            />
          )}
        </div>
      ))}
    </>
  );
};

const WeeklyReportV2: React.FC = () => {
  const [currentUser, setCurrentUserState] = useState<User>(getCurrentUser());
  const [selectedWeek, setSelectedWeek] = useState(DEFAULT_WEEK);
  // 允许所有用户选择任何部门查看，默认显示自己的部门
  // 如果用户部门不在 DEPTS 中（如总经理室），默认显示第一个有数据的部门
  const [selectedDept, setSelectedDept] = useState(
    DEPTS.includes(currentUser.dept) ? currentUser.dept : DEPTS[0]
  );
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [globalAnalysisLoading, setGlobalAnalysisLoading] = useState(false);
  const [globalAnalysisResult, setGlobalAnalysisResult] = useState<string>('');
  const [newComment, setNewComment] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionTarget, setMentionTarget] = useState<'comment' | 'reply'>('comment');
  const [commentCollapsed, setCommentCollapsed] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(false);
  const [weekOptions, setWeekOptions] = useState<string[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const isLoginMode = useMemo(() => !!localStorage.getItem('auth-user'), []);
  const editorRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);
  const [selPopup, setSelPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
    block: 'content' | 'nextPlan' | 'thoughts' | 'other';
    drafting: boolean;
  }>({ visible: false, x: 0, y: 0, text: '', block: 'nextPlan', drafting: false });
  const [hoveredCommentIds, setHoveredCommentIds] = useState<string[]>([]);

  // 初始化 demo 数据
  useEffect(() => {
    initDemoData().then(() => {
      setWeekOptions(getDynamicWeekOptions());
      setDataLoaded(true);
      // 如果当前默认周+部门没有数据，自动跳转到该部门最新有数据的周
      const found = getReport(selectedWeek, selectedDept);
      if (!found) {
        const latestWeek = getLatestWeekForDept(selectedDept);
        if (latestWeek) {
          setSelectedWeek(latestWeek);
        }
      }
    }).catch(() => {
      message.error('无法加载周报数据，请检查后端服务是否正常运行');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点击外部关闭批注弹窗
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.ant-btn') && !target.closest('.ant-input-textarea')) {
        setSelPopup(prev => prev.visible ? { ...prev, visible: false, drafting: false } : prev);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  // 计算是否可编辑（必须在自动保存 useEffect 之前）
  const editable = useMemo(() => canEditDept(currentUser, selectedDept), [currentUser, selectedDept]);

  // 自动保存：当report变化时，延迟3秒后自动保存（仅在有内容时）
  useEffect(() => {
    if (!report || !editable) return;

    // 跳过初始加载时的保存
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    // 空数据不触发保存，避免污染后端
    const hasContent = !!report.currentWork || !!report.nextPlan || !!report.thoughts || !!report.other || flattenTasks(report.content).length > 0;
    if (!hasContent) return;

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 设置新的定时器，3秒后自动保存
    autoSaveTimerRef.current = setTimeout(() => {
      saveReport(report);
      setSaving(true);
      setTimeout(() => setSaving(false), 300);
    }, 3000);

    // 清理函数
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [report, editable]);

  // 切换部门时，如果当前周次没有数据，自动跳转到该部门有数据的最晚周次
  useEffect(() => {
    if (!dataLoaded) return;
    const found = getReport(selectedWeek, selectedDept);
    if (!found) {
      const latestWeek = getLatestWeekForDept(selectedDept);
      if (latestWeek && latestWeek !== selectedWeek) {
        setSelectedWeek(latestWeek);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDept, dataLoaded]);

  // 加载周报
  useEffect(() => {
    // 切换周报时重置初始加载标记
    isInitialLoadRef.current = true;
    const found = getReport(selectedWeek, selectedDept);
    if (found) {
      setReport(found);
    } else {
      // 获取上周计划，自动填充为本周任务列表
      const prevReport = getPrevWeekReport(selectedWeek, selectedDept);
      const defaultTasks = prevReport ? parsePlanToTasks(prevReport.nextPlan) : [];
      // 创建新周报
      const newReport: WeeklyReport = {
        id: genId(),
        weekLabel: selectedWeek,
        dept: selectedDept,
        authorId: currentUser.id,
        authorName: currentUser.name,
        plan: prevReport ? prevReport.nextPlan : '',
        content: defaultTasks,
        currentWork: '',
        nextPlan: '',
        thoughts: '',
        other: '',
        comments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setReport(newReport);
    }
  }, [selectedWeek, selectedDept, currentUser, dataLoaded]);

  const handleChange = useCallback((field: keyof WeeklyReport, value: any) => {
    setReport(prev => prev ? { ...prev, [field]: value } : prev);
  }, []);

  // 级联勾选：toggle 父 → 所有子同步；所有子全选 → 父自动选
  const handleTaskToggle = useCallback((taskId: string) => {
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
    setReport(prev => {
      if (!prev) return prev;
      return { ...prev, content: updateTaskInTree(prev.content, taskId, t => ({ ...t, text })) };
    });
  }, []);

  const handleTaskHighlight = useCallback((taskId: string) => {
    setReport(prev => {
      if (!prev) return prev;
      return { ...prev, content: updateTaskInTree(prev.content, taskId, t => ({ ...t, highlighted: !t.highlighted })) };
    });
  }, []);

  const handleAddTask = useCallback((parentId?: string) => {
    setReport(prev => {
      if (!prev) return prev;
      const newTask: TaskItem = { id: genId(), text: '', checked: false };
      if (!parentId) {
        return { ...prev, content: [...prev.content, newTask] };
      }
      return { ...prev, content: updateTaskInTree(prev.content, parentId, t => ({
        ...t,
        children: [...(t.children || []), newTask],
      })) };
    });
  }, []);

  const handleDeleteTask = useCallback((taskId: string) => {
    setReport(prev => {
      if (!prev) return prev;
      return { ...prev, content: deleteTaskFromTree(prev.content, taskId) };
    });
  }, []);

  const handleExportCurrent = useCallback(() => {
    if (!report) return;
    const data = [{
      部门: report.dept,
      时间: report.weekLabel,
      上周工作计划: flattenTasks(report.content).map(t => (t.checked ? '[✓] ' : '[ ] ') + t.text).join('\n'),
      本周工作内容: report.currentWork,
      下周工作计划: report.nextPlan,
      本周心得: report.thoughts,
      其他: report.other,
    }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '周报');
    XLSX.writeFile(wb, `${report.dept}_${report.weekLabel}_周报.xlsx`);
    message.success('当前信息已导出');
  }, [report]);

  const handleExportAll = useCallback(() => {
    const reports = getReports();
    if (reports.length === 0) {
      message.warning('暂无数据可导出');
      return;
    }
    const data = reports.map((r: WeeklyReport) => ({
      部门: r.dept,
      时间: r.weekLabel,
      上周工作计划: Array.isArray(r.content)
        ? flattenTasks(r.content).map((t: any) => (t.checked ? '[✓] ' : '[ ] ') + t.text).join('\n')
        : String(r.content),
      本周工作内容: (r as any).currentWork || '',
      下周工作计划: r.nextPlan,
      本周心得: (r as any).thoughts || '',
      其他: (r as any).other || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '全部周报');
    XLSX.writeFile(wb, `全部周报_${new Date().toISOString().slice(0, 10)}.xlsx`);
    message.success('全部信息已导出');
  }, []);

  const handleCreateNextWeek = useCallback(() => {
    const nextWeek = getNextWeekLabel(selectedWeek);
    const targetDept = selectedDept;

    // 检查是否已存在
    const existing = getReport(nextWeek, targetDept);
    if (existing) {
      message.info('下周的周报已存在，将跳转至编辑');
      setSelectedWeek(nextWeek);
      return;
    }

    // 创建新周报（智能继承上周计划）
    const prevReport = getPrevWeekReport(nextWeek, targetDept);
    const defaultTasks = prevReport ? parsePlanToTasks(prevReport.nextPlan) : [];
    const newReport: WeeklyReport = {
      id: genId(),
      weekLabel: nextWeek,
      dept: targetDept,
      authorId: currentUser.id,
      authorName: currentUser.name,
      plan: prevReport ? prevReport.nextPlan : '',
      content: defaultTasks,
      currentWork: '',
      nextPlan: '',
      thoughts: '',
      other: '',
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveReport(newReport);
    setWeekOptions(getDynamicWeekOptions());
    setSelectedWeek(nextWeek);
    message.success('已创建下周报');
  }, [selectedWeek, selectedDept, currentUser]);

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

      const prompt = `你是一位数据部门的管理顾问，擅长周报分析与交叉周对比。\n\n请对以下工作周报进行分析，并返回严格的 JSON 格式：\n\n【本周数据】\n- 本周计划：${report.plan}\n- 本周内容：${flattenTasks(report.content).map(t => t.text).join('；')}\n- 下周计划：${report.nextPlan}\n\n【上周计划回顾】\n${prevNextPlan}\n\n请输出以下 JSON 结构（不要添加 markdown 代码块标记）：\n{\n  "summary": "200字以内的精炼总结",\n  "completionRate": 0-100的数字,\n  "completed": ["已完成的具体事项1", "已完成的具体事项2"],\n  "delayed": ["延迟的具体事项1"],\n  "risks": ["风险预警1"]\n}\n\n分析要求：\n1. summary: 精炼概括本周工作重点与进展\n2. completionRate: 对比上周"下周计划"与本周"本周内容"，估算计划完成百分比\n3. completed: 列出本周实际完成的关键事项\n4. delayed: 列出计划中有但未完成或延迟的事项\n5. risks: 识别潜在风险（如工作负荷不均、关键任务延迟、资源不足等）`;

      const resp = await fetch(LLM_CONFIG.chatCompletionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          model: LLM_CONFIG.model,
          messages: [
            { role: 'system', content: '你是数据部门的管理顾问，擅长周报分析。请严格按照要求的 JSON 格式输出，不要添加 markdown 代码块。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const rawText = data.choices?.[0]?.message?.content?.trim() || '';

      let aiSummary = rawText;
      let aiAnalysis = report.aiAnalysis;
      try {
        const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        aiSummary = parsed.summary || rawText;
        aiAnalysis = {
          completionRate: typeof parsed.completionRate === 'number' ? Math.min(100, Math.max(0, Math.round(parsed.completionRate))) : 70,
          completed: Array.isArray(parsed.completed) ? parsed.completed : [],
          delayed: Array.isArray(parsed.delayed) ? parsed.delayed : [],
          risks: Array.isArray(parsed.risks) ? parsed.risks : [],
          highlights: [],
        };
      } catch {
        aiAnalysis = {
          completionRate: 70,
          completed: [],
          delayed: [],
          risks: [],
          highlights: [],
        };
      }

      const updated = { ...report, aiSummary, aiAnalysis };
      setReport(updated);
      saveReport(updated);
      message.success('AI 分析完成');
    } catch (e: any) {
      message.error(`AI 分析失败: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  }, [report]);

  const handleGlobalAnalysis = useCallback(async () => {
    setGlobalAnalysisLoading(true);
    try {
      // 获取当前周所有部门的周报
      const allReports = getReportsByWeek(selectedWeek);

      if (allReports.length === 0) {
        message.warning('当前周没有周报数据');
        return;
      }

      // 构建分析数据
      const analysisData = allReports.map(r => {
        const prevReport = getPrevWeekReport(r.weekLabel, r.dept);
        return {
          dept: r.dept,
          currentContent: flattenTasks(r.content).map(t => t.text).join('\n'),
          currentWork: r.currentWork || '',
          nextPlan: r.nextPlan,
          prevNextPlan: prevReport?.nextPlan || '无上周数据',
        };
      });

      const prompt = `你是一位数据部门的高级管理顾问，擅长周报全局分析与战略洞察。

请对以下所有科室的周报进行全局分析，输出格式必须严格遵循以下 Markdown 格式（不要添加代码块标记）：

# ${selectedWeek} 周报全局分析

## 一、各科室完成度与偏离度

| 科室 | 偏离度 | 核心判断 |
|------|--------|----------|
${analysisData.map(d => `| ${d.dept} | [待分析] | [待分析] |`).join('\n')}

## 二、0327→${selectedWeek} 重点工作整体推进

[请分析从2026-W12(0327)至今的重点工作推进情况，每个重点工作一段，格式如：**工作名称**：进展描述。]

## 三、${selectedWeek}「三句话关键结论」

**本周相对本周计划**：[分析本周实际完成情况与计划的对比]

**0313 以来阶段主线**：[总结从0313以来的主要工作主线和变化趋势]

**盯盘清单**：[列出需要重点关注的科室和事项]

---

**分析要求：**

1. **偏离度评判**：根据本周实际工作与上周"下周计划"的对比，评判为：绿、绿黄、黄、黄红、红 五档
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

${analysisData.map(d => `
### ${d.dept}
**上周计划（下周工作计划）：**
${d.prevNextPlan}

**本周实际完成：**
${d.currentContent}
${d.currentWork}

**本周下周计划：**
${d.nextPlan}
`).join('\n---\n')}`;

      const resp = await fetch(LLM_CONFIG.chatCompletionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          model: LLM_CONFIG.model,
          messages: [
            { role: 'system', content: '你是数据部门的高级管理顾问，擅长周报全局分析。请严格按照要求的 Markdown 格式输出，不要添加代码块标记。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        }),
      });

      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const result = data.choices?.[0]?.message?.content?.trim() || '';

      setGlobalAnalysisResult(result);
      message.success('AI 全局分析完成');
    } catch (e: any) {
      message.error(`AI 全局分析失败: ${e.message}`);
    } finally {
      setGlobalAnalysisLoading(false);
    }
  }, [selectedWeek]);

  const handleExportMarkdown = useCallback(() => {
    if (!globalAnalysisResult) return;
    const blob = new Blob([globalAnalysisResult], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI全局分析_${selectedWeek}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('Markdown 文件已导出');
  }, [globalAnalysisResult, selectedWeek]);

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
    a.download = `AI全局分析_${selectedWeek}_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('Word 文件已导出');
  }, [globalAnalysisResult, selectedWeek]);

  const handleAddComment = useCallback((targetText?: string, targetBlock?: 'content' | 'nextPlan' | 'thoughts' | 'other') => {
    if (!report || !newComment.trim()) return;
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
      mentionIds,
      replies: [],
      readBy: [currentUser.id],
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    const updated = { ...report, comments: [comment, ...report.comments] };
    setReport(updated);
    saveReport(updated);
    setNewComment('');
    setMentionOpen(false);
    setSelPopup(prev => ({ ...prev, visible: false, drafting: false }));
    message.success('批注已添加');
  }, [report, newComment, currentUser]);

  const handleAddReply = useCallback((parentId: string) => {
    if (!report || !replyContent.trim()) return;
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
    saveReport(updated);
    setReplyContent('');
    setReplyToId(null);
    setMentionOpen(false);
    message.success('回复已添加');
  }, [report, replyContent, currentUser]);

  const handleToggleResolved = useCallback((commentId: string) => {
    if (!report || currentUser.role !== 'admin') return;
    const updatedComments = report.comments.map(c => {
      if (c.id === commentId) {
        return { ...c, resolved: !c.resolved };
      }
      return c;
    });
    const updated = { ...report, comments: updatedComments };
    setReport(updated);
    saveReport(updated);
    message.success('状态已更新');
  }, [report, currentUser]);

  const handleSwitchUser = (userId: string) => {
    if (isLoginMode) return; // 登录模式下禁止切换身份
    const user = SYSTEM_USERS.find(u => u.id === userId);
    if (user) {
      setCurrentUser(user);
      setCurrentUserState(user);
      if (user.role !== 'admin') {
        setSelectedDept(user.dept);
      }
      message.success(`已切换为：${user.name}`);
    }
  };

  return (
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
            <Select value={selectedWeek} onChange={setSelectedWeek} style={{ width: 180 }}
              options={weekOptions.map(w => ({ label: formatWeekLabel(w), value: w }))} />
          </Space>
          <Space>
            <TeamOutlined style={{ color: '#999' }} />
            <Text type="secondary">当前科室：</Text>
            <Select value={selectedDept} onChange={setSelectedDept} style={{ width: 150 }}
              options={DEPTS.map(d => ({ label: d, value: d }))} />
          </Space>
          <Space>
            <TeamOutlined style={{ color: '#999' }} />
            <Text type="secondary">当前身份：</Text>
            {isLoginMode ? (
              <Tag color={currentUser.color} style={{ minWidth: 80, textAlign: 'center' }}>{currentUser.name}</Tag>
            ) : (
              <Select value={currentUser.id} onChange={handleSwitchUser} style={{ width: 160 }}
                options={SYSTEM_USERS.map(u => ({ label: `${u.name} (${u.dept})`, value: u.id }))} />
            )}
          </Space>
        </Space>

        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateNextWeek}>
            新建下周报
          </Button>
          <Button type="primary" icon={<RobotFilled />} loading={globalAnalysisLoading} onClick={handleGlobalAnalysis}>
            AI 全局分析
          </Button>
          <Button icon={<BookOutlined />} onClick={() => setKnowledgeBaseOpen(true)}>
            知识库
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: '16px 24px', overflowY: 'auto', marginLeft: 0 }}>
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
                <Dropdown
                  menu={{
                    items: [
                      { key: 'current', label: '导出当前信息', onClick: handleExportCurrent },
                      { key: 'all', label: '导出全部信息', onClick: handleExportAll },
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

            {/* 科室 Tab 切换栏 */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, padding: '6px 10px', background: 'rgba(0,0,0,0.02)', borderRadius: 10 }}>
              {DEPTS.map(dept => {
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, overflowY: 'auto', minHeight: 'calc(75vh - 160px)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <TaskTree
                      tasks={report?.content || []}
                      editable={editable}
                      onToggle={handleTaskToggle}
                      onTextChange={handleTaskTextChange}
                      onDelete={handleDeleteTask}
                      onAddChild={handleAddTask}
                      onHighlight={handleTaskHighlight}
                    />
                    {editable && (
                      <Button type="dashed" size="small" onClick={() => handleAddTask()} style={{ marginTop: 4 }}>
                        + 添加根任务
                      </Button>
                    )}
                  </div>

                </div>
              </Card>

              {/* 下周工作计划 */}
              <Card
                className="mhy-card"
                title={<span style={{ color: '#52c41a', fontWeight: 600 }}><CalendarOutlined /> 下周工作计划</span>}
                style={{ flex: 1, marginBottom: 0, minHeight: 'calc(75vh - 80px)' }}
                bodyStyle={{ padding: '16px 20px', display: 'flex', flexDirection: 'column' }}
              >
                {(() => {
                  const blockKey = 'nextPlan' as const;
                  const value = report?.nextPlan || '';
                  const highlights = report?.comments.filter(c => c.targetBlock === blockKey && c.targetText).map(c => c.targetText!) || [];
                  return (
                    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {highlights.length > 0 && (
                        <div data-overlay style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', padding: '4px 11px', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'transparent', zIndex: 1 }}>
                          {(() => {
                            if (!highlights.length) return value;
                            const pattern = new RegExp(`(${highlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
                            const parts = value.split(pattern);
                            return parts.map((part, i) => highlights.includes(part) ? (
                              <mark key={i} style={{ backgroundColor: 'rgba(255, 214, 102, 0.4)', borderRadius: 3, padding: '1px 2px', pointerEvents: 'auto', cursor: 'pointer' }}
                                onMouseEnter={() => { const ids = report?.comments.filter(c => c.targetBlock === blockKey && c.targetText === part).map(c => c.id) || []; setHoveredCommentIds(ids); }}
                                onMouseLeave={() => setHoveredCommentIds([])}
                              >{part}</mark>
                            ) : <span key={i}>{part}</span>);
                          })()}
                        </div>
                      )}
                      <TextArea placeholder="请输入下周工作计划..." value={value} onChange={e => handleChange(blockKey, e.target.value)} readOnly={!editable}
                        onMouseUp={(e) => { const ta = e.currentTarget as HTMLTextAreaElement; const start = ta.selectionStart; const end = ta.selectionEnd; const text = ta.value.slice(start, end); if (text.trim().length > 0) { setSelPopup({ visible: true, x: e.clientX, y: e.clientY - 45, text: text.trim(), block: blockKey, drafting: false }); } else { setSelPopup(prev => ({ ...prev, visible: false, drafting: false })); } }}
                        onScroll={(e) => { const overlay = e.currentTarget.parentElement?.querySelector('[data-overlay]') as HTMLElement | null; if (overlay) overlay.scrollTop = e.currentTarget.scrollTop; }}
                        style={{ fontSize: 14, lineHeight: 1.8, resize: 'vertical', background: editable ? '#fff' : '#fafafa', borderRadius: 8, position: 'relative', zIndex: 0, flex: 1, minHeight: 'calc(75vh - 180px)' }}
                      />
                    </div>
                  );
                })()}
              </Card>
            </div>

            {/* 下排：本周心得 */}
            <Card className="mhy-card" title={<span style={{ color: '#722ed1', fontWeight: 600 }}><BulbOutlined /> 本周心得</span>} style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}>
              {(() => {
                const blockKey = 'thoughts' as const;
                const value = report?.thoughts || '';
                const highlights = report?.comments.filter(c => c.targetBlock === blockKey && c.targetText).map(c => c.targetText!) || [];
                return (
                  <div style={{ position: 'relative' }}>
                    {highlights.length > 0 && (
                      <div data-overlay style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', padding: '4px 11px', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'transparent', zIndex: 1 }}>
                        {(() => {
                          if (!highlights.length) return value;
                          const pattern = new RegExp(`(${highlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
                          const parts = value.split(pattern);
                          return parts.map((part, i) => highlights.includes(part) ? (
                            <mark key={i} style={{ backgroundColor: 'rgba(255, 214, 102, 0.4)', borderRadius: 3, padding: '1px 2px', pointerEvents: 'auto', cursor: 'pointer' }}
                              onMouseEnter={() => { const ids = report?.comments.filter(c => c.targetBlock === blockKey && c.targetText === part).map(c => c.id) || []; setHoveredCommentIds(ids); }}
                              onMouseLeave={() => setHoveredCommentIds([])}
                            >{part}</mark>
                          ) : <span key={i}>{part}</span>);
                        })()}
                      </div>
                    )}
                    <TextArea rows={3} placeholder="请输入本周心得..." value={value} onChange={e => handleChange(blockKey, e.target.value)} readOnly={!editable}
                      onMouseUp={(e) => { const ta = e.currentTarget as HTMLTextAreaElement; const start = ta.selectionStart; const end = ta.selectionEnd; const text = ta.value.slice(start, end); if (text.trim().length > 0) { setSelPopup({ visible: true, x: e.clientX, y: e.clientY - 45, text: text.trim(), block: blockKey, drafting: false }); } else { setSelPopup(prev => ({ ...prev, visible: false, drafting: false })); } }}
                      onScroll={(e) => { const overlay = e.currentTarget.parentElement?.querySelector('[data-overlay]') as HTMLElement | null; if (overlay) overlay.scrollTop = e.currentTarget.scrollTop; }}
                      style={{ fontSize: 14, lineHeight: 1.8, resize: 'vertical', background: editable ? '#fff' : '#fafafa', borderRadius: 8, position: 'relative', zIndex: 0 }}
                    />
                  </div>
                );
              })()}
            </Card>

            {/* 下排：其他 */}
            <Card className="mhy-card" title={<span style={{ color: '#fa8c16', fontWeight: 600 }}><MessageOutlined /> 其他</span>} style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}>
              {(() => {
                const blockKey = 'other' as const;
                const value = report?.other || '';
                const highlights = report?.comments.filter(c => c.targetBlock === blockKey && c.targetText).map(c => c.targetText!) || [];
                return (
                  <div style={{ position: 'relative' }}>
                    {highlights.length > 0 && (
                      <div data-overlay style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', padding: '4px 11px', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'transparent', zIndex: 1 }}>
                        {(() => {
                          if (!highlights.length) return value;
                          const pattern = new RegExp(`(${highlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
                          const parts = value.split(pattern);
                          return parts.map((part, i) => highlights.includes(part) ? (
                            <mark key={i} style={{ backgroundColor: 'rgba(255, 214, 102, 0.4)', borderRadius: 3, padding: '1px 2px', pointerEvents: 'auto', cursor: 'pointer' }}
                              onMouseEnter={() => { const ids = report?.comments.filter(c => c.targetBlock === blockKey && c.targetText === part).map(c => c.id) || []; setHoveredCommentIds(ids); }}
                              onMouseLeave={() => setHoveredCommentIds([])}
                            >{part}</mark>
                          ) : <span key={i}>{part}</span>);
                        })()}
                      </div>
                    )}
                    <TextArea rows={3} placeholder="请输入其他内容..." value={value} onChange={e => handleChange(blockKey, e.target.value)} readOnly={!editable}
                      onMouseUp={(e) => { const ta = e.currentTarget as HTMLTextAreaElement; const start = ta.selectionStart; const end = ta.selectionEnd; const text = ta.value.slice(start, end); if (text.trim().length > 0) { setSelPopup({ visible: true, x: e.clientX, y: e.clientY - 45, text: text.trim(), block: blockKey, drafting: false }); } else { setSelPopup(prev => ({ ...prev, visible: false, drafting: false })); } }}
                      onScroll={(e) => { const overlay = e.currentTarget.parentElement?.querySelector('[data-overlay]') as HTMLElement | null; if (overlay) overlay.scrollTop = e.currentTarget.scrollTop; }}
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
                      {report && report.comments.length > 0 && (
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
              <div style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
              {report && report.comments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {report.comments.map(c => (
                    <div key={c.id} className={hoveredCommentIds.includes(c.id) ? 'comment-card-bounce' : ''} style={{
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.6)',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.5)',
                      backdropFilter: 'blur(6px)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Avatar size="small" src={c.authorAvatar} style={{ border: `2px solid ${c.authorColor}` }} />
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{c.authorName}</span>
                        <span style={{ fontSize: 11, color: '#bbb', marginLeft: 'auto' }}>
                          {new Date(c.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
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
                        {currentUser.role === 'admin' ? (
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
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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

          {/* AI 总结 */}
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
              onClick={() => setSelPopup({ visible: false, x: 0, y: 0, text: '', block: 'nextPlan', drafting: false })}
            >
              取消
            </Button>
            <Button
              size="small"
              type="primary"
              disabled={!newComment.trim()}
              onClick={() => handleAddComment(selPopup.text, selPopup.block)}
            >
              发送
            </Button>
          </div>
        </div>
      )}

      {/* 知识库抽屉 */}
      <Drawer
        title="📚 周报知识库"
        placement="right"
        onClose={() => setKnowledgeBaseOpen(false)}
        open={knowledgeBaseOpen}
        width="90%"
        bodyStyle={{ padding: 0, height: '100%' }}
        headerStyle={{ borderBottom: '1px solid #e8e8e8' }}
        closable={true}
      >
        <KnowledgeBase />
      </Drawer>

      {/* AI 全局分析结果抽屉 */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 40 }}>
            <span>🤖 AI 全局分析 - {selectedWeek}</span>
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
    </Layout>
  );
};

export default WeeklyReportV2;
