import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Layout, Select, Typography, Table, Spin, Empty, message, Card,
  Input, Button, Avatar, Tag, Badge, Divider,
} from 'antd';
import {
  CalendarOutlined, TeamOutlined, PushpinOutlined, FileTextOutlined,
  MessageOutlined, LeftOutlined, RightOutlined, CommentOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { WeeklyReport, TaskItem, Comment as ReportComment, Reply, SYSTEM_USERS } from './types';
import { useDepts, getDeptsSnapshot } from '../../services/deptStore';
import {
  getCurrentUser,
  formatWeekLabel, getDynamicWeekOptions, loadReports,
  parseNextPlan, fetchReportDetail, fetchComments,
  addCommentApi, addReplyApi, deleteCommentApi, deleteReplyApi, toggleResolvedApi,
  hasPermission, genId,
} from './data';
import './styles.css';
import { buildHighlightRanges, getSelectionOffsetsInContainer, trimSelectionOffsets } from './comment-highlights';

const { TextArea } = Input;

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const BLOCK_CONFIG = [
  { key: 'content', title: '本周工作内容', color: '#1890ff', icon: <FileTextOutlined /> },
  { key: 'nextPlan', title: '下周工作计划', color: '#52c41a', icon: <CalendarOutlined /> },
  { key: 'other', title: '问题与风险', color: '#cf1322', icon: <PushpinOutlined /> },
  { key: 'thoughts', title: '其他', color: '#722ed1', icon: <FileTextOutlined /> },
] as const;

function extractMentions(text: string): string[] {
  const mentions = text.match(/@[^\s@]+/g) || [];
  return SYSTEM_USERS
    .filter(u => mentions.some(m => m.slice(1) === u.name))
    .map(u => u.id);
}

function recordActionLog(payload: {
  action: string;
  targetType: string;
  targetId: string;
  targetDesc: string;
  details?: Record<string, any>;
}) {
  fetch('/api/action-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function flattenTasks(tasks: TaskItem[], depth = 0): Array<{ task: TaskItem; depth: number }> {
  const result: Array<{ task: TaskItem; depth: number }> = [];
  for (const t of tasks) {
    result.push({ task: t, depth });
    if (t.children && t.children.length > 0) {
      result.push(...flattenTasks(t.children, depth + 1));
    }
  }
  return result;
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

function HighlightSpan({
  children,
  commentIds,
  activeCommentId,
  hoveredCommentIds,
  onHoverComments,
  onActivateComments,
}: {
  children: React.ReactNode;
  commentIds: string[];
  activeCommentId: string | null;
  hoveredCommentIds: string[];
  onHoverComments: (ids: string[]) => void;
  onActivateComments: (ids: string[]) => void;
}) {
  const isActive = activeCommentId ? commentIds.includes(activeCommentId) : false;
  const isHovered = commentIds.some(id => hoveredCommentIds.includes(id));
  const highlighted = isActive || isHovered;
  return (
    <mark
      data-comment-ids={commentIds.join(',')}
      style={{
        backgroundColor: highlighted ? 'rgba(255, 236, 61, 0.35)' : 'transparent',
        color: 'transparent',
        borderBottom: '2px solid #fa8c16',
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={() => onHoverComments(commentIds)}
      onMouseLeave={() => onHoverComments([])}
      onClick={e => {
        e.stopPropagation();
        onActivateComments(commentIds);
      }}
    >
      {children}
    </mark>
  );
}

function highlightTaskText(
  text: string,
  blockKey: 'content' | 'nextPlan',
  comments: ReportComment[],
  hoveredCommentIds: string[],
  activeCommentId: string | null,
  onHoverComments: (ids: string[]) => void,
  onActivateComments: (ids: string[]) => void,
) {
  const ranges = buildHighlightRanges(text, comments, blockKey);
  if (ranges.length === 0) {
    return <Text style={{ fontSize: 14, color: '#262626' }}>{text}</Text>;
  }

  const result: React.ReactNode[] = [];
  let lastEnd = 0;
  for (const r of ranges) {
    if (r.start > lastEnd) {
      result.push(<span key={`pre-${lastEnd}`}>{text.slice(lastEnd, r.start)}</span>);
    }
    const part = text.slice(r.start, r.end);
    result.push(
      <HighlightSpan
        key={`match-${r.start}`}
        commentIds={r.commentIds}
        activeCommentId={activeCommentId}
        hoveredCommentIds={hoveredCommentIds}
        onHoverComments={onHoverComments}
        onActivateComments={onActivateComments}
      >
        <Text style={{ fontSize: 14, color: '#262626' }}>{part}</Text>
      </HighlightSpan>
    );
    lastEnd = r.end;
  }
  if (lastEnd < text.length) {
    result.push(<span key={`post-${lastEnd}`}>{text.slice(lastEnd)}</span>);
  }

  return <>{result}</>;
}

function TaskList({
  tasks,
  blockKey,
  comments,
  hoveredCommentIds,
  activeCommentId,
  onHoverComments,
  onActivateComments,
}: {
  tasks: TaskItem[];
  blockKey: 'content' | 'nextPlan';
  comments: ReportComment[];
  hoveredCommentIds: string[];
  activeCommentId: string | null;
  onHoverComments: (ids: string[]) => void;
  onActivateComments: (ids: string[]) => void;
}) {
  const flat = useMemo(() => flattenTasks(tasks), [tasks]);
  if (flat.length === 0) {
    return <Text type="secondary">-</Text>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
      {flat.map(({ task, depth }) => (
        <li
          key={task.id}
          data-task-text-source
          data-task-id={task.id}
          style={{
            marginBottom: 6,
            marginLeft: depth * 16,
            listStyleType: 'disc',
            color: '#262626',
          }}
        >
          {(() => {
            const taskComments = comments.filter(c => {
              if (c.targetBlock !== blockKey || !c.targetText) return false;
              if (c.targetTaskId && c.targetTaskId !== task.id) return false;
              return true;
            });
            return highlightTaskText(task.text, blockKey, taskComments, hoveredCommentIds, activeCommentId, onHoverComments, onActivateComments);
          })()}
        </li>
      ))}
    </ul>
  );
}

function WorkContent({
  tasks,
  blockKey,
  comments,
  hoveredCommentIds,
  activeCommentId,
  onHoverComments,
  onActivateComments,
}: {
  tasks: TaskItem[];
  blockKey: 'content' | 'nextPlan';
  comments: ReportComment[];
  hoveredCommentIds: string[];
  activeCommentId: string | null;
  onHoverComments: (ids: string[]) => void;
  onActivateComments: (ids: string[]) => void;
}) {
  const important = tasks.filter(t => t.highlighted);
  const routine = tasks.filter(t => !t.highlighted);
  if (important.length === 0 && routine.length === 0) {
    return <Text type="secondary">-</Text>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {important.length > 0 && (
        <div
          style={{
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: 8,
            padding: '14px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <PushpinOutlined style={{ color: '#cf1322', fontSize: 15 }} />
            <Text strong style={{ color: '#cf1322', fontSize: 15 }}>重点工作</Text>
          </div>
          <TaskList tasks={important} blockKey={blockKey} comments={comments} hoveredCommentIds={hoveredCommentIds} activeCommentId={activeCommentId} onHoverComments={onHoverComments} onActivateComments={onActivateComments} />
        </div>
      )}
      {routine.length > 0 && (
        <div
          style={{
            background: '#e6f7ff',
            border: '1px solid #91d5ff',
            borderRadius: 8,
            padding: '14px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileTextOutlined style={{ color: '#096dd9', fontSize: 15 }} />
            <Text strong style={{ color: '#096dd9', fontSize: 15 }}>常规工作</Text>
          </div>
          <TaskList tasks={routine} blockKey={blockKey} comments={comments} hoveredCommentIds={hoveredCommentIds} activeCommentId={activeCommentId} onHoverComments={onHoverComments} onActivateComments={onActivateComments} />
        </div>
      )}
    </div>
  );
}

function TextContent({
  value,
  borderColor,
  blockKey,
  comments,
  hoveredCommentIds,
  activeCommentId,
  onHoverComments,
  onActivateComments,
}: {
  value: string;
  borderColor: string;
  blockKey: 'content' | 'nextPlan' | 'thoughts' | 'other';
  comments: ReportComment[];
  hoveredCommentIds: string[];
  activeCommentId: string | null;
  onHoverComments: (ids: string[]) => void;
  onActivateComments: (ids: string[]) => void;
}) {
  if (!value || !value.trim()) {
    return <Text type="secondary">-</Text>;
  }

  const ranges = buildHighlightRanges(value, comments, blockKey);
  const hasHighlights = ranges.length > 0;

  const renderContent = () => {
    if (!hasHighlights) return value;
    const result: React.ReactNode[] = [];
    let lastEnd = 0;
    for (const r of ranges) {
      if (r.start > lastEnd) {
        result.push(<span key={`pre-${lastEnd}`}>{value.slice(lastEnd, r.start)}</span>);
      }
      const part = value.slice(r.start, r.end);
      result.push(
        <HighlightSpan
          key={`match-${r.start}`}
          commentIds={r.commentIds}
          activeCommentId={activeCommentId}
          hoveredCommentIds={hoveredCommentIds}
          onHoverComments={onHoverComments}
          onActivateComments={onActivateComments}
        >
          {part}
        </HighlightSpan>
      );
      lastEnd = r.end;
    }
    if (lastEnd < value.length) {
      result.push(<span key={`post-${lastEnd}`}>{value.slice(lastEnd)}</span>);
    }
    return result;
  };

  return (
    <div data-textarea-wrapper style={{ position: 'relative' }}>
      {hasHighlights && (
        <div
          data-overlay
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            padding: '14px 16px',
            fontSize: 14,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: 'transparent',
            zIndex: 1,
          }}
        >
          {renderContent()}
        </div>
      )}
      <div
        data-text-source
        style={{
          background: '#fafafa',
          border: '1px solid #f0f0f0',
          borderLeft: `4px solid ${borderColor}`,
          borderRadius: 8,
          padding: '14px 16px',
          whiteSpace: 'pre-wrap',
          fontSize: 14,
          lineHeight: 1.8,
          color: '#262626',
          minHeight: 60,
          position: 'relative',
          zIndex: 0,
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
}

const PresentationView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useMemo(() => getCurrentUser(), []);
  const deptList = useDepts();

  const urlWeek = searchParams.get('weekLabel');
  const urlDept = searchParams.get('dept');
  const [selectedWeek, setSelectedWeek] = useState(
    urlWeek && /^\d{8}$/.test(urlWeek) ? urlWeek : ''
  );
  const [selectedDept, setSelectedDept] = useState(
    urlDept && getDeptsSnapshot().includes(urlDept) ? urlDept : currentUser.dept
  );
  // 科室清单异步加载完成后，补应用 URL 指定的新科室（深链接场景）
  useEffect(() => {
    if (urlDept && deptList.includes(urlDept) && selectedDept !== urlDept) {
      setSelectedDept(urlDept);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptList]);

  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // 评论相关状态
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [commentCollapsed, setCommentCollapsed] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionTarget, setMentionTarget] = useState<'comment' | 'reply'>('comment');
  const [hoveredCommentIds, setHoveredCommentIds] = useState<string[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const commentListRef = useRef<HTMLDivElement>(null);
  const commentCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [commentPositions, setCommentPositions] = useState<Record<string, number>>({});
  const listMinHeight = useMemo(() => {
    const maxTop = Math.max(0, ...Object.values(commentPositions));
    return maxTop + 200;
  }, [commentPositions]);
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

  // 计算右侧评论块应处的垂直位置：跟随被评论文本，并在文本滚出视口时吸附到顶部/底部
  const computeCommentPositions = useCallback(() => {
    if (!commentListRef.current) return;
    const container = commentListRef.current;
    const containerRect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    const viewportH = window.innerHeight;
    const clientH = container.clientHeight;

    const cards = comments.map(c => {
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
  }, [comments]);

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

  const weekOptions = useMemo(() => getDynamicWeekOptions(), [initialized]);

  const init = useCallback(async () => {
    try {
      await loadReports();
    } catch (e: any) {
      message.error(`加载周报列表失败: ${e.message || '未知错误'}`);
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!selectedWeek && initialized) {
      const options = getDynamicWeekOptions();
      if (options.length > 0) {
        setSelectedWeek(options[options.length - 1]);
      }
    }
  }, [initialized, selectedWeek]);

  const loadReport = useCallback(async () => {
    if (!selectedWeek) return;
    setLoading(true);
    try {
      const detail = await fetchReportDetail(selectedWeek, selectedDept);
      const commentList = await fetchComments(selectedWeek, selectedDept).catch(() => [] as ReportComment[]);
      setReport(detail || null);
      setComments(commentList as ReportComment[]);
    } catch (e: any) {
      message.error(`加载周报失败: ${e.message || '未知错误'}`);
      setReport(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [selectedWeek, selectedDept]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // 点击外部关闭批注弹窗
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

  useEffect(() => {
    if (selectedWeek) {
      setSearchParams({ weekLabel: selectedWeek, dept: selectedDept });
    }
  }, [selectedWeek, selectedDept, setSearchParams]);

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

  const handleAddComment = useCallback(async (targetText?: string, targetBlock?: 'content' | 'nextPlan' | 'thoughts' | 'other', targetTaskId?: string, targetStart?: number, targetEnd?: number) => {
    if (!report || !newComment.trim()) return;
    const oldComments = comments;
    const mentionIds = extractMentions(newComment);
    const comment: ReportComment = {
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
    const updated = [comment, ...comments];
    setComments(updated);
    try {
      await addCommentApi(report.weekLabel, report.dept, comment);
      setNewComment('');
      setMentionOpen(false);
      setSelPopup({ visible: false, x: 0, y: 0, text: '', block: 'nextPlan', taskId: '', start: 0, end: 0, drafting: false });
      message.success('批注已添加');
      recordActionLog({
        action: 'comment_add',
        targetType: 'weekly_report',
        targetId: report.id,
        targetDesc: `${report.weekLabel} ${report.dept} 添加批注`,
        details: { commentText: comment.content.slice(0, 100), targetBlock: targetBlock || 'general' },
      });
    } catch (e: any) {
      setComments(oldComments);
      message.error(`批注保存失败: ${e.message}`);
    }
  }, [report, newComment, comments, currentUser]);

  const handleAddReply = useCallback(async (parentId: string) => {
    if (!report || !replyContent.trim()) return;
    const oldComments = comments;
    const reply: Reply = {
      id: genId(),
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      authorColor: currentUser.color,
      content: replyContent.trim(),
      createdAt: new Date().toISOString(),
    };
    const updatedComments = comments.map(c => {
      if (c.id === parentId) {
        return { ...c, replies: [...c.replies, reply] };
      }
      return c;
    });
    setComments(updatedComments);
    try {
      await addReplyApi(report.weekLabel, report.dept, parentId, reply);
      setReplyContent('');
      setReplyToId(null);
      setMentionOpen(false);
      message.success('回复已添加');
      recordActionLog({
        action: 'comment_add',
        targetType: 'weekly_report',
        targetId: report.id,
        targetDesc: `${report.weekLabel} ${report.dept} 回复批注`,
        details: { replyText: reply.content.slice(0, 100), parentCommentId: parentId },
      });
    } catch (e: any) {
      setComments(oldComments);
      message.error(`回复保存失败: ${e.message}`);
    }
  }, [report, replyContent, comments, currentUser]);

  const handleToggleResolved = useCallback(async (commentId: string) => {
    if (!report || !hasPermission(currentUser, 'RESOLVE_COMMENT')) return;
    const oldComments = comments;
    const newResolved = !oldComments.find(c => c.id === commentId)?.resolved;
    const updatedComments = comments.map(c => {
      if (c.id === commentId) {
        return { ...c, resolved: newResolved };
      }
      return c;
    });
    setComments(updatedComments);
    try {
      await toggleResolvedApi(report.weekLabel, report.dept, commentId, newResolved);
      message.success('状态已更新');
    } catch (e: any) {
      setComments(oldComments);
      message.error(`状态更新失败: ${e.message}`);
    }
  }, [report, comments, currentUser]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!report) return;
    const oldComments = comments;
    const updated = comments.filter(c => c.id !== commentId);
    setComments(updated);
    try {
      await deleteCommentApi(report.weekLabel, report.dept, commentId);
      message.success('评论已删除');
    } catch (e: any) {
      setComments(oldComments);
      message.error(`删除失败: ${e.message}`);
    }
  }, [report, comments]);

  const handleDeleteReply = useCallback(async (commentId: string, replyId: string) => {
    if (!report) return;
    const oldComments = comments;
    const updatedComments = comments.map(c => {
      if (c.id === commentId) {
        return { ...c, replies: c.replies.filter(r => r.id !== replyId) };
      }
      return c;
    });
    setComments(updatedComments);
    try {
      await deleteReplyApi(report.weekLabel, report.dept, commentId, replyId);
      message.success('回复已删除');
    } catch (e: any) {
      setComments(oldComments);
      message.error(`删除失败: ${e.message}`);
    }
  }, [report, comments]);

  const handleTextSelect = useCallback((e: React.MouseEvent, blockKey: 'content' | 'nextPlan' | 'thoughts' | 'other') => {
    const target = e.currentTarget as HTMLElement;
    const textContainer = target.querySelector('[data-text-source]') as HTMLElement | null;
    const taskContainer = (e.target as HTMLElement).closest?.('[data-task-text-source]') as HTMLElement | null;
    const container = taskContainer || textContainer;
    const taskId = taskContainer?.getAttribute('data-task-id') || '';

    if (!container) {
      setSelPopup(prev => ({ ...prev, visible: false, drafting: false, taskId: '', start: 0, end: 0 }));
      return;
    }

    const offsets = getSelectionOffsetsInContainer(container);
    if (!offsets) {
      setSelPopup(prev => ({ ...prev, visible: false, drafting: false, taskId: '', start: 0, end: 0 }));
      return;
    }

    const trimmed = trimSelectionOffsets(container.textContent || '', offsets.start, offsets.end);
    if (trimmed) {
      setSelPopup({
        visible: true,
        x: e.clientX,
        y: e.clientY - 45,
        text: trimmed.text,
        block: blockKey,
        taskId,
        start: trimmed.start,
        end: trimmed.end,
        drafting: false,
      });
    } else {
      setSelPopup(prev => ({ ...prev, visible: false, drafting: false, taskId: '', start: 0, end: 0 }));
    }
  }, []);

  const currentTasks = useMemo(() => report?.content || [], [report?.content]);
  const nextTasks = useMemo(() => parseNextPlan(report?.nextPlan || ''), [report?.nextPlan]);

  const dataSource = useMemo(() => {
    if (!report) return [];
    return [
      {
        key: 'current',
        item: '本周工作内容',
        icon: <FileTextOutlined style={{ color: '#1890ff' }} />,
        content: <WorkContent tasks={currentTasks} blockKey="content" comments={comments} hoveredCommentIds={hoveredCommentIds} activeCommentId={activeCommentId} onHoverComments={setHoveredCommentIds} onActivateComments={ids => setActiveCommentId(ids[0] || null)} />,
      },
      {
        key: 'next',
        item: '下周工作计划',
        icon: <CalendarOutlined style={{ color: '#52c41a' }} />,
        content: <WorkContent tasks={nextTasks} blockKey="nextPlan" comments={comments} hoveredCommentIds={hoveredCommentIds} activeCommentId={activeCommentId} onHoverComments={setHoveredCommentIds} onActivateComments={ids => setActiveCommentId(ids[0] || null)} />,
      },
      {
        key: 'other',
        item: '问题与风险',
        icon: <PushpinOutlined style={{ color: '#ff4d4f' }} />,
        content: <TextContent value={report.other || ''} borderColor="#ff4d4f" blockKey="other" comments={comments} hoveredCommentIds={hoveredCommentIds} activeCommentId={activeCommentId} onHoverComments={setHoveredCommentIds} onActivateComments={ids => setActiveCommentId(ids[0] || null)} />,
      },
      {
        key: 'thoughts',
        item: '其他',
        icon: <TeamOutlined style={{ color: '#722ed1' }} />,
        content: <TextContent value={report.thoughts || ''} borderColor="#722ed1" blockKey="thoughts" comments={comments} hoveredCommentIds={hoveredCommentIds} activeCommentId={activeCommentId} onHoverComments={setHoveredCommentIds} onActivateComments={ids => setActiveCommentId(ids[0] || null)} />,
      },
    ];
  }, [report, currentTasks, nextTasks, comments, hoveredCommentIds, activeCommentId]);

  const blockKeyMap: Record<string, 'content' | 'nextPlan' | 'thoughts' | 'other'> = {
    current: 'content',
    next: 'nextPlan',
    other: 'other',
    thoughts: 'thoughts',
  };

  const columns = [
    {
      title: <Text strong style={{ fontSize: 15 }}>项目</Text>,
      dataIndex: 'item',
      key: 'item',
      width: 180,
      render: (text: string, record: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {record.icon}
          <Text strong style={{ fontSize: 15 }}>{text}</Text>
        </div>
      ),
    },
    {
      title: <Text strong style={{ fontSize: 15 }}>内容</Text>,
      dataIndex: 'content',
      key: 'content',
      render: (content: React.ReactNode, record: any) => (
        <div
          onMouseUp={e => {
            const block = blockKeyMap[record.key];
            if (block) handleTextSelect(e, block);
          }}
          style={{ userSelect: 'text' }}
        >
          {content}
        </div>
      ),
    },
  ];

  if (!initialized) {
    return (
      <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Content style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" tip="加载中..." />
        </Content>
      </Layout>
    );
  }

  return (
    <>
      <CommentConnector activeCommentId={activeCommentId} />
      <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Header style={{
        background: '#fff',
        borderBottom: '1px solid #e8e8e8',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Title level={4} style={{ margin: 0 }}>演示模式</Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined style={{ color: '#999' }} />
            <Text type="secondary">周报周期：</Text>
            <Select
              value={selectedWeek}
              onChange={setSelectedWeek}
              style={{ width: 180 }}
              options={weekOptions.map(w => ({ label: formatWeekLabel(w), value: w }))}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamOutlined style={{ color: '#999' }} />
          <Text type="secondary">当前科室：</Text>
          <Text strong style={{ fontSize: 15 }}>{selectedDept}</Text>
        </div>
      </Header>

      <Layout style={{ background: '#f5f5f5' }}>
        <Sider
          width={200}
          style={{
            background: '#fff',
            borderRight: '1px solid #e8e8e8',
            overflow: 'auto',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
            <Text strong style={{ fontSize: 14 }}>科室列表</Text>
          </div>
          {deptList.map(dept => (
            <div
              key={dept}
              onClick={() => setSelectedDept(dept)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                background: selectedDept === dept ? '#e6f7ff' : '#fff',
                color: selectedDept === dept ? '#1890ff' : '#262626',
                fontWeight: selectedDept === dept ? 600 : 400,
                borderLeft: selectedDept === dept ? '3px solid #1890ff' : '3px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              {dept}
            </div>
          ))}
        </Sider>

        <Content style={{ padding: 24, overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 16, minHeight: 'calc(100vh - 104px)' }}>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{selectedDept} · {formatWeekLabel(selectedWeek)} 周报</span>
                  {report && (
                    <Text type="secondary" style={{ fontSize: 14 }}>
                      填报人：{report.authorName}
                    </Text>
                  )}
                </div>
              }
              style={{ flex: 1, minWidth: 0, minHeight: 'calc(100vh - 104px)' }}
              bodyStyle={{ padding: '20px 24px' }}
            >
              {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <Spin size="large" />
                </div>
              ) : !report ? (
                <Empty description="该科室当前周次暂无周报数据" />
              ) : (
                <Table
                  columns={columns as any}
                  dataSource={dataSource}
                  rowKey="key"
                  pagination={false}
                  bordered
                  style={{ marginTop: 8 }}
                />
              )}
            </Card>

            {/* 评论列 */}
            <div style={{ width: commentCollapsed ? 56 : 260, flexShrink: 0, display: 'flex', flexDirection: 'column', transition: 'width 0.3s' }}>
              <Card
                className="mhy-card"
                title={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: commentCollapsed ? 'center' : 'space-between', flexDirection: commentCollapsed ? 'column' : 'row', gap: commentCollapsed ? 4 : 0 }}>
                    {!commentCollapsed && (
                      <span>
                        <MessageOutlined /> 批注{' '}
                        {comments.length > 0 && (
                          <Badge count={comments.length} size="small" />
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
                      {comments.length > 0 ? (
                        <>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}>
                          {comments.map(c => (
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
          </div>
        </Content>
      </Layout>

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
    </Layout>
    </>
  );
};

export default PresentationView;
