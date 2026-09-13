import React, { useState, useEffect } from 'react';
import { Segmented, message } from 'antd';
import FillView from './FillView';
import BrowseView from './BrowseView';
import { dailyApi, DailyMeta } from '../../services/dailyApi';

/**
 * 新人培养报告外壳：填报（仅新人）/ 浏览（所有登录用户）
 * 新人默认落在填报页，老员工/领导/mentor 默认落在浏览页。
 */
const DailyApp: React.FC = () => {
  const [meta, setMeta] = useState<DailyMeta | null>(null);

  const authUser = (() => {
    try {
      const raw = localStorage.getItem('auth-user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const isNewbie = authUser?.dailyRole === 'newbie';
  const [view, setView] = useState<'fill' | 'browse'>(isNewbie ? 'fill' : 'browse');

  useEffect(() => {
    dailyApi.meta().then(res => {
      if (res.success) setMeta({ groups: res.groups, newbies: res.newbies, mentors: res.mentors });
    }).catch(e => message.error('加载日报元数据失败：' + e.message));
  }, []);

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: '#f0f2f5' }}>
      <div style={{
        background: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1px solid #f0f0f0',
      }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>🌱 新人培养报告</span>
        <Segmented
          value={view}
          onChange={v => setView(v as 'fill' | 'browse')}
          options={[
            ...(isNewbie ? [{ label: '填报', value: 'fill' }] : []),
            { label: '浏览', value: 'browse' },
          ]}
        />
        <span style={{ color: '#8c8c8c', fontSize: 12.5 }}>
          {authUser?.dailyRole === 'mentor' && '带教老师视图：可浏览、批注，带教报告填报第三期开放'}
          {authUser?.dailyRole === 'leader' && '领导视图：可浏览、批注，提交看板第二期开放'}
          {!authUser?.dailyRole && '老员工视图：可浏览、批注'}
        </span>
      </div>
      {view === 'fill' && isNewbie
        ? <FillView authUser={authUser} meta={meta} />
        : <BrowseView authUser={authUser} meta={meta} />}
    </div>
  );
};

export default DailyApp;
