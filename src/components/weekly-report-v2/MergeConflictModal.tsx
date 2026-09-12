import React, { useEffect, useState } from 'react';
import { Modal, Radio, Space, Typography, Button, Alert, Card } from 'antd';
import { WeeklyReport, TaskItem } from './types';
import { ConflictItem } from './merge';
import { deleteTaskFromTree, updateTaskInTree } from './data';

const { Text } = Typography;

interface MergeConflictModalProps {
  open: boolean;
  conflicts: ConflictItem[];
  draft: WeeklyReport | null;
  onCancel: () => void;
  onConfirm: (resolved: WeeklyReport) => void;
}

function getConflictKey(conflict: ConflictItem): string {
  if (conflict.type === 'fieldText') return `field:${conflict.field}`;
  return `task:${conflict.taskId}`;
}

function getConflictTitle(conflict: ConflictItem): string {
  if (conflict.type === 'fieldText') {
    const fieldNames: Record<string, string> = {
      plan: '上周工作计划',
      currentWork: '本周工作内容文本',
      thoughts: '本周管理心得',
      other: '问题与风险',
    };
    return fieldNames[conflict.field] || conflict.field;
  }
  const authorHint = conflict.authorName ? `（原作者：${conflict.authorName}）` : '';
  return `任务项：${conflict.baseText || conflict.serverText || conflict.userText || conflict.taskId}${authorHint}`;
}

export const MergeConflictModal: React.FC<MergeConflictModalProps> = ({
  open,
  conflicts,
  draft,
  onCancel,
  onConfirm,
}) => {
  const [resolved, setResolved] = useState<WeeklyReport | null>(null);
  const [choices, setChoices] = useState<Record<string, 'user' | 'server' | 'base'>>({});

  useEffect(() => {
    if (draft) {
      setResolved(JSON.parse(JSON.stringify(draft)));
      const initial: Record<string, 'user' | 'server' | 'base'> = {};
      for (const c of conflicts) {
        initial[getConflictKey(c)] = 'user';
      }
      setChoices(initial);
    }
  }, [draft, conflicts, open]);

  if (!resolved) return null;

  const applyChoice = (conflict: ConflictItem, side: 'user' | 'server' | 'base') => {
    setChoices(prev => ({ ...prev, [getConflictKey(conflict)]: side }));
    setResolved(prev => {
      if (!prev) return prev;
      const next: WeeklyReport = JSON.parse(JSON.stringify(prev));
      if (conflict.type === 'fieldText') {
        const value = side === 'user' ? conflict.user : side === 'server' ? conflict.server : conflict.base;
        (next as any)[conflict.field] = value ?? '';
        return next;
      }

      if (conflict.type === 'taskText') {
        const text = side === 'user' ? conflict.userText : side === 'server' ? conflict.serverText : conflict.baseText;
        if (text != null) {
          next.content = updateTaskInTree(next.content, conflict.taskId, t => ({ ...t, text }));
          // nextPlan 也要同步更新（如果任务在 nextPlan 里）
          const nextPlanTasks = JSON.parse(next.nextPlan || '[]') as TaskItem[];
          const updatedNextPlan = updateTaskInTree(nextPlanTasks, conflict.taskId, t => ({ ...t, text }));
          next.nextPlan = JSON.stringify(updatedNextPlan);
        }
      } else if (conflict.type === 'taskDeletedModified') {
        // 服务器保留，用户删除
        if (side === 'user') {
          next.content = deleteTaskFromTree(next.content, conflict.taskId);
          const nextPlanTasks = JSON.parse(next.nextPlan || '[]') as TaskItem[];
          next.nextPlan = JSON.stringify(deleteTaskFromTree(nextPlanTasks, conflict.taskId));
        }
      } else if (conflict.type === 'taskModifiedDeleted' || conflict.type === 'taskDeletedNew') {
        // 服务器删除，用户保留；或用户删除服务器新增任务
        if (side === 'server') {
          next.content = deleteTaskFromTree(next.content, conflict.taskId);
          const nextPlanTasks = JSON.parse(next.nextPlan || '[]') as TaskItem[];
          next.nextPlan = JSON.stringify(deleteTaskFromTree(nextPlanTasks, conflict.taskId));
        }
      }
      return next;
    });
  };

  return (
    <Modal
      title="提交冲突：发现他人已更新该周报"
      open={open}
      onCancel={onCancel}
      width={720}
      footer={(
        <Space>
          <Button onClick={onCancel}>取消提交</Button>
          <Button type="primary" onClick={() => onConfirm(resolved)}>
            确认合并并提交
          </Button>
        </Space>
      )}
    >
      <Alert
        type="warning"
        showIcon
        message="以下内容你和他人都做了修改，请选择保留哪个版本。未冲突的部分已自动合并。"
        style={{ marginBottom: 16 }}
      />
      <Space direction="vertical" style={{ width: '100%' }}>
        {conflicts.map(conflict => {
          const key = getConflictKey(conflict);
          return (
            <Card key={key} size="small" title={getConflictTitle(conflict)}>
              <Radio.Group
                value={choices[key]}
                onChange={e => applyChoice(conflict, e.target.value)}
              >
                <Space direction="vertical">
                  <Radio value="user">
                    <Text strong>保留我的</Text>
                    <div style={{ color: '#666', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                      {conflict.type === 'fieldText' ? conflict.user : conflict.userText}
                    </div>
                  </Radio>
                  <Radio value="server">
                    <Text strong>保留他人（服务器最新）</Text>
                    <div style={{ color: '#666', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                      {conflict.type === 'fieldText' ? conflict.server : conflict.serverText}
                    </div>
                  </Radio>
                  {conflict.type !== 'taskDeletedModified' && conflict.type !== 'taskModifiedDeleted' && (
                    <Radio value="base">
                      <Text strong>保留原始版本</Text>
                      <div style={{ color: '#666', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                        {conflict.type === 'fieldText' ? conflict.base : conflict.baseText}
                      </div>
                    </Radio>
                  )}
                </Space>
              </Radio.Group>
            </Card>
          );
        })}
      </Space>
    </Modal>
  );
};

export default MergeConflictModal;
