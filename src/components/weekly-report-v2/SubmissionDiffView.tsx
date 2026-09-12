import React, { useMemo, useState } from 'react';
import {
  Card, Button, Space, Switch, Tag, Empty, Divider, Statistic, Typography, Alert,
} from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { ReportSubmission, TaskItem } from './types';

const { Text } = Typography;

interface TextDiffSegment {
  type: 'same' | 'added' | 'removed';
  text: string;
}

interface TaskDiffItem {
  type: 'added' | 'removed' | 'modified' | 'state-changed';
  oldTask?: TaskItem;
  newTask?: TaskItem;
  changeDesc?: string;
  children?: TaskDiffItem[];
}

function normalizeLines(text: string): string[] {
  return (text || '').split('\n').map(l => l.trim()).filter(Boolean);
}

function diffText(oldText: string, newText: string): TextDiffSegment[] {
  const oldLines = normalizeLines(oldText);
  const newLines = normalizeLines(newText);
  const dp: number[][] = Array(oldLines.length + 1)
    .fill(0)
    .map(() => Array(newLines.length + 1).fill(0));

  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: TextDiffSegment[] = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'same', text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', text: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

function parseTasks(value: any): TaskItem[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [];
}

function diffTasks(oldTasks: TaskItem[], newTasks: TaskItem[]): TaskDiffItem[] {
  const result: TaskDiffItem[] = [];
  const matchedOld = new Set<number>();

  // 按新版本的顺序遍历，展示新增/修改/状态变更
  newTasks.forEach(newTask => {
    const matchIdx = oldTasks.findIndex(
      (t, idx) => !matchedOld.has(idx) && t.text.trim() === newTask.text.trim(),
    );
    if (matchIdx === -1) {
      result.push({ type: 'added', newTask });
      return;
    }
    matchedOld.add(matchIdx);
    const oldTask = oldTasks[matchIdx];
    const stateChanges: string[] = [];
    if (oldTask.checked !== newTask.checked) {
      stateChanges.push(`完成状态：${oldTask.checked ? '已完成' : '未完成'} → ${newTask.checked ? '已完成' : '未完成'}`);
    }
    if (!!oldTask.highlighted !== !!newTask.highlighted) {
      stateChanges.push(`类型：${oldTask.highlighted ? '重点工作' : '常规工作'} → ${newTask.highlighted ? '重点工作' : '常规工作'}`);
    }
    const childDiff = diffTasks(oldTask.children || [], newTask.children || []);
    if (stateChanges.length > 0 || childDiff.length > 0) {
      result.push({
        type: stateChanges.length > 0 ? 'state-changed' : 'modified',
        oldTask,
        newTask,
        changeDesc: stateChanges.join('，'),
        children: childDiff,
      });
    }
  });

  // 未匹配到的旧任务视为删除
  oldTasks.forEach((oldTask, idx) => {
    if (!matchedOld.has(idx)) {
      result.push({ type: 'removed', oldTask });
    }
  });

  return result;
}

function countTaskDiff(items: TaskDiffItem[]) {
  let added = 0;
  let removed = 0;
  let modified = 0;
  let stateChanged = 0;
  const walk = (arr: TaskDiffItem[]) => {
    arr.forEach(item => {
      if (item.type === 'added') added++;
      else if (item.type === 'removed') removed++;
      else if (item.type === 'modified') modified++;
      else if (item.type === 'state-changed') stateChanged++;
      if (item.children) walk(item.children);
    });
  };
  walk(items);
  return { added, removed, modified, stateChanged };
}

function countTextDiff(segments: TextDiffSegment[]) {
  let added = 0;
  let removed = 0;
  segments.forEach(s => {
    if (s.type === 'added') added++;
    if (s.type === 'removed') removed++;
  });
  return { added, removed };
}

function renderTaskItem(item: TaskDiffItem, depth = 0) {
  const prefixMap: Record<TaskDiffItem['type'], string> = {
    added: '🟢 新增',
    removed: '🔴 删除',
    modified: '🟡 修改',
    'state-changed': '⚪ 状态变更',
  };
  const colorMap: Record<TaskDiffItem['type'], string> = {
    added: '#f6ffed',
    removed: '#fff2f0',
    modified: '#fffbe6',
    'state-changed': '#e6fffb',
  };

  const task = item.newTask || item.oldTask;
  if (!task) return null;

  return (
    <div key={`${item.type}-${task.id}-${depth}`} style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 4,
          background: colorMap[item.type],
          marginLeft: depth * 20,
        }}
      >
        <Text strong style={{ whiteSpace: 'nowrap' }}>{prefixMap[item.type]}</Text>
        <Text delete={item.type === 'removed'}>
          {task.highlighted ? '【重点】' : ''}{task.text}
        </Text>
        {task.checked && <Tag color="success">已完成</Tag>}
        {item.changeDesc && (
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
            {item.changeDesc}
          </Text>
        )}
      </div>
      {item.children && item.children.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {item.children.map(child => renderTaskItem(child, depth + 1))}
        </div>
      )}
    </div>
  );
}

function renderTextDiff(segments: TextDiffSegment[], showOnlyDiff: boolean) {
  const visible = showOnlyDiff ? segments.filter(s => s.type !== 'same') : segments;
  if (visible.length === 0) {
    return <Text type="secondary">{showOnlyDiff ? '无变化' : '无内容'}</Text>;
  }
  return (
    <div>
      {visible.map((seg, idx) => {
        const style: React.CSSProperties = {
          padding: '2px 6px',
          borderRadius: 3,
          display: 'block',
          marginBottom: 2,
        };
        if (seg.type === 'added') {
          style.background = '#f6ffed';
          style.color = '#389e0d';
        } else if (seg.type === 'removed') {
          style.background = '#fff2f0';
          style.color = '#cf1322';
          style.textDecoration = 'line-through';
        } else {
          style.color = '#595959';
        }
        return (
          <Text key={idx} style={style}>
            {seg.type === 'added' ? '+ ' : seg.type === 'removed' ? '- ' : '  '}
            {seg.text}
          </Text>
        );
      })}
    </div>
  );
}

interface FieldDiff {
  key: string;
  title: string;
  type: 'tasks' | 'text';
  taskDiff?: TaskDiffItem[];
  textDiff?: TextDiffSegment[];
  oldText?: string;
  newText?: string;
}

interface SubmissionDiffViewProps {
  submissions: ReportSubmission[];
}

export const SubmissionDiffView: React.FC<SubmissionDiffViewProps> = ({ submissions }) => {
  const sorted = useMemo(
    () => [...submissions].sort((a, b) => a.version - b.version),
    [submissions],
  );
  const [newerIndex, setNewerIndex] = useState(Math.max(1, sorted.length - 1));
  const [showOnlyDiff, setShowOnlyDiff] = useState(true);

  if (sorted.length < 2) {
    return <Empty description="至少需要两次提交才能对比" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const older = sorted[newerIndex - 1];
  const newer = sorted[newerIndex];

  const fieldDiffs: FieldDiff[] = useMemo(() => {
    const fields: { key: keyof ReportSubmission['content']; title: string; type: 'tasks' | 'text' }[] = [
      { key: 'content', title: '本周工作内容', type: 'tasks' },
      { key: 'nextPlan', title: '下周工作计划', type: 'tasks' },
      { key: 'thoughts', title: '本周心得', type: 'text' },
      { key: 'other', title: '问题与风险', type: 'text' },
    ];

    return fields.map(field => {
      const oldVal = older.content[field.key];
      const newVal = newer.content[field.key];
      if (field.type === 'tasks') {
        const oldTasks = parseTasks(oldVal);
        const newTasks = parseTasks(newVal);
        return {
          ...field,
          taskDiff: diffTasks(oldTasks, newTasks),
        };
      }
      return {
        ...field,
        textDiff: diffText(String(oldVal || ''), String(newVal || '')),
        oldText: String(oldVal || ''),
        newText: String(newVal || ''),
      };
    });
  }, [older, newer]);

  const summary = useMemo(() => {
    let added = 0;
    let removed = 0;
    let modified = 0;
    let stateChanged = 0;
    fieldDiffs.forEach(field => {
      if (field.type === 'tasks' && field.taskDiff) {
        const c = countTaskDiff(field.taskDiff);
        added += c.added;
        removed += c.removed;
        modified += c.modified;
        stateChanged += c.stateChanged;
      } else if (field.type === 'text' && field.textDiff) {
        const c = countTextDiff(field.textDiff);
        added += c.added;
        removed += c.removed;
      }
    });
    return { added, removed, modified, stateChanged };
  }, [fieldDiffs]);

  const hasAnyChange = summary.added + summary.removed + summary.modified + summary.stateChanged > 0;

  return (
    <div>
      {/* 顶部控制栏 */}
      <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Space>
            <Button
              icon={<LeftOutlined />}
              disabled={newerIndex <= 1}
              onClick={() => setNewerIndex(v => v - 1)}
            >
              上一对
            </Button>
            <Tag color="blue" style={{ fontSize: 14 }}>
              第 {older.version} 版 → 第 {newer.version} 版
            </Tag>
            <Button
              icon={<RightOutlined />}
              disabled={newerIndex >= sorted.length - 1}
              onClick={() => setNewerIndex(v => v + 1)}
            >
              下一对
            </Button>
          </Space>

          <Space>
            <span>仅显示差异</span>
            <Switch checked={showOnlyDiff} onChange={setShowOnlyDiff} />
          </Space>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Space size="large">
            <Statistic title="新增" value={summary.added} valueStyle={{ color: '#52c41a' }} />
            <Statistic title="删除" value={summary.removed} valueStyle={{ color: '#ff4d4f' }} />
            <Statistic title="修改" value={summary.modified} valueStyle={{ color: '#fa8c16' }} />
            <Statistic title="状态变更" value={summary.stateChanged} valueStyle={{ color: '#13c2c2' }} />
          </Space>
          <Text type="secondary">
            {new Date(older.submittedAt).toLocaleString('zh-CN')} → {new Date(newer.submittedAt).toLocaleString('zh-CN')}
          </Text>
        </div>

        {!hasAnyChange && (
          <Alert
            type="info"
            showIcon
            message="两版内容完全一致"
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      {/* 字段差异详情 */}
      {fieldDiffs.map(field => {
        const isTask = field.type === 'tasks';
        const taskCount = isTask && field.taskDiff ? countTaskDiff(field.taskDiff) : null;
        const textCount = !isTask && field.textDiff ? countTextDiff(field.textDiff) : null;
        const fieldChanged = isTask
          ? (taskCount && (taskCount.added + taskCount.removed + taskCount.modified + taskCount.stateChanged) > 0)
          : (textCount && (textCount.added + textCount.removed) > 0);

        if (showOnlyDiff && !fieldChanged) return null;

        return (
          <Card
            key={field.key}
            size="small"
            title={(
              <Space>
                <span>{field.title}</span>
                {taskCount && (
                  <Space size={4}>
                    {taskCount.added > 0 && <Tag color="success">+{taskCount.added}</Tag>}
                    {taskCount.removed > 0 && <Tag color="error">-{taskCount.removed}</Tag>}
                    {taskCount.modified > 0 && <Tag color="warning">改{taskCount.modified}</Tag>}
                    {taskCount.stateChanged > 0 && <Tag color="cyan">态{taskCount.stateChanged}</Tag>}
                  </Space>
                )}
                {textCount && (
                  <Space size={4}>
                    {textCount.added > 0 && <Tag color="success">+{textCount.added} 行</Tag>}
                    {textCount.removed > 0 && <Tag color="error">-{textCount.removed} 行</Tag>}
                  </Space>
                )}
              </Space>
            )}
            style={{ marginBottom: 16 }}
          >
            {isTask ? (
              field.taskDiff && field.taskDiff.length > 0 ? (
                <div>{field.taskDiff.map(item => renderTaskItem(item))}</div>
              ) : (
                <Text type="secondary">无变化</Text>
              )
            ) : (
              renderTextDiff(field.textDiff || [], showOnlyDiff)
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default SubmissionDiffView;
