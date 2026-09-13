import React, { useState, useEffect, useCallback } from 'react';
import { Segmented, message } from 'antd';
import FillView from './FillView';
import BrowseView, { BrowseTarget } from './BrowseView';
import DashboardView from './DashboardView';
import MentorFillView from './MentorFillView';
import { dailyApi, DailyMeta } from '../../services/dailyApi';

type ViewKey = 'fill' | 'mentorFill' | 'browse' | 'board';

/**
 * 新人培养报告外壳：
 * 填报（新人）/ 带教填报（mentor）/ 浏览（所有登录用户）/ 看板（mentor、日报领导、超管）
 */
const DailyApp: React.FC = () => {
  const [meta, setMeta] = useState<DailyMeta | null>(null);
  // 看板等外部跳转浏览页的目标
  const [browseTarget, setBrowseTarget] = useState<BrowseTarget | null>(null);

  const authUser = (() => {
    try {
      const raw = localStorage.getItem('auth-user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const isNewbie = authUser?.dailyRole === 'newbie';
  const isMentor = authUser?.dailyRole === 'mentor';
  const canViewBoard = ['mentor', 'leader'].includes(authUser?.dailyRole) || authUser?.role === 'superadmin';
  const [view, setView] = useState<ViewKey>(isNewbie ? 'fill' : isMentor ? 'mentorFill' : 'browse');

  useEffect(() => {
    dailyApi.meta().then(res => {
      if (res.success) setMeta({ groups: res.groups, newbies: res.newbies, mentors: res.mentors });
    }).catch(e => message.error('加载日报元数据失败：' + e.message));
  }, []);

  const handleOpenReport = useCallback((target: BrowseTarget) => {
    setBrowseTarget(target);
    setView('browse');
  }, []);

  const roleHint =
    authUser?.dailyRole === 'mentor' ? '带教老师视图：填报带教报告、浏览、批注、查看看板' :
    authUser?.dailyRole === 'leader' ? '领导视图：可浏览、批注、查看看板' :
    !authUser?.dailyRole ? '老员工视图：可浏览、批注' : '';

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: '#f0f2f5' }}>
      <div style={{
        background: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1px solid #f0f0f0',
      }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>🌱 新人培养报告</span>
        <Segmented
          value={view}
          onChange={v => setView(v as ViewKey)}
          options={[
            ...(isNewbie ? [{ label: '填报', value: 'fill' }] : []),
            ...(isMentor ? [{ label: '带教填报', value: 'mentorFill' }] : []),
            { label: '浏览', value: 'browse' },
            ...(canViewBoard ? [{ label: '看板', value: 'board' }] : []),
          ]}
        />
        <span style={{ color: '#8c8c8c', fontSize: 12.5 }}>{roleHint}</span>
      </div>
      {view === 'fill' && isNewbie && <FillView authUser={authUser} meta={meta} />}
      {view === 'mentorFill' && isMentor && <MentorFillView authUser={authUser} meta={meta} />}
      {view === 'browse' && (
        <BrowseView
          authUser={authUser}
          meta={meta}
          target={browseTarget}
          onTargetConsumed={() => setBrowseTarget(null)}
        />
      )}
      {view === 'board' && canViewBoard && <DashboardView onOpenReport={handleOpenReport} meta={meta} />}
    </div>
  );
};

export default DailyApp;
