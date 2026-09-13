import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DatePicker, Button, Tag, Avatar, Input, message, Popconfirm, Segmented, Spin, Empty, Select, Modal,
} from 'antd';
import {
  CheckCircleOutlined, DeleteOutlined, EyeOutlined, SendOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  dailyApi, NEWBIE_SECTIONS, MENTOR_GROUP_SECTIONS, MENTOR_PERSON_SECTIONS,
  toPeriod, fridayOf, monthPeriod, formatPeriod,
  DailyReport, DailyComment, DailyMeta, FeedEntry, DailyReader, MentorReport, SectionDef,
} from '../../services/dailyApi';

const { TextArea } = Input;

const ROLE_TAG: Record<string, { label: string; color: string }> = {
  newbie: { label: '新人', color: 'blue' },
  mentor: { label: '带教老师', color: 'orange' },
  leader: { label: '领导', color: 'purple' },
  staff: { label: '员工', color: 'default' },
};

const AVATAR_COLORS = ['#1677ff', '#13c2c2', '#722ed1', '#eb2f96', '#fa8c16', '#2f54eb', '#52c41a', '#f5222d'];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** 浏览种类：新人日/周/月报 + 带教周/月报 */
export type BrowseKind = 'daily' | 'weekly' | 'monthly' | 'mentor-weekly' | 'mentor-monthly';

export interface BrowseTarget {
  kind: BrowseKind;
  period: string;
  username?: string;   // 新人报告：按新人定位
  reportId?: string;   // 带教报告：按报告定位
}

const KIND_OPTIONS = [
  { label: '新人日报', value: 'daily' },
  { label: '新人周报', value: 'weekly' },
  { label: '新人月报', value: 'monthly' },
  { label: '带教周报', value: 'mentor-weekly' },
  { label: '带教月报', value: 'mentor-monthly' },
];

interface BrowseViewProps {
  authUser: any;
  meta: DailyMeta | null;
  target?: BrowseTarget | null;
  onTargetConsumed?: () => void;
}

function periodToDayjs(p: string): Dayjs {
  if (/^\d{6}$/.test(p)) return dayjs(new Date(+p.slice(0, 4), +p.slice(4, 6) - 1, 1));
  return dayjs(new Date(+p.slice(0, 4), +p.slice(4, 6) - 1, +p.slice(6, 8)));
}

const BrowseView: React.FC<BrowseViewProps> = ({ authUser, meta, target, onTargetConsumed }) => {
  const [kind, setKind] = useState<BrowseKind>(target?.kind || 'daily');
  const [date, setDate] = useState<Dayjs>(() => (target ? periodToDayjs(target.period) : dayjs()));
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [mentorReports, setMentorReports] = useState<MentorReport[]>([]);
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [selected, setSelected] = useState<string | null>(null); // 新人 username 或 mentor 报告 id
  const [report, setReport] = useState<DailyReport | MentorReport | null>(null);
  const [comments, setComments] = useState<DailyComment[]>([]);
  const [readers, setReaders] = useState<DailyReader[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<DailyComment | null>(null);
  const [quote, setQuote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const reportBodyRef = useRef<HTMLDivElement>(null);

  const isMentorKind = kind.startsWith('mentor-');
  const mentorType: 'weekly' | 'monthly' = kind === 'mentor-monthly' ? 'monthly' : 'weekly';

  const period = kind === 'daily'
    ? toPeriod(date.toDate())
    : kind === 'weekly' || kind === 'mentor-weekly'
      ? fridayOf(date.toDate())
      : monthPeriod(date.toDate());

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    try {
      if (isMentorKind) {
        const res = await dailyApi.mentorFeed(mentorType, period);
        if (res.success) {
          setMentorReports(res.reports);
          setLoadedPeriod(period);
        }
      } else {
        const res = await dailyApi.feed(kind as 'daily' | 'weekly' | 'monthly', period);
        if (res.success) {
          setEntries(res.entries);
          setLoadedPeriod(period);
        }
      }
    } catch (e: any) {
      message.error('加载列表失败：' + e.message);
    } finally {
      setLoadingFeed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, period]);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  const loadDetail = useCallback(async (reportId: string) => {
    setLoadingDetail(true);
    try {
      const res = await dailyApi.detail(reportId);
      if (res.success) {
        setReport(res.report);
        setComments(res.comments);
        setReaders(res.readers);
        dailyApi.markRead(reportId).then(() => dailyApi.detail(reportId)).then(r2 => {
          if (r2.success) setReaders(r2.readers);
        }).catch(() => {});
      }
    } catch (e: any) {
      message.error('加载报告失败：' + e.message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleSelectEntry = (entry: FeedEntry) => {
    setSelected(entry.username);
    if (entry.report) {
      loadDetail(entry.report.id);
    } else {
      setReport(null);
      setComments([]);
      setReaders([]);
    }
  };

  const handleSelectMentorReport = (r: MentorReport) => {
    setSelected(r.id);
    loadDetail(r.id);
  };

  // 外部跳转定位（看板圆点等）：切 kind → 切日期 → 等目标周期 feed 就绪 → 定位
  useEffect(() => {
    if (!target) return;
    if (target.kind !== kind) {
      setKind(target.kind);
      return;
    }
    if (target.period !== period) {
      setDate(periodToDayjs(target.period));
      return;
    }
    if (loadedPeriod !== period) return; // 目标周期 feed 尚未返回（BUG-002 防线）
    if (target.reportId) {
      const r = mentorReports.find(x => x.id === target.reportId);
      if (r) {
        handleSelectMentorReport(r);
        onTargetConsumed?.();
      }
    } else if (target.username) {
      const entry = entries.find(e => e.username === target.username);
      if (entry) {
        handleSelectEntry(entry);
        onTargetConsumed?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, kind, period, entries, mentorReports, loadedPeriod]);

  // 评论按楼层组织（一层回复）
  const { topLevel, repliesOf } = useMemo(() => {
    const top: DailyComment[] = [];
    const replies: Record<string, DailyComment[]> = {};
    for (const c of comments) {
      if (c.parentId) {
        (replies[c.parentId] = replies[c.parentId] || []).push(c);
      } else {
        top.push(c);
      }
    }
    return { topLevel: top, repliesOf: replies };
  }, [comments]);

  // @提及：扫描内容中 @姓名，匹配 meta 内的新人和 mentor
  const parseMentions = (content: string): string[] => {
    const names = new Map<string, string>();
    meta?.newbies.forEach(n => names.set(n.name, n.username));
    meta?.mentors.forEach(m => names.set(m.name, m.username));
    const found: string[] = [];
    for (const [name, username] of names) {
      if (content.includes(`@${name}`)) found.push(username);
    }
    return found;
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !report) return;
    setSending(true);
    try {
      const res = await dailyApi.addComment(report.id, {
        content,
        parentId: replyTo?.id,
        quote: quote || undefined,
        mentions: parseMentions(content),
      });
      if (res.success) {
        setComments(res.comments);
        setInput('');
        setReplyTo(null);
        setQuote(null);
        message.success(replyTo ? '回复成功' : '批注成功');
      } else {
        message.error(res.message || '发送失败');
      }
    } catch (e: any) {
      message.error('发送失败：' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = async (c: DailyComment) => {
    try {
      const res = await dailyApi.deleteComment(c.id);
      if (res.success && report) {
        message.success('已删除');
        loadDetail(report.id);
      } else {
        message.error(res.message || '删除失败');
      }
    } catch (e: any) {
      message.error('删除失败：' + e.message);
    }
  };

  // 划词批注：在报告正文上划选文字，生成引用批注
  const handleReportMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && report && reportBodyRef.current?.contains(sel?.anchorNode || null)) {
      setQuote(text.slice(0, 200));
    }
  };

  const handleAi = async () => {
    if (!report) return;
    setAiOpen(true);
    setAiLoading(true);
    setAiText('');
    try {
      const res = await dailyApi.aiSummary(report.id);
      setAiText(res.success ? res.summary : (res.message || 'AI 服务异常'));
    } catch (e: any) {
      setAiText('AI 服务异常：' + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const visibleEntries = useMemo(() => {
    if (filter === 'mine') return entries.filter(e => e.mentor === authUser?.username);
    return entries;
  }, [entries, filter, authUser]);

  const newbieGrouped = useMemo(() => {
    const groups: { name: string; leader?: string; items: FeedEntry[] }[] = [];
    const byGroup = new Map<string, FeedEntry[]>();
    for (const e of visibleEntries) {
      const key = e.groupId || '_none';
      (byGroup.get(key) ?? byGroup.set(key, []).get(key)!).push(e);
    }
    meta?.groups.forEach(g => {
      const items = byGroup.get(g.id);
      if (items?.length) groups.push({ name: g.name, leader: g.leader, items });
      byGroup.delete(g.id);
    });
    const rest = byGroup.get('_none');
    if (rest?.length) groups.push({ name: '未分组', items: rest });
    return groups;
  }, [visibleEntries, meta]);

  const mentorGrouped = useMemo(() => {
    const map = new Map<string, MentorReport[]>();
    for (const r of mentorReports) {
      const key = r.mentorName || r.mentor;
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'group' ? -1 : 1));
    }
    return [...map.entries()];
  }, [mentorReports]);

  const isMentorReport = (r: any): r is MentorReport => r && 'scope' in r;
  const sectionDefs: SectionDef[] = report
    ? isMentorReport(report)
      ? (report.scope === 'group' ? MENTOR_GROUP_SECTIONS : MENTOR_PERSON_SECTIONS)[report.reportType]
      : NEWBIE_SECTIONS[(report as DailyReport).reportType] || NEWBIE_SECTIONS.daily
    : [];

  const selectedEntry = entries.find(e => e.username === selected);
  const readerNames = readers.map(r => r.name).join('、');

  const renderComment = (c: DailyComment, isReply = false) => {
    const tag = ROLE_TAG[c.authorRole] || ROLE_TAG.staff;
    const canDelete = c.authorId === authUser?.username || authUser?.role === 'superadmin';
    return (
      <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: isReply ? 'none' : '1px dashed #f0f0f0' }}>
        <Avatar size={isReply ? 24 : 30} style={{ background: avatarColor(c.authorName || '?'), flexShrink: 0 }}>
          {c.authorName?.[0] || '?'}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <b style={{ fontSize: 13 }}>{c.authorName}</b>
            <Tag color={tag.color} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{tag.label}</Tag>
            <span style={{ color: '#bfbfbf', fontSize: 11.5, marginLeft: 'auto' }}>
              {(c.createdAt || '').slice(5, 16).replace('T', ' ')}
            </span>
          </div>
          {c.quote && (
            <div style={{
              background: '#fffbe6', borderLeft: '3px solid #faad14', padding: '4px 8px',
              fontSize: 12, color: '#8c8c8c', borderRadius: '0 6px 6px 0', marginTop: 4,
            }}>
              引用：「{c.quote}」
            </div>
          )}
          <div style={{ fontSize: 13, color: '#404040', lineHeight: 1.7, marginTop: 3, whiteSpace: 'pre-wrap' }}>{c.content}</div>
          {!isReply && (
            <div style={{ marginTop: 4, fontSize: 12, display: 'flex', gap: 4 }}>
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setReplyTo(c)}>回复</Button>
              {canDelete && (
                <Popconfirm title="删除该评论及其回复？" onConfirm={() => handleDeleteComment(c)} okText="删除" cancelText="取消">
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} style={{ padding: 0 }} />
                </Popconfirm>
              )}
            </div>
          )}
          {(repliesOf[c.id] || []).map(r => (
            <div key={r.id} style={{ background: '#f7f9fc', borderRadius: 8, padding: '4px 10px', marginTop: 6 }}>
              {renderComment(r, true)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const periodPicker = kind === 'daily' ? (
    <DatePicker
      value={date}
      onChange={d => d && setDate(d)}
      allowClear={false}
      size="small"
      style={{ width: '100%', marginBottom: 8 }}
      disabledDate={d => d.day() === 0 || d.day() === 6}
    />
  ) : (
    <DatePicker
      picker={kind === 'weekly' || kind === 'mentor-weekly' ? 'week' : 'month'}
      value={date}
      onChange={d => d && setDate(d)}
      allowClear={false}
      size="small"
      style={{ width: '100%', marginBottom: 8 }}
    />
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr 330px', gap: 14, padding: '16px 20px', alignItems: 'start' }}>
      {/* 左：报告树 */}
      <div style={{ background: '#fff', borderRadius: 10, padding: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
        <Select
          value={kind}
          onChange={v => { setKind(v as BrowseKind); setSelected(null); setReport(null); }}
          options={KIND_OPTIONS}
          size="small"
          style={{ width: '100%', marginBottom: 8 }}
        />
        {periodPicker}
        {!isMentorKind && (
          <Segmented
            block
            size="small"
            value={filter}
            onChange={v => setFilter(v as 'all' | 'mine')}
            options={[{ label: '全部', value: 'all' }, { label: '⭐ 我带的', value: 'mine' }]}
            style={{ marginBottom: 8 }}
          />
        )}
        <Spin spinning={loadingFeed}>
          {!isMentorKind && newbieGrouped.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无新人账号" />}
          {!isMentorKind && newbieGrouped.map(g => (
            <div key={g.name}>
              <div style={{ fontSize: 12, color: '#8c8c8c', padding: '8px 8px 4px' }}>
                ▾ {g.name}{g.leader ? ` · 组长：${g.leader}` : ''}
              </div>
              {g.items.map(e => {
                const ok = e.report?.status === 'submitted';
                return (
                  <div
                    key={e.username}
                    onClick={() => handleSelectEntry(e)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                      borderRadius: 6, cursor: 'pointer', fontSize: 13.5,
                      background: selected === e.username ? '#e6f4ff' : undefined,
                      color: selected === e.username ? '#0958d9' : undefined,
                      fontWeight: selected === e.username ? 600 : 400,
                    }}
                  >
                    <Avatar size={22} style={{ background: avatarColor(e.name), fontSize: 11 }}>{e.name?.[0]}</Avatar>
                    {e.name}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: ok ? '#52c41a' : e.report ? '#faad14' : '#ff4d4f' }}>
                      {ok ? '已交' : e.report ? '草稿' : '未交'}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {isMentorKind && mentorGrouped.length === 0 && !loadingFeed && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周期暂无带教报告" />
          )}
          {isMentorKind && mentorGrouped.map(([mentorName, reports]) => (
            <div key={mentorName}>
              <div style={{ fontSize: 12, color: '#8c8c8c', padding: '8px 8px 4px' }}>▾ 🧑‍🏫 {mentorName}</div>
              {reports.map(r => {
                const ok = r.status === 'submitted';
                return (
                  <div
                    key={r.id}
                    onClick={() => handleSelectMentorReport(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px 7px 18px',
                      borderRadius: 6, cursor: 'pointer', fontSize: 13,
                      background: selected === r.id ? '#e6f4ff' : undefined,
                      color: selected === r.id ? '#0958d9' : undefined,
                      fontWeight: selected === r.id ? 600 : 400,
                    }}
                  >
                    {r.scope === 'group' ? '👥 小组报告' : `👤 ${r.targetName || r.target}`}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: ok ? '#52c41a' : '#faad14' }}>
                      {ok ? '已交' : '草稿'}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </Spin>
      </div>

      {/* 中：报告正文 */}
      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)', minHeight: 400 }}>
        {!selected && <Empty style={{ marginTop: 120 }} description="从左侧选择一份报告查看" />}
        {selected && !report && !loadingDetail && !isMentorKind && (
          <Empty style={{ marginTop: 120 }} description={`${selectedEntry?.name || ''} 尚未填写 ${formatPeriod(period)} 的报告`} />
        )}
        {report && (
          <Spin spinning={loadingDetail}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isMentorReport(report) ? (
                  <>
                    <Avatar size={36} style={{ background: avatarColor(report.mentorName || '?') }}>{report.mentorName?.[0]}</Avatar>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {report.mentorName} · {report.scope === 'group' ? '小组' : `个人（${report.targetName || report.target}）`}
                        带教{report.reportType === 'weekly' ? '周报' : '月报'}
                        <Tag color="orange" style={{ marginLeft: 4 }}>{formatPeriod(report.period)}</Tag>
                      </div>
                      <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 2 }}>
                        {report.submittedAt ? `提交于 ${report.submittedAt.slice(11, 16)}` : '草稿（未提交）'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Avatar size={36} style={{ background: avatarColor((report as DailyReport).authorName || '?') }}>
                      {(report as DailyReport).authorName?.[0]}
                    </Avatar>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {(report as DailyReport).authorName} · {{ daily: '日报', weekly: '周报', monthly: '月报' }[(report as DailyReport).reportType]}
                        <Tag color="blue" style={{ marginLeft: 4 }}>{formatPeriod(report.period)}</Tag>
                      </div>
                      <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 2 }}>
                        {(report as DailyReport).groupName || '未分组'}
                        {(report as DailyReport).mentorName ? ` · 带教：${(report as DailyReport).mentorName}` : ''}
                        {report.submittedAt ? ` · 提交于 ${report.submittedAt.slice(11, 16)}` : ' · 草稿（未提交）'}
                      </div>
                    </div>
                  </>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button type="link" icon={<ThunderboltOutlined />} onClick={handleAi}>AI 总结</Button>
                  {report.status === 'submitted'
                    ? <Tag icon={<CheckCircleOutlined />} color="success">已提交</Tag>
                    : <Tag color="warning">草稿</Tag>}
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 20px' }} ref={reportBodyRef} onMouseUp={handleReportMouseUp}>
              {sectionDefs.map(sec => (
                <div key={sec.key} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 4, height: 14, background: '#1677ff', borderRadius: 2, display: 'inline-block' }} />
                    {sec.label}
                  </div>
                  <div style={{ color: '#404040', lineHeight: 1.9, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>
                    {report.sections?.[sec.key]?.trim() || <span style={{ color: '#bfbfbf' }}>（未填写）</span>}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: '#bfbfbf' }}>💡 在正文上划选文字，可对选句发起批注</div>
            </div>
          </Spin>
        )}
      </div>

      {/* 右：评论区 */}
      <div style={{ background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          💬 批注与评论 <span style={{ color: '#bfbfbf', fontWeight: 400, fontSize: 12 }}>（{comments.length}）</span>
        </div>
        {readers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px 8px', fontSize: 12, color: '#8c8c8c' }}>
            <EyeOutlined /> 已读：<b style={{ color: '#595959' }}>{readerNames}</b> 等 {readers.length} 人
          </div>
        )}
        {!report && <div style={{ color: '#bfbfbf', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>选择报告后可批注</div>}
        {report && (
          <>
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {comments.length === 0 && (
                <div style={{ color: '#bfbfbf', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>还没有批注，来第一条</div>
              )}
              {topLevel.map(c => renderComment(c))}
            </div>
            {quote && (
              <div style={{
                background: '#fffbe6', borderLeft: '3px solid #faad14', borderRadius: '0 6px 6px 0',
                padding: '4px 8px', fontSize: 12, color: '#8c8c8c', marginTop: 8,
                display: 'flex', justifyContent: 'space-between', gap: 8,
              }}>
                <span>引用：「{quote.length > 40 ? quote.slice(0, 40) + '…' : quote}」</span>
                <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }} onClick={() => setQuote(null)}>取消</Button>
              </div>
            )}
            {replyTo && (
              <div style={{
                background: '#f0f5ff', borderRadius: 6, padding: '4px 8px', fontSize: 12,
                color: '#0958d9', marginTop: 8, display: 'flex', justifyContent: 'space-between',
              }}>
                <span>回复 {replyTo.authorName}：{replyTo.content.slice(0, 30)}{replyTo.content.length > 30 ? '…' : ''}</span>
                <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }} onClick={() => setReplyTo(null)}>取消</Button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <TextArea
                value={input}
                onChange={e => setInput(e.target.value)}
                autoSize={{ minRows: 1, maxRows: 4 }}
                placeholder={quote ? '对选句的批注…' : replyTo ? `回复 ${replyTo.authorName}…` : '写下批注，@姓名 可提醒对方…'}
                onPressEnter={e => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={handleSend} disabled={!input.trim()} />
            </div>
            <div style={{ fontSize: 11.5, color: '#bfbfbf', marginTop: 6 }}>提示：@姓名 可触发通知提醒；正文划词可引用批注</div>
          </>
        )}
      </div>

      {/* AI 总结 */}
      <Modal
        title="✨ AI 总结与完成度评估"
        open={aiOpen}
        onCancel={() => setAiOpen(false)}
        footer={<Button type="primary" onClick={() => setAiOpen(false)}>关闭</Button>}
        width={640}
      >
        <Spin spinning={aiLoading} tip="AI 分析中…">
          <div style={{ minHeight: 120, whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.9, color: '#404040', padding: '8px 0' }}>
            {aiText}
          </div>
        </Spin>
      </Modal>
    </div>
  );
};

export default BrowseView;
