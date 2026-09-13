import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DatePicker, Segmented, Spin, message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { dailyApi, toPeriod, DashboardEntry } from '../../services/dailyApi';

/**
 * 提交管理看板（点阵图）：行=新人（按小组分组），列=当月工作日。
 * 状态判定在前端：绿=当天提交，黄=补交（提交日晚于报告日），灰=缺交，空=未到期/非工作日。
 * mentor / 日报领导 / 超管可见。
 */

type CellState = 'ontime' | 'late' | 'missing' | 'future' | 'none';

interface DashboardViewProps {
  /** 点击圆点跳转：打开浏览页并选中该新人该周期 */
  onOpenReport: (username: string, period: string) => void;
  meta: import('../../services/dailyApi').DailyMeta | null;
}

const CELL_COLOR: Record<CellState, string> = {
  ontime: '#52c41a',
  late: '#faad14',
  missing: '#e5e6eb',
  future: 'transparent',
  none: 'transparent',
};

function workdaysOfMonth(month: Dayjs, today: Dayjs): Dayjs[] {
  const days: Dayjs[] = [];
  const end = month.endOf('month').isAfter(today) ? today : month.endOf('month');
  let d = month.startOf('month');
  while (d.isBefore(end) || d.isSame(end, 'day')) {
    if (d.day() !== 0 && d.day() !== 6) days.push(d);
    d = d.add(1, 'day');
  }
  return days;
}

const DashboardView: React.FC<DashboardViewProps> = ({ onOpenReport, meta }) => {
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const today = dayjs();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = toPeriod(month.startOf('month').toDate());
      const to = toPeriod((month.endOf('month').isAfter(today) ? today : month.endOf('month')).toDate());
      const res = await dailyApi.dashboard(from, to);
      if (res.success) {
        setEntries(res.entries);
      } else {
        message.error(res.message || '加载看板失败');
      }
    } catch (e: any) {
      message.error('加载看板失败：' + e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => workdaysOfMonth(month, today), [month, today]);
  const todayPeriod = toPeriod(today.toDate());

  const visible = useMemo(
    () => (groupFilter === 'all' ? entries : entries.filter(e => e.groupId === groupFilter)),
    [entries, groupFilter],
  );

  const cellOf = (e: DashboardEntry, period: string): { state: CellState; reportId?: string } => {
    const report = e.reports.find(r => r.period === period);
    if (report?.status === 'submitted' && report.submittedAt) {
      const submitDay = report.submittedAt.slice(0, 10).replace(/-/g, '');
      return { state: submitDay <= period ? 'ontime' : 'late', reportId: report.id };
    }
    if (period <= todayPeriod) return { state: 'missing' };
    return { state: 'future' };
  };

  const stats = useMemo(() => {
    let dueToday = visible.length;
    let submittedToday = 0;
    let expected = 0;
    let actual = 0;
    for (const e of visible) {
      const todayReport = e.reports.find(r => r.period === todayPeriod);
      if (todayReport?.status === 'submitted') submittedToday++;
      for (const d of days) {
        expected++;
        const { state } = cellOf(e, toPeriod(d.toDate()));
        if (state === 'ontime' || state === 'late') actual++;
      }
    }
    return {
      dueToday,
      submittedToday,
      missingToday: dueToday - submittedToday,
      rate: expected > 0 ? ((actual / expected) * 100).toFixed(1) : '-',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, days, todayPeriod]);

  const grouped = useMemo(() => {
    const map = new Map<string, DashboardEntry[]>();
    for (const e of visible) {
      const key = e.groupName || '未分组';
      (map.get(key) ?? map.set(key, []).get(key)!).push(e);
    }
    return [...map.entries()];
  }, [visible]);

  const groupOptions = useMemo(() => {
    const opts = [{ label: '全部小组', value: 'all' }];
    meta?.groups.forEach(g => opts.push({ label: g.name, value: g.id }));
    return opts;
  }, [meta]);

  const statCard = (icon: string, value: React.ReactNode, label: string, bg: string) => (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '14px 18px', display: 'flex',
      alignItems: 'center', gap: 14, boxShadow: '0 1px 2px rgba(0,0,0,.04)',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10, background: bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 20,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
        <div style={{ color: '#8c8c8c', fontSize: 12.5 }}>{label}</div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        {statCard('📮', visible.length, '今日应提交', '#e6f4ff')}
        {statCard('✅', <span style={{ color: '#389e0d' }}>{stats.submittedToday}</span>, '今日已提交', '#f6ffed')}
        {statCard('⚠️', <span style={{ color: '#cf1322' }}>{stats.missingToday}</span>, '今日未提交', '#fff1f0')}
        {statCard('📈', <span style={{ color: '#d48806' }}>{stats.rate}%</span>, '本月提交率', '#fff7e6')}
      </div>

      <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 2px rgba(0,0,0,.04)', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 15 }}>新人日报提交点阵</b>
          <DatePicker
            picker="month"
            value={month}
            onChange={d => d && setMonth(d)}
            allowClear={false}
          />
          <Segmented options={groupOptions} value={groupFilter} onChange={v => setGroupFilter(v as string)} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12.5, color: '#595959', alignItems: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: CELL_COLOR.ontime, verticalAlign: '-2px' }} /> 已交</span>
            <span><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: CELL_COLOR.late, verticalAlign: '-2px' }} /> 补交</span>
            <span><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: CELL_COLOR.missing, border: '2px solid #dcdee5', verticalAlign: '-2px' }} /> 缺交</span>
            <span style={{ color: '#bfbfbf' }}>点击圆点可查看当天日报</span>
          </div>
        </div>
        <Spin spinning={loading}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 14px 6px 4px', fontWeight: 400, color: '#8c8c8c', fontSize: 12.5 }}>新人</th>
                {days.map(d => (
                  <th key={d.format('DD')} style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 400, color: '#8c8c8c', fontSize: 12.5, minWidth: 34 }}>
                    {d.format('D')}
                    <span style={{ display: 'block', fontSize: 10, color: '#bfbfbf' }}>{['日','一','二','三','四','五','六'][d.day()]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(([groupName, items]) => (
                <React.Fragment key={groupName}>
                  <tr>
                    <td colSpan={days.length + 1} style={{ background: '#fafafa', color: '#8c8c8c', fontSize: 12, padding: '6px 10px', borderTop: '1px solid #f0f0f0' }}>
                      ▾ {groupName}
                    </td>
                  </tr>
                  {items.map(e => (
                    <tr key={e.username}>
                      <td style={{ textAlign: 'left', padding: '6px 14px 6px 4px', whiteSpace: 'nowrap', fontSize: 12.5 }}>
                        {e.name}
                        {e.mentorName && <span style={{ color: '#bfbfbf', fontSize: 11 }}>（{e.mentorName}）</span>}
                      </td>
                      {days.map(d => {
                        const period = toPeriod(d.toDate());
                        const { state, reportId } = cellOf(e, period);
                        const clickable = state !== 'future';
                        return (
                          <td key={period} style={{ textAlign: 'center', padding: '6px 4px' }}>
                            {state !== 'future' && (
                              <span
                                title={`${e.name} ${period}：${state === 'ontime' ? '已交' : state === 'late' ? '补交' : '缺交'}`}
                                onClick={() => clickable && onOpenReport(e.username, period)}
                                style={{
                                  display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
                                  background: CELL_COLOR[state],
                                  border: state === 'missing' ? '2px solid #dcdee5' : 'none',
                                  cursor: 'pointer',
                                  boxShadow: period === todayPeriod ? '0 0 0 2px #1677ff55' : undefined,
                                }}
                              />
                            )}
                            {reportId && null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {grouped.length === 0 && !loading && (
                <tr><td colSpan={days.length + 1} style={{ textAlign: 'center', color: '#bfbfbf', padding: 30 }}>暂无新人账号</td></tr>
              )}
            </tbody>
          </table>
        </Spin>
      </div>
    </div>
  );
};

export default DashboardView;
