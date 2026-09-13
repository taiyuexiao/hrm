import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DatePicker, Button, Tag, Space, message, Popconfirm, Segmented, Spin, Select, Alert,
} from 'antd';
import { CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  dailyApi, MENTOR_GROUP_SECTIONS, MENTOR_PERSON_SECTIONS, fridayOf, monthPeriod, formatPeriod,
  MentorReport, DailyMeta,
} from '../../services/dailyApi';
import { MENTOR_GROUP_PARSE_RULES, MENTOR_PERSON_PARSE_RULES } from './parseFill';
import ParseModal from './ParseModal';
import { Input } from 'antd';

const { TextArea } = Input;

interface MentorFillViewProps {
  authUser: any;
  meta: DailyMeta | null;
}

/**
 * mentor 带教报告填报：小组报告（每周期一份）+ 个人报告（每个所带新人一份），周/月切换。
 * 个人报告对象后端强制校验必须是当前 mentor 所带的新人。
 */
const MentorFillView: React.FC<MentorFillViewProps> = ({ authUser, meta }) => {
  const [reportType, setReportType] = useState<'weekly' | 'monthly'>('weekly');
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [scope, setScope] = useState<'group' | 'person'>('group');
  const [person, setPerson] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<MentorReport | null>(null);
  const [sections, setSections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [parseOpen, setParseOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [missingWeeks, setMissingWeeks] = useState<string[]>([]);
  const [myReports, setMyReports] = useState<MentorReport[]>([]);
  const saveTimer = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  const period = reportType === 'weekly' ? fridayOf(date.toDate()) : monthPeriod(date.toDate());
  const sectionDefs = (scope === 'group' ? MENTOR_GROUP_SECTIONS : MENTOR_PERSON_SECTIONS)[reportType];

  // 我所带的新人（新人账号的 mentor 字段指向当前账号）
  const myMentees = useMemo(
    () => (meta?.newbies || []).filter(n => n.mentor === authUser?.username),
    [meta, authUser],
  );
  const myGroup = useMemo(() => {
    const gids = [...new Set(myMentees.map(n => n.groupId).filter(Boolean))];
    return gids.length === 1 ? meta?.groups.find(g => g.id === gids[0]) : undefined;
  }, [myMentees, meta]);

  // 小组报告的 target：所带新人同组时用该组；否则需要手工选组（极端情况）
  const [manualGroupId, setManualGroupId] = useState<string | undefined>(undefined);
  const groupTarget = myGroup?.id || manualGroupId;

  // mentor 补交提醒（缺交的小组周报）
  const refreshMissing = useCallback(() => {
    dailyApi.missing(28).then(res => {
      if (res.success) setMissingWeeks(res.missing);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshMissing();
  }, [refreshMissing]);

  // 本周期我的全部带教报告（进度统计：个人报告已填 x/y）
  const loadMyReports = useCallback(async () => {
    try {
      const res = await dailyApi.mentorFeed(reportType, period);
      if (res.success) {
        setMyReports(res.reports.filter(r => r.mentor === authUser?.username));
      }
    } catch { /* 进度加载失败不阻塞 */ }
  }, [reportType, period, authUser]);

  useEffect(() => {
    loadMyReports();
  }, [loadMyReports]);

  const target = scope === 'group' ? groupTarget : person;

  const load = useCallback(async () => {
    if (!target) {
      setReport(null);
      setSections({});
      return;
    }
    setLoading(true);
    try {
      const res = await dailyApi.mentorMine(scope, target, reportType, period);
      if (res.success) {
        setReport(res.report);
        setSections(res.report?.sections || {});
        dirtyRef.current = false;
        setSaveState('idle');
      } else {
        message.error(res.message || '加载报告失败');
      }
    } catch (e: any) {
      message.error('加载报告失败：' + e.message);
    } finally {
      setLoading(false);
    }
  }, [scope, target, reportType, period]);

  useEffect(() => {
    load();
  }, [load]);

  // 自动保存（1.5s 防抖）
  useEffect(() => {
    if (!dirtyRef.current || !target) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        const res = await dailyApi.saveMentorDraft({
          scope, target, reportType, period, sections,
        });
        if (res.success) {
          setReport(res.report);
          setSaveState('saved');
          dirtyRef.current = false;
          loadMyReports();
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
  }, [sections, scope, target, reportType, period, loadMyReports]);

  const handleSectionChange = (key: string, value: string) => {
    dirtyRef.current = true;
    setSections(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      if (dirtyRef.current) {
        const res = await dailyApi.saveMentorDraft({ scope, target, reportType, period, sections });
        if (!res.success) {
          message.error(res.message || '保存失败，请重试');
          return;
        }
        setReport(res.report);
        dirtyRef.current = false;
      }
      const current = await dailyApi.mentorMine(scope, target, reportType, period);
      if (!current.success || !current.report) {
        message.error('保存失败，无法提交');
        return;
      }
      const res = await dailyApi.submitMentor(current.report.id);
      if (res.success) {
        setReport(res.report);
        refreshMissing();
        loadMyReports();
        message.success('带教报告已提交');
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

  const submitted = report?.status === 'submitted';
  const hasContent = Object.values(sections).some(v => v?.trim());
  const personDone = myMentees.filter(n =>
    myReports.some(r => r.scope === 'person' && r.target === n.username),
  ).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 20px' }}>
      <Space wrap style={{ marginBottom: 14 }} size={10}>
        <Segmented
          options={[
            { label: '小组报告', value: 'group' },
            { label: `个人报告（按学员）`, value: 'person' },
          ]}
          value={scope}
          onChange={v => setScope(v as 'group' | 'person')}
        />
        <Segmented
          options={[
            { label: '周报', value: 'weekly' },
            { label: '月报', value: 'monthly' },
          ]}
          value={reportType}
          onChange={v => setReportType(v as 'weekly' | 'monthly')}
        />
        <DatePicker
          picker={reportType === 'weekly' ? 'week' : 'month'}
          value={date}
          onChange={d => d && setDate(d)}
          allowClear={false}
        />
        <Tag color="blue">周期：{formatPeriod(period)}</Tag>
        {scope === 'group' && (
          myGroup
            ? <Tag color="blue">小组：{myGroup.name}</Tag>
            : (
              <Select
                size="small"
                placeholder="选择小组"
                style={{ width: 140 }}
                value={manualGroupId}
                onChange={setManualGroupId}
                options={(meta?.groups || []).map(g => ({ label: g.name, value: g.id }))}
              />
            )
        )}
        {scope === 'person' && (
          <Select
            size="middle"
            placeholder="选择学员"
            style={{ width: 150 }}
            value={person}
            onChange={setPerson}
            options={myMentees.map(n => ({ label: n.name, value: n.username }))}
            notFoundContent={myMentees.length === 0 ? '暂无分配给您的学员' : undefined}
          />
        )}
        {scope === 'person' && myMentees.length > 0 && (
          <Tag color={personDone === myMentees.length ? 'success' : 'warning'}>
            个人报告：已填 {personDone}/{myMentees.length} 人
          </Tag>
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
          disabled={!target}
          onClick={() => setParseOpen(true)}
        >
          智能解析填入
        </Button>
      </Space>

      {missingWeeks.length > 0 && reportType === 'weekly' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 14 }}
          message={
            <span>
              您还有 <b>{missingWeeks.length}</b> 周的小组带教周报未提交，最早：
              <a onClick={() => setDate(dayjs(new Date(
                +missingWeeks[0].slice(0, 4),
                +missingWeeks[0].slice(4, 6) - 1,
                +missingWeeks[0].slice(6, 8),
              )))}>
                {formatPeriod(missingWeeks[0])} 周
              </a>
              ，点击周期补交。
            </span>
          }
        />
      )}

      {!target && (
        <Alert
          type="info"
          showIcon
          message={scope === 'person' ? '请先选择要评估的学员' : '请先选择小组'}
          style={{ marginBottom: 14 }}
        />
      )}

      <Spin spinning={loading}>
        {target && sectionDefs.map((sec, idx) => (
          <div key={sec.key} style={{
            background: '#fff', borderRadius: 10, marginBottom: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,.04)', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderBottom: '1px solid #f5f5f5',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6, background: '#fff7e6', color: '#d48806',
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
          title="提交本周期带教报告？"
          description="提交后仍可修改（自动保存），但会标记提交时间。"
          onConfirm={handleSubmit}
          okText="提交"
          cancelText="再想想"
        >
          <Button type="primary" loading={submitting} disabled={!hasContent || !target}>
            {submitted ? '更新提交时间' : '提交报告'}
          </Button>
        </Popconfirm>
      </div>

      <ParseModal
        open={parseOpen}
        sections={sectionDefs}
        rules={scope === 'group' ? MENTOR_GROUP_PARSE_RULES : MENTOR_PERSON_PARSE_RULES}
        onApply={applyParsed}
        onCancel={() => setParseOpen(false)}
      />
    </div>
  );
};

export default MentorFillView;
