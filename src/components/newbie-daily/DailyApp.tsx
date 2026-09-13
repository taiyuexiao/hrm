import React, { useState, useEffect, useCallback } from 'react';
import { Segmented, message } from 'antd';
import FillView from './FillView';
import BrowseView from './BrowseView';
import DashboardView from './DashboardView';
import { dailyApi, DailyMeta } from '../../services/dailyApi';

/**
 * 新人培养报告外壳：填报（仅新人）/ 浏览（所有登录用户）/ 看板（mentor、日报领导、超管）
 * 新人默认落在填报页，其余默认浏览页。
 */
const DailyApp: React.FC = () => {
  const [meta, setMeta] = useState<DailyMeta | null>(null);
  // 看板跳浏览：指定新人与周期
  const [browseTarget, setBrowseTarget] = useState<{ username: string; period: string } | null>(null);

  const authUser = (() => {
    try {
      const raw = localStorage.getItem('auth-user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const isNewbie = authUser?.dailyRole === 'newbie';
  const canViewBoard = ['mentor', 'leader'].includes(authUser?.dailyRole) || authUser?.role === 'superadmin';
  const [view, setView] = useState<'fill' | 'browse' | 'board'>(isNewbie ? 'fill' : 'browse');

  useEffect(() => {
    dailyApi.meta().then(res => {
      if (res.success) setMeta({ groups: res.groups, newbies: res.newbies, mentors: res.mentors });
    }).catch(e => message.error('加载日报元数据失败：' + e.message));
  }, []);

  const handleOpenReport = useCallback((username: string, period: string) => {
    setBrowseTarget({ username, period });
    setView('browse');
  }, []);

  const roleHint =
    authUser?.dailyRole === 'mentor' ? '带教老师视图：可浏览、批注、查看看板，带教报告填报第三期开放' :
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
          onChange={v => setView(v as 'fill' | 'browse' | 'board')}
          options={[
            ...(isNewbie ? [{ label: '填报', value: 'fill' }] : []),
            { label: '浏览', value: 'browse' },
            ...(canViewBoard ? [{ label: '看板', value: 'board' }] : []),
          ]}
        />
        <span style={{ color: '#8c8c8c', fontSize: 12.5 }}>{roleHint}</span>
      </div>
      {view === 'fill' && isNewbie && <FillView authUser={authUser} meta={meta} />}
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
