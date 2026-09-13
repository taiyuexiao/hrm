import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DatePicker, Button, Tag, Space, message, Popconfirm, Modal, Input, Segmented, Tooltip, Spin,
} from 'antd';
import { CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  dailyApi, DAILY_SECTIONS, toPeriod, DailyReport, DailyMeta,
} from '../../services/dailyApi';

const { TextArea } = Input;

/** 解析填入的栏目标题识别规则（本地规则解析，与周报 04/05 的本地解析同思路） */
const HEAD_RULES: [RegExp, string][] = [
  [/^(今日|今天)(的)?(学习|工作内容|工作|进展)?(内容)?[:：]?\s*/, 'today'],
  [/^(明日|明天)(的)?(学习|工作计划|工作|计划)?(安排)?[:：]?\s*/, 'tomorrow'],
  [/^(遇到(的)?问题|问题|困难|困惑|问题与困难)[:：]?\s*/, 'problems'],
  [/^(手头(的)?(学习及工作|学习|工作)?(任务)?|待办(事项)?|任务清单)[:：]?\s*/, 'ongoing'],
];

function parsePlainText(text: string): Record<string, string> {
  const out: Record<string, string[]> = { today: [], tomorrow: [], problems: [], ongoing: [] };
  let current = 'today';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let matched = false;
    for (const [re, key] of HEAD_RULES) {
      if (re.test(line)) {
        current = key;
        const rest = line.replace(re, '').trim();
        if (rest) out[key].push(rest);
        matched = true;
        break;
      }
    }
    if (!matched) out[current].push(line);
  }
  const result: Record<string, string> = {};
  for (const k of Object.keys(out)) result[k] = out[k].join('\n');
  return result;
}

interface FillViewProps {
  authUser: any;
  meta: DailyMeta | null;
}

const FillView: React.FC<FillViewProps> = ({ authUser, meta }) => {
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [sections, setSections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [parseOpen, setParseOpen] = useState(false);
  const [parseText, setParseText] = useState('');
  const [parsed, setParsed] = useState<Record<string, string> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  const period = toPeriod(date.toDate());

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await dailyApi.getMine('daily', p);
      if (res.success) {
        setReport(res.report);
        setSections(res.report?.sections || {});
        dirtyRef.current = false;
        setSaveState('idle');
      }
    } catch (e: any) {
      message.error('加载日报失败：' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  // 自动保存（1.5s 防抖），仅内容变化后触发
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        const res = await dailyApi.saveDraft('daily', period, sections);
        if (res.success) {
          setReport(res.report);
          setSaveState('saved');
          dirtyRef.current = false;
        } else {
          message.error(res.message || '自动保存失败');
          setSaveState('idle');
        }
      } catch {
        message.error('自动保存失败（网络异常）');
        setSaveState('idle');
      }
    }, 1500);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [sections, period]);

  const handleSectionChange = (key: string, value: string) => {
    dirtyRef.current = true;
    setSections(prev => ({ ...prev, [key]: value }));
  };

  const ensureSavedThen = async (action: () => Promise<void>) => {
    // 有未保存内容时先落库再执行（如提交）
    if (dirtyRef.current) {
      const res = await dailyApi.saveDraft('daily', period, sections);
      if (!res.success) {
        message.error(res.message || '保存失败，请重试');
        return;
      }
      setReport(res.report);
      dirtyRef.current = false;
    }
    await action();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await ensureSavedThen(async () => {
        const current = await dailyApi.getMine('daily', period);
        if (!current.success || !current.report) {
          message.error('保存失败，无法提交');
          return;
        }
        const res = await dailyApi.submit(current.report.id);
        if (res.success) {
          setReport(res.report);
          message.success('日报已提交');
        } else {
          message.error(res.message || '提交失败');
        }
      });
    } finally {
      setSubmitting(false);
    }
  };

  const applyParsed = (mode: 'overwrite' | 'append') => {
    if (!parsed) return;
    dirtyRef.current = true;
    setSections(prev => {
      const next = { ...prev };
      for (const { key } of DAILY_SECTIONS) {
        const piece = (parsed[key] || '').trim();
        if (!piece) continue;
        next[key] = mode === 'overwrite' || !prev[key]?.trim()
          ? piece
          : `${prev[key]}\n${piece}`;
      }
      return next;
    });
    setParseOpen(false);
    setParseText('');
    setParsed(null);
    message.success('已填入，请检查确认');
  };

  const myGroup = meta?.groups.find(g => g.id === authUser?.groupId);
  const myMentor = meta?.mentors.find(m => m.username === authUser?.mentor);
  const submitted = report?.status === 'submitted';
  const hasContent = Object.values(sections).some(v => v?.trim());

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 20px' }}>
      <Space wrap style={{ marginBottom: 14 }} size={10}>
        <Segmented
          options={[
            { label: '日报', value: 'daily' },
            { label: '周报（第三期开放）', value: 'weekly', disabled: true },
            { label: '月报（第三期开放）', value: 'monthly', disabled: true },
          ]}
          value="daily"
        />
        <DatePicker
          value={date}
          onChange={d => d && setDate(d)}
          allowClear={false}
          disabledDate={d => d.day() === 0 || d.day() === 6}
        />
        {myGroup && <Tag color="blue">{myGroup.name}{myGroup.leader ? ` · 组长：${myGroup.leader}` : ''}</Tag>}
        {(myMentor || authUser?.mentor) && (
          <Tag color="orange">带教老师：{myMentor?.name || authUser?.mentor}</Tag>
        )}
        {submitted && (
          <Tag icon={<CheckCircleOutlined />} color="success">
            已提交{report?.submittedAt ? `（${report.submittedAt.slice(11, 16)}）` : ''}
          </Tag>
        )}
        <Button
          type="primary"
          ghost
          icon={<ThunderboltOutlined />}
          style={{ marginLeft: 'auto' }}
          onClick={() => setParseOpen(true)}
        >
          智能解析填入
        </Button>
      </Space>

      <Spin spinning={loading}>
        {DAILY_SECTIONS.map((sec, idx) => (
          <div key={sec.key} style={{
            background: '#fff', borderRadius: 10, marginBottom: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,.04)', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderBottom: '1px solid #f5f5f5',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6, background: '#e6f4ff', color: '#1677ff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>{idx + 1}</span>
              <b>{sec.label}</b>
            </div>
            <div style={{ padding: '10px 16px' }}>
              <TextArea
                value={sections[sec.key] || ''}
                onChange={e => handleSectionChange(sec.key, e.target.value)}
                autoSize={{ minRows: 3, maxRows: 12 }}
                placeholder={`填写${sec.label}…`}
                style={{ fontSize: 13.5, lineHeight: 1.8 }}
              />
            </div>
          </div>
        ))}
      </Spin>

      <div style={{
        position: 'sticky', bottom: 0, background: 'rgba(255,255,255,.94)',
        borderTop: '1px solid #f0f0f0', padding: '10px 4px',
        display: 'flex', alignItems: 'center', gap: 12, borderRadius: 8,
      }}>
        <span style={{ color: '#8c8c8c', fontSize: 12.5 }}>
          {saveState === 'saving' && '保存中…'}
          {saveState === 'saved' && `✓ 已自动保存（${dayjs().format('HH:mm:ss')}）`}
          {saveState === 'idle' && '内容修改后 1.5 秒自动保存'}
        </span>
        <span style={{ flex: 1 }} />
        <Popconfirm
          title="提交本日日报？"
          description="提交后仍可修改（自动保存），但会标记提交时间。"
          onConfirm={handleSubmit}
          okText="提交"
          cancelText="再想想"
        >
          <Button type="primary" loading={submitting} disabled={!hasContent}>
            {submitted ? '更新提交时间' : '提交日报'}
          </Button>
        </Popconfirm>
      </div>

      {/* 智能解析填入 */}
      <Modal
        title="✨ 智能解析填入"
        open={parseOpen}
        onCancel={() => { setParseOpen(false); setParsed(null); }}
        width={860}
        footer={null}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 6, color: '#8c8c8c', fontSize: 12.5 }}>
              粘贴整段文字（含「今日/明日/遇到问题/手头任务」等标题识别更准）
            </div>
            <TextArea
              value={parseText}
              onChange={e => { setParseText(e.target.value); setParsed(null); }}
              style={{ minHeight: 300, fontSize: 13, lineHeight: 1.8 }}
              placeholder={'今日学习：…\n明日计划：…\n遇到问题：…\n手头任务：…'}
            />
          </div>
          <div style={{ alignSelf: 'center', textAlign: 'center' }}>
            <Button
              type="primary"
              shape="circle"
              icon="➜"
              disabled={!parseText.trim()}
              onClick={() => setParsed(parsePlainText(parseText))}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6, color: '#8c8c8c', fontSize: 12.5 }}>解析预览</div>
            <div style={{ minHeight: 300, maxHeight: 300, overflow: 'auto' }}>
              {parsed ? DAILY_SECTIONS.map(sec => (
                <div key={sec.key} style={{ border: '1px solid #e8e8e8', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{
                    background: parsed[sec.key]?.trim() ? '#f6ffed' : '#fafafa',
                    color: parsed[sec.key]?.trim() ? '#389e0d' : '#bfbfbf',
                    fontSize: 12, padding: '4px 10px', fontWeight: 600,
                  }}>
                    {sec.label}{parsed[sec.key]?.trim() ? '' : '（未识别到）'}
                  </div>
                  {parsed[sec.key]?.trim() && (
                    <div style={{ padding: '6px 10px', fontSize: 12.5, color: '#595959', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {parsed[sec.key]}
                    </div>
                  )}
                </div>
              )) : (
                <div style={{ color: '#bfbfbf', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
                  点击中间按钮开始解析
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Tooltip title="已有内容的栏目保留，解析结果追加到末尾">
            <Button disabled={!parsed} onClick={() => applyParsed('append')}>追加填入</Button>
          </Tooltip>
          <Tooltip title="解析结果替换对应栏目的现有内容">
            <Button type="primary" disabled={!parsed} onClick={() => applyParsed('overwrite')}>覆盖填入</Button>
          </Tooltip>
        </div>
      </Modal>
    </div>
  );
};

export default FillView;
