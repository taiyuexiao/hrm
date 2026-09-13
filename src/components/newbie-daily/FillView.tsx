import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DatePicker, Button, Tag, Space, message, Popconfirm, Segmented, Spin, Alert, Input,
} from 'antd';
import { CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  dailyApi, NEWBIE_SECTIONS, toPeriod, fridayOf, monthPeriod, formatPeriod,
  DailyReport, DailyMeta, ReportType,
} from '../../services/dailyApi';
import { NEWBIE_PARSE_RULES } from './parseFill';
import ParseModal from './ParseModal';

const { TextArea } = Input;

interface FillViewProps {
  authUser: any;
  meta: DailyMeta | null;
}

const TYPE_LABEL: Record<ReportType, string> = { daily: '日报', weekly: '周报', monthly: '月报' };

const FillView: React.FC<FillViewProps> = ({ authUser, meta }) => {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [sections, setSections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [parseOpen, setParseOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [missingDays, setMissingDays] = useState<string[]>([]);
  const saveTimer = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  // 周期标识按报告类型计算：日报=工作日，周报=当周五，月报=当月
  const period = reportType === 'daily'
    ? toPeriod(date.toDate())
    : reportType === 'weekly'
      ? fridayOf(date.toDate())
      : monthPeriod(date.toDate());
  const sectionDefs = NEWBIE_SECTIONS[reportType];

  // 补交提醒：最近 30 天内未提交日报的工作日（后端计算，前端只展示）
  const refreshMissing = useCallback(() => {
    dailyApi.missing(30).then(res => {
      if (res.success) setMissingDays(res.missing);
    }).catch(() => { /* 提醒失败不阻塞填报 */ });
  }, []);

  useEffect(() => {
    refreshMissing();
  }, [refreshMissing]);

  const load = useCallback(async (type: ReportType, p: string) => {
    setLoading(true);
    try {
      const res = await dailyApi.getMine(type, p);
      if (res.success) {
        setReport(res.report);
        setSections(res.report?.sections || {});
        dirtyRef.current = false;
        setSaveState('idle');
      }
    } catch (e: any) {
      message.error('加载报告失败：' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(reportType, period);
  }, [reportType, period, load]);

  // 自动保存（1.5s 防抖），仅内容变化后触发
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        const res = await dailyApi.saveDraft(reportType, period, sections);
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
  }, [sections, period, reportType]);

  const handleSectionChange = (key: string, value: string) => {
    dirtyRef.current = true;
    setSections(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (dirtyRef.current) {
        const res = await dailyApi.saveDraft(reportType, period, sections);
        if (!res.success) {
          message.error(res.message || '保存失败，请重试');
          return;
        }
        setReport(res.report);
        dirtyRef.current = false;
      }
      const current = await dailyApi.getMine(reportType, period);
      if (!current.success || !current.report) {
        message.error('保存失败，无法提交');
        return;
      }
      const res = await dailyApi.submit(current.report.id);
      if (res.success) {
        setReport(res.report);
        refreshMissing();
        message.success(`${TYPE_LABEL[reportType]}已提交`);
      } else {
        message.error(res.message || '提交失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const applyParsed = (mode: 'overwrite' | 'append', parsed: Record<string, string>) => {
    dirtyRef.current = true;
    setSections(prev => {
      const next = { ...prev };
      for (const { key } of sectionDefs) {
        const piece = (parsed[key] || '').trim();
        if (!piece) continue;
        next[key] = mode === 'overwrite' || !prev[key]?.trim()
          ? piece
          : `${prev[key]}\n${piece}`;
      }
      return next;
    });
    setParseOpen(false);
    message.success('已填入，请检查确认');
  };

  const myGroup = meta?.groups.find(g => g.id === authUser?.groupId);
  const myMentor = meta?.mentors.find(m => m.username === authUser?.mentor);
  const submitted = report?.status === 'submitted';
  const hasContent = Object.values(sections).some(v => v?.trim());

  const periodPicker = reportType === 'daily' ? (
    <DatePicker
      value={date}
      onChange={d => d && setDate(d)}
      allowClear={false}
      disabledDate={d => d.day() === 0 || d.day() === 6}
    />
  ) : reportType === 'weekly' ? (
    <DatePicker
      picker="week"
      value={date}
      onChange={d => d && setDate(d)}
      allowClear={false}
    />
  ) : (
    <DatePicker
      picker="month"
      value={date}
      onChange={d => d && setDate(d)}
      allowClear={false}
    />
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 20px' }}>
      <Space wrap style={{ marginBottom: 14 }} size={10}>
        <Segmented
          options={[
            { label: '日报', value: 'daily' },
            { label: '周报', value: 'weekly' },
            { label: '月报', value: 'monthly' },
          ]}
          value={reportType}
          onChange={v => setReportType(v as ReportType)}
        />
        {periodPicker}
        <Tag color="blue">周期：{formatPeriod(period)}</Tag>
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

      {missingDays.length > 0 && reportType === 'daily' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 14 }}
          message={
            <span>
              您还有 <b>{missingDays.length}</b> 个工作日未提交日报（最近 30 天内），最早：
              <a onClick={() => setDate(dayjs(new Date(
                +missingDays[0].slice(0, 4),
                +missingDays[0].slice(4, 6) - 1,
                +missingDays[0].slice(6, 8),
              )))}>
                {formatPeriod(missingDays[0])}
              </a>
              ，点击日期补交。
            </span>
          }
        />
      )}

      <Spin spinning={loading}>
        {sectionDefs.map((sec, idx) => (
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
                onChange={(e: any) => handleSectionChange(sec.key, e.target.value)}
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
          title={`提交本${reportType === 'daily' ? '日' : reportType === 'weekly' ? '周' : '月'}${TYPE_LABEL[reportType]}？`}
          description="提交后仍可修改（自动保存），但会标记提交时间。"
          onConfirm={handleSubmit}
          okText="提交"
          cancelText="再想想"
        >
          <Button type="primary" loading={submitting} disabled={!hasContent}>
            {submitted ? '更新提交时间' : `提交${TYPE_LABEL[reportType]}`}
          </Button>
        </Popconfirm>
      </div>

      <ParseModal
        open={parseOpen}
        sections={sectionDefs}
        rules={NEWBIE_PARSE_RULES}
        onApply={applyParsed}
        onCancel={() => setParseOpen(false)}
      />
    </div>
  );
};

export default FillView;
