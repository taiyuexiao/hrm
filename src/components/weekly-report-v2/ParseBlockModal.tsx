import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Input, Radio, Empty } from 'antd';
import type { TaskItem } from './types';
import { parseHierarchicalText } from './task-parser';

interface ParseBlockModalProps {
  open: boolean;
  /** 目标名称：栏级如 "本周工作 · 重点工作"；任务级为根任务文本 */
  title: string;
  /** 目标栏/任务是否已有内容（决定是否允许选择覆盖） */
  hasExisting: boolean;
  /** block=栏级（默认）；task=根任务级，解析结果作为该任务的子任务 */
  variant?: 'block' | 'task';
  onCancel: () => void;
  onApply: (tasks: TaskItem[], mode: 'append' | 'replace') => void;
}

/** 只读树形预览 */
const PreviewTree: React.FC<{ tasks: TaskItem[]; depth?: number }> = ({ tasks, depth = 0 }) => (
  <ul style={{ margin: 0, paddingLeft: depth === 0 ? 0 : 20, listStyle: 'none' }}>
    {tasks.map(t => (
      <li key={t.id}>
        <div style={{ padding: '2px 0', fontSize: 13, lineHeight: 1.6, color: '#333', wordBreak: 'break-all' }}>
          <span style={{ color: depth === 0 ? '#1890ff' : '#bbb', marginRight: 6 }}>
            {depth === 0 ? '●' : '○'}
          </span>
          {t.text}
        </div>
        {t.children && t.children.length > 0 && <PreviewTree tasks={t.children} depth={depth + 1} />}
      </li>
    ))}
  </ul>
);

/**
 * 栏级"整段解析"弹窗：粘贴一整块文本（可含多个根任务、多级序号、无序号标题），
 * 一次性解析成任务树并填入重点工作/常规工作栏。
 */
const ParseBlockModal: React.FC<ParseBlockModalProps> = ({ open, title, hasExisting, variant = 'block', onCancel, onApply }) => {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const isTask = variant === 'task';

  // 每次打开时重置
  useEffect(() => {
    if (open) {
      setText('');
      setMode('append');
    }
  }, [open]);

  const parsed = useMemo(() => parseHierarchicalText(text), [text]);

  const handleOk = () => {
    if (mode === 'replace' && hasExisting) {
      // 覆盖会丢失已有内容，二次确认
      Modal.confirm({
        title: '确认覆盖现有内容？',
        content: isTask ? '该任务下现有的子任务将被全部替换，且无法恢复。' : '该栏现有的任务将被全部替换，且无法恢复。',
        okText: '确认覆盖',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => onApply(parsed, mode),
      });
      return;
    }
    onApply(parsed, mode);
  };

  return (
    <Modal
      open={open}
      title={isTask ? `整段解析为「${title}」的子任务` : `整段解析填入：${title}`}
      width={720}
      okText={`填入 ${parsed.length > 0 ? `${parsed.length} 项` : ''}`}
      cancelText="取消"
      okButtonProps={{ disabled: parsed.length === 0 }}
      onOk={handleOk}
      onCancel={onCancel}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input.TextArea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={8}
          placeholder={'粘贴整段文本，支持 1./（1）/1）/① 等多级序号、单行紧凑列表、无序号标题分段\n\n例如：\n项目推进\n1. 完成方案评审\n（1）评审材料准备\n2. 输出会议纪要'}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Radio.Group
            value={mode}
            onChange={e => setMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="append">{isTask ? '追加为子任务' : '追加到现有任务'}</Radio.Button>
            <Radio.Button value="replace" disabled={!hasExisting}>{isTask ? '替换现有子任务' : '清空该栏后填入'}</Radio.Button>
          </Radio.Group>
          <span style={{ fontSize: 12, color: '#999' }}>
            {parsed.length > 0 ? `已识别 ${parsed.length} 个根任务` : '等待输入'}
          </span>
        </div>
        <div
          style={{
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            background: '#fafafa',
            padding: '8px 12px',
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {parsed.length > 0 ? (
            <PreviewTree tasks={parsed} />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="解析预览" />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ParseBlockModal;
