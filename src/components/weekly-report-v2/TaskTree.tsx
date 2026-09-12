import React, { useState } from 'react';
import { Button, Space, Input, message } from 'antd';
import { CheckOutlined, PlusOutlined, ReloadOutlined, SnippetsOutlined } from '@ant-design/icons';
import type { Comment, TaskItem } from './types';
import { buildHighlightRanges } from './comment-highlights';
import { parseTaskHierarchy } from './task-parser';

const { TextArea } = Input;

function renderTaskHighlightOverlay(
  taskText: string,
  blockKey: 'content' | 'nextPlan',
  comments: Comment[],
  activeCommentId: string | null,
  hoveredCommentIds: string[],
  onHoverComments?: (ids: string[]) => void,
  onActivateComments?: (ids: string[]) => void
): React.ReactNode {
  const ranges = buildHighlightRanges(taskText, comments, blockKey);
  if (ranges.length === 0) return taskText;

  const result: React.ReactNode[] = [];
  let lastEnd = 0;
  for (const r of ranges) {
    if (r.start > lastEnd) {
      result.push(<span key={`pre-${lastEnd}`}>{taskText.slice(lastEnd, r.start)}</span>);
    }
    const part = taskText.slice(r.start, r.end);
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
        onMouseEnter={() => onHoverComments?.(r.commentIds)}
        onMouseLeave={() => onHoverComments?.([])}
        onClick={e => {
          e.stopPropagation();
          onActivateComments?.(r.commentIds);
        }}
      >{part}</mark>
    );
    lastEnd = r.end;
  }
  if (lastEnd < taskText.length) {
    result.push(<span key={`post-${lastEnd}`}>{taskText.slice(lastEnd)}</span>);
  }
  return result;
}

// 剥离任务文本中的旧序号前缀（兼容历史数据）
// 注意：只剥离第一行的前缀，不匹配换行符，避免根任务框第一行清空时把第二行子任务误当成前缀剥离
const HSPACE = '[^\\S\\r\\n]'; // 水平空白（空格、制表符等），不包含换行
function stripTaskPrefix(text: string): string {
  return text
    .replace(new RegExp(`^${HSPACE}*(?:\\d{1,2}(?:\\.\\d{1,2})*[\\.．、]|\\d{1,2}\\.(?!\\d))${HSPACE}*`), '') // 1. / 1、 / 1.1、 / 1.xxx
    .replace(new RegExp(`^${HSPACE}*[（(]\\d{1,2}(?:\\.\\d{1,2})*[）)]${HSPACE}*`), '')                    // （1）/（1.1）
    .replace(new RegExp(`^${HSPACE}*[一二三四五六七八九十]+[、.．]${HSPACE}*`), '')                     // 一、/一./一、
    .replace(new RegExp(`^${HSPACE}*[（(][一二三四五六七八九十]+[）)]${HSPACE}*`), '')                  // （一）/（一
    .replace(new RegExp(`^${HSPACE}*[①②③④⑤⑥⑦⑧⑨⑩]+${HSPACE}*`), '')                               // ①
    .replace(new RegExp(`^${HSPACE}*[\\(\\（][①②③④⑤⑥⑦⑧⑨⑩]+[\\)\\）]${HSPACE}*`), '');                // （①）
}


interface TaskTreeProps {
  tasks: TaskItem[];
  allRootTasks?: TaskItem[];
  editable: boolean;
  depth?: number;
  blockKey?: 'content' | 'nextPlan';
  comments?: Comment[];
  hoveredCommentIds?: string[];
  activeCommentId?: string | null;
  onToggle: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onHighlight: (id: string) => void;
  onTextSelect?: (e: React.MouseEvent, blockKey: string, taskId?: string) => void;
  onHoverComments?: (ids: string[]) => void;
  onActivateComments?: (ids: string[]) => void;
  onParseChildren?: (parentId: string, rootText: string, children: TaskItem[]) => void;
  /** 根任务级整段解析：粘贴整段文本，解析结果作为该根任务的子任务（不改动根任务文本） */
  onParseInto?: (taskId: string) => void;
}

// 递归渲染树形 checkbox（序号前缀由渲染时动态计算，不再存储在 text 中）
const TaskTree: React.FC<TaskTreeProps> = ({
  tasks,
  allRootTasks,
  editable,
  depth = 0,
  blockKey,
  comments,
  hoveredCommentIds = [],
  activeCommentId,
  onToggle,
  onTextChange,
  onDelete,
  onAddChild,
  onHighlight,
  onTextSelect,
  onHoverComments,
  onActivateComments,
  onParseChildren,
  onParseInto,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <>
      {tasks.map((task, localIndex) => {
        // 动态计算序号前缀
        let prefix = '';
        if (depth === 0 && allRootTasks) {
          const sameType = allRootTasks.filter(t => !!t.highlighted === !!task.highlighted);
          const idx = sameType.findIndex(t => t.id === task.id);
          prefix = `${idx >= 0 ? idx + 1 : localIndex + 1}. `;
        } else if (depth === 1) {
          prefix = `（${localIndex + 1}）`;
        } else if (depth >= 2) {
          prefix = `${localIndex + 1}）`;
        }

        return (
          <div key={task.id} style={{ marginLeft: depth * 16, marginBottom: 2 }}>
            <div
              className="task-row"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                background: depth === 0 ? (task.highlighted ? '#fff7e6' : '#e6f7ff') : 'transparent',
                borderRadius: 6,
                padding: '4px 6px',
                border: depth === 0 ? (task.highlighted ? '1px solid #ffd591' : '1px solid #91d5ff') : '1px solid transparent',
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
              {prefix && (
                <span style={{
                  minWidth: depth === 0 ? 28 : 32,
                  textAlign: 'right',
                  color: depth === 0 ? '#333' : '#999',
                  fontWeight: depth === 0 ? 500 : 'normal',
                  fontSize: 14,
                  marginTop: 2,
                  flexShrink: 0,
                }}>
                  {prefix}
                </span>
              )}
              {(() => {
                const taskText = stripTaskPrefix(task.text);
                const isEditing = editingId === task.id;
                const taskComments = (comments || []).filter(c => {
                  if (c.targetBlock !== blockKey || !c.targetText) return false;
                  if (c.targetTaskId && c.targetTaskId !== task.id) return false;
                  return true;
                });
                const overlayContent = !isEditing
                  ? renderTaskHighlightOverlay(
                      taskText,
                      blockKey as 'content' | 'nextPlan',
                      taskComments,
                      activeCommentId || null,
                      hoveredCommentIds || [],
                      onHoverComments,
                      onActivateComments
                    )
                  : null;
                const hasOverlay = Array.isArray(overlayContent);
                return (
                  <div data-task-wrapper style={{ position: 'relative', flex: 1 }}>
                    {hasOverlay && (
                      <div data-overlay style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', padding: '2px 0', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'transparent', zIndex: 1 }}>
                        {overlayContent}
                      </div>
                    )}
                    <TextArea
                      value={taskText}
                      onChange={e => onTextChange(task.id, e.target.value)}
                      readOnly={!editable}
                      autoSize={{ minRows: 1, maxRows: 6 }}
                      variant="borderless"
                      placeholder={depth === 0 && editable ? '可回车换行；用 1./（1）/1） 写三级子任务，点击刷新解析' : undefined}
                      onMouseUp={e => {
                        if (onTextSelect && blockKey) {
                          onTextSelect(e, blockKey, task.id);
                        }
                      }}
                      onFocus={() => setEditingId(task.id)}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={e => {
                        // 仅阻止 Escape 关闭评论高亮；Enter/Space 走默认输入行为
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                        }
                      }}
                      onScroll={(e) => { const wrapper = (e.currentTarget as HTMLElement).closest?.('[data-task-wrapper]') as HTMLElement | null; const overlay = wrapper?.querySelector('[data-overlay]') as HTMLElement | null; if (overlay) overlay.scrollTop = e.currentTarget.scrollTop; }}
                      style={{
                        flex: 1, padding: '2px 0', fontSize: 14, lineHeight: 1.6,
                        textDecoration: task.checked ? 'line-through' : 'none',
                        color: task.checked ? '#999' : '#333',
                        background: 'transparent',
                        resize: 'none',
                        position: 'relative',
                        zIndex: 2,
                      }}
                    />
                  </div>
                );
              })()}
              {editable && (
                <Space size={0} className="task-actions">
                  {depth === 0 && onParseChildren && (
                    <>
                      <Button
                        type="text"
                        size="small"
                        title="解析子任务"
                        style={{ padding: '0 4px', minWidth: 24, color: '#1890ff' }}
                        onClick={() => {
                          const parsed = parseTaskHierarchy(task.text);
                          if (parsed) {
                            onParseChildren(task.id, parsed.rootText, parsed.children);
                            if (parsed.children.length === 0) {
                              message.info('未识别到子任务，请按 1./（1）/1） 格式填写');
                            } else {
                              message.success(`已解析 ${parsed.children.length} 个一级子任务`);
                            }
                          } else {
                            message.info('请输入根任务内容后再点击刷新');
                          }
                        }}
                      >
                        <ReloadOutlined style={{ fontSize: 12 }} />
                      </Button>
                    </>
                  )}
                  {depth === 0 && onParseInto && (
                    <Button
                      type="text"
                      size="small"
                      title="整段解析：粘贴整段文本，解析结果作为该任务的子任务"
                      style={{ padding: '0 4px', minWidth: 24, color: '#722ed1' }}
                      onClick={() => onParseInto(task.id)}
                    >
                      <SnippetsOutlined style={{ fontSize: 12 }} />
                    </Button>
                  )}
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
                allRootTasks={allRootTasks}
                editable={editable}
                depth={depth + 1}
                blockKey={blockKey}
                comments={comments}
                hoveredCommentIds={hoveredCommentIds}
                activeCommentId={activeCommentId}
                onToggle={onToggle}
                onTextChange={onTextChange}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onHighlight={onHighlight}
                onTextSelect={onTextSelect}
                onHoverComments={onHoverComments}
                onActivateComments={onActivateComments}
                onParseChildren={onParseChildren}
                onParseInto={onParseInto}
              />
            )}
          </div>
        );
      })}
    </>
  );
};

export default TaskTree;
